"""Tests de build_jobs — sans GPU, sans ComfyUI, execution instantanee.

    python_embeded\\python.exe ComfyUI\\output\\OFM\\AUTOMATION\\tests\\test_build_jobs.py

Le test central est le premier : **mode compatibilite**. Sans niveau d'intensite
demande, build_jobs doit assembler exactement le meme prompt qu'avant la refonte du
parcours creatif. L'algorithme d'origine est reimplemente ici (`prompt_avant_refonte`)
et sert d'oracle : si les deux divergent d'un seul caractere, le test tombe.

C'est ce qui garantit que la CLI existante et tout batch lance sans les nouveaux
parametres produisent le meme resultat qu'avant.
"""
import sys
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb      # noqa: E402

SCENES = lb.scenes_path("lena")
# Banque telle qu'elle etait avant la migration : tenues encore en dur dans les
# prompts, aucun champ wardrobe. C'est l'entree du test de non-regression, et
# c'est une FIXTURE versionnee : elle est figee pour toujours, contrairement a
# scenes.json qui vit avec la production. Ne jamais la regenerer ni la mettre
# a jour — la modifier revient a desactiver le test byte-exact.
SCENES_AVANT = HERE / "fixtures" / "scenes-byte-exact.json"
CREATIVE = lb.load_creative("lena")
ECHECS = []


def verifie(condition, message):
    if condition:
        print(f"  ok   {message}")
    else:
        print(f"  ECHEC {message}")
        ECHECS.append(message)


def filtres(**kw):
    base = dict(scene=None, category=None, format=None, count=None, limit=None,
                seed=1234, no_variants=False)
    base.update(kw)
    return SimpleNamespace(**base)


# --------------------------------------------------------------------- oracle
def prompt_avant_refonte(data, scene, variant):
    """Assemblage tel qu'il etait avant la refonte. Ne jamais le modifier."""
    prefix, anchor, texture = data["prefix"], data["anchor"], data["texture"]
    direction = (data.get("direction") or "").strip()
    corps = scene["prompt"] + (", " + variant if variant else "")
    return ", ".join(x for x in [f"{prefix} {anchor}", corps, texture, direction] if x)


def test_compatibilite():
    print("\n[1] non-regression — banque d'avant la migration, aucun parametre nouveau")
    if not SCENES_AVANT.exists():
        verifie(False, f"{SCENES_AVANT.name} introuvable — test impossible")
        return
    data = lb.load_json(SCENES_AVANT)
    jobs = lb.build_jobs(SCENES_AVANT, filtres(), creative=CREATIVE)

    attendus = []
    for scene in data["scenes"]:
        prompts = [(scene["prompt"], "")]
        for v in scene.get("variants", []):
            prompts.append((scene["prompt"] + ", " + v, v))
        for _, variant in prompts:
            for i in range(scene.get("count", 1)):
                attendus.append((scene["id"], variant, i + 1,
                                 prompt_avant_refonte(data, scene, variant)))

    verifie(len(jobs) == len(attendus),
            f"nombre de jobs identique ({len(jobs)} vs {len(attendus)})")
    if len(jobs) != len(attendus):
        return

    divergences = 0
    for job, (sid, variant, index, prompt) in zip(jobs, attendus):
        if (job["scene"], job["variant"], job["index"], job["prompt"]) != \
           (sid, variant, index, prompt):
            divergences += 1
            if divergences == 1:
                print(f"        premiere divergence sur {sid} :")
                print(f"        attendu : {prompt[:110]}")
                print(f"        obtenu  : {job['prompt'][:110]}")
    verifie(divergences == 0,
            f"prompts identiques a l'octet pres sur {len(jobs)} jobs")
    verifie(all(j["intensity"] == 0 for j in jobs), "niveau 0 par defaut")
    verifie(all(j["tone"] == "" for j in jobs), "aucun ton applique")


def test_no_variants():
    print("\n[2] --no-variants : une image par scene, la plus simple")
    data = lb.load_json(SCENES)
    jobs = lb.build_jobs(SCENES, filtres(no_variants=True), creative=CREATIVE)
    # sans niveau demande on est au palier 0 : les scenes dont la bande commence
    # plus haut (une scene intime, par exemple) n'y sont pas — c'est voulu
    attendu = sum(s.get("count", 1) for s in data["scenes"]
                  if lb.scene_band(s)[0] == 0)
    verifie(len(jobs) == attendu, f"{len(jobs)} jobs (attendu {attendu})")
    verifie(all(j["variant"] == "" for j in jobs), "aucune variante")
    verifie(len({(j["scene"], j["index"]) for j in jobs}) == len(jobs),
            "une seule tenue par scene — pas de doublon scene/index")
    # Le repli --no-variants doit valoir aussi sur la banque FIGEE, et on la
    # compare a SA PROPRE attente — pas au compte de la banque vivante.
    # Celle-ci grandit : le 25/08/2026 l'ajout d'une seule scene de niveau 0
    # faisait echouer un test qui ne parlait pourtant pas d'elle. L'egalite
    # entre les deux banques ne tenait que par coincidence.
    # Plus de garde `exists()` ici : la fixture est versionnee, son absence est
    # un echec a signaler, pas un cas a sauter en silence.
    avant_data = lb.load_json(SCENES_AVANT)
    avant = lb.build_jobs(SCENES_AVANT, filtres(no_variants=True),
                          creative=CREATIVE)
    attendu_avant = sum(s.get("count", 1) for s in avant_data["scenes"]
                        if lb.scene_band(s)[0] == 0)
    verifie(len(avant) == attendu_avant,
            f"banque figee : meme repli ({len(avant)} jobs)")


def test_filtrage_intensite():
    print("\n[3] filtrage par niveau d'intensite")
    data = lb.load_json(SCENES)
    bande = {s["id"]: lb.scene_band(s) for s in data["scenes"]}
    precedent = None
    for niveau in (0, 1, 2, 3):
        jobs = lb.build_jobs(SCENES, filtres(intensity=niveau), creative=CREATIVE)
        scenes = {j["scene"] for j in jobs}
        eligibles = {i for i, (lo, hi) in bande.items() if lo <= niveau <= hi}
        verifie(scenes == eligibles,
                f"niveau {niveau} : {len(scenes)} scene(s), conforme a la bande declaree")
        if precedent is not None:
            # Une scene peut APPARAITRE en montant — c'est ce que fait une
            # intention reservee aux niveaux hauts (`boudoir`, 26/08/2026, dont
            # les scenes n'existent qu'au cran Suggestif pour servir de base a
            # l'edition). Ce qui reste interdit, c'est qu'elle apparaisse par
            # accident : toute nouvelle venue doit avoir ce niveau pour PLANCHER
            # declare. Une scene dont la bande commence plus bas et qui
            # reapparait apres avoir disparu serait, elle, un vrai defaut.
            surprises = {i for i in scenes - precedent if bande[i][0] != niveau}
            verifie(not surprises,
                    f"niveau {niveau} : toute scene qui apparait a ce niveau "
                    f"pour plancher{'' if not surprises else ' — ' + ', '.join(sorted(surprises))}")
        precedent = scenes


def test_assemblage_nouveau():
    print("\n[4] assemblage avec ton et intention")
    jobs = lb.build_jobs(SCENES, filtres(intensity=0, tone="elegant"),
                         creative=CREATIVE)
    if not jobs:
        verifie(False, "au moins un job produit")
        return
    ton = lb.by_key(CREATIVE["tones"], "elegant")["prompt_add"]
    verifie(all(ton in j["prompt"] for j in jobs), "le fragment de ton est present")
    verifie(all(j["tone"] == "elegant" for j in jobs), "le ton est journalise")

    data = lb.load_json(SCENES)
    anchor = data["anchor"]
    verifie(all(j["prompt"].startswith(f"{data['prefix']} {anchor}") for j in jobs),
            "l'ancre d'identite reste en tete de chaque prompt")
    verifie(all(j["prompt"].rstrip().endswith(data["texture"].split(", ")[-1])
                or data["texture"] in j["prompt"] for j in jobs),
            "la texture globale est conservee")

    inconnu = False
    try:
        lb.build_jobs(SCENES, filtres(intensity=9), creative=CREATIVE)
    except ValueError:
        inconnu = True
    verifie(inconnu, "un niveau inconnu leve une erreur explicite")

    # Le ton ne doit JAMAIS reduire le choix de scenes : c'est un modificateur de
    # prompt, pas un filtre. Un ton filtrant menait a des culs-de-sac (lifestyle +
    # elegant ne laissait aucune scene).
    sans = {j["scene"] for j in lb.build_jobs(SCENES, filtres(intensity=0),
                                              creative=CREATIVE)}
    for t in CREATIVE["tones"]:
        avec = {j["scene"] for j in lb.build_jobs(
            SCENES, filtres(intensity=0, tone=t["key"]), creative=CREATIVE)}
        verifie(avec == sans, f"ton « {t['label']} » : le choix de scenes est intact")

    for i in CREATIVE["intentions"]:
        for t in CREATIVE["tones"]:
            n = len(lb.build_jobs(SCENES, filtres(intensity=0, intention=i["key"],
                                                  tone=t["key"]), creative=CREATIVE))
            m = len(lb.build_jobs(SCENES, filtres(intensity=0, intention=i["key"]),
                                  creative=CREATIVE))
            if n != m:
                verifie(False, f"{i['key']} + {t['key']} : {n} vs {m} sans ton")
                return
    verifie(True, "aucune combinaison intention x ton ne perd de scene")


def test_wardrobe():
    print("\n[5] selection de la tenue")
    data = lb.load_json(SCENES)
    avec = [s for s in data["scenes"] if s.get("wardrobe")]
    if not avec:
        print("  (aucune scene ne declare de wardrobe — migration pas encore faite)")
        return
    for scene in avec:
        lo, hi = lb.scene_band(scene)
        for niveau in range(lo, hi + 1):
            tenues = lb.wardrobe_for(scene, niveau, CREATIVE)
            verifie(bool(tenues) and all(t for t in tenues),
                    f"{scene['id']} niveau {niveau} : tenue definie ({len(tenues)})")
    # une tenue absente a un niveau doit retomber sur le niveau inferieur
    s = {"wardrobe": {"0": "a plain shirt"}}
    verifie(lb.wardrobe_for(s, 2, CREATIVE) == ["a plain shirt"],
            "repli sur le niveau inferieur quand le niveau demande est absent")
    # une scene non migree ne recoit AUCUN fragment de tenue : son prompt en porte
    # deja une, en injecter une seconde produirait deux tenues concurrentes
    verifie(lb.wardrobe_for({}, 2, CREATIVE) == [""],
            "aucune tenue injectee quand la scene n'en declare pas")


def test_garde_fou_visage():
    print("\n[6] garde-fou : aucun fragment ne decrit le visage")
    for frag in ("wearing a red dress, delicate freckles across her nose",
                 "close shot, almond eyes and full lips",
                 "sharp jawline, high cheekbones"):
        leve = False
        try:
            lb.assert_no_face([frag], "test")
        except lb.FaceInPromptError:
            leve = True
        verifie(leve, f"rejete : {frag[:46]}…")

    data = lb.load_json(SCENES)
    propre = True
    for s in data["scenes"]:
        frags = [s["prompt"], *s.get("variants", [])]
        wd = s.get("wardrobe") or {}
        for v in wd.values():
            frags.extend(v if isinstance(v, list) else [v])
        try:
            lb.assert_no_face(frags, s["id"])
        except lb.FaceInPromptError as e:
            propre = False
            print(f"        {e}")
    verifie(propre, "la banque de scenes est propre")

    taxo = True
    for cle in ("intentions", "tones", "intensity"):
        for item in CREATIVE.get(cle, []):
            try:
                lb.assert_no_face([item.get("prompt_add", ""),
                                   item.get("wardrobe", "")], f"{cle}/{item.get('key')}")
            except lb.FaceInPromptError as e:
                taxo = False
                print(f"        {e}")
    verifie(taxo, "creative.json est propre")


def test_composeur():
    print("\n[7] composeur : normalisation d'une proposition")
    import compose

    brut = {"id": "Jardin Matin!!", "intention": "nawak", "format": "5:7",
            "tags": ["Interieur", "matin", "matin", "debout", "x", "y"],
            "tones": ["doux", "inconnu", "intime"],
            "prompt": "standing in a garden, wearing a red dress, morning light",
            "wardrobe_0": "wearing a plain shirt.", "wardrobe_1": "a loose shirt",
            "variants": ["overcast light", "wearing a coat"]}
    sc = compose.clean(brut, CREATIVE)

    verifie(sc["id"] == "jardin_matin", f"id normalise ({sc['id']})")
    verifie(sc["intention"] == "lifestyle",
            f"intention inconnue repliee sur un defaut ({sc['intention']})")
    verifie(sc["format"] == "4:5", "format invalide repli sur 4:5")
    verifie(sc["tones"] == ["doux", "intime"], f"tons hors taxonomie jetes ({sc['tones']})")
    verifie(len(sc["tags"]) <= 4 and len(set(sc["tags"])) == len(sc["tags"]),
            f"tags dedupliques et plafonnes ({sc['tags']})")
    verifie("wearing" not in sc["prompt"].lower(),
            f"tenue retiree du prompt ({sc['prompt']})")
    verifie(sc["wardrobe"]["0"] == "a plain shirt",
            f"tenue nettoyee de 'wearing' et du point ({sc['wardrobe']['0']!r})")
    # Depuis le 26/08/2026 `intensity` ne porte que le niveau MINIMUM : le
    # maximum se deduit des tenues declarees (lb.scene_band). Deux champs disaient
    # la meme chose, et la tenue faisait foi de toute facon.
    verifie(sc["intensity"] == 0, f"niveau minimum seul ({sc['intensity']})")
    verifie("category" not in sc, "plus de `category` : c'est l'intention")
    verifie(lb.scene_band(sc) == (0, 1),
            f"bande deduite des tenues ({lb.scene_band(sc)})")
    verifie(sc["variants"] == ["overcast light"],
            f"variante de TENUE ecartee ({sc['variants']})")

    # une proposition sans aucune tenue ne doit pas produire de scene bancale
    vide = compose.clean({"id": "x", "prompt": "a room"}, CREATIVE)
    verifie(vide["wardrobe"] and all(vide["wardrobe"].values()),
            "une tenue de repli est toujours presente")

    # les alertes sont un panneau, pas un mur : elles signalent sans bloquer
    a = compose.alertes({"prompt": "wet hair and tanned skin", "wardrobe": {},
                         "variants": []})
    verifie(len(a) >= 2, f"cheveux et peau signales ({len(a)} alerte(s))")
    verifie(compose.alertes({"prompt": "a quiet room", "wardrobe": {}, "variants": []}) == [],
            "aucune alerte sur une scene propre")


def main():
    print("=" * 72)
    print("build_jobs — tests")
    print("=" * 72)
    for t in (test_compatibilite, test_no_variants, test_filtrage_intensite,
              test_assemblage_nouveau, test_wardrobe, test_garde_fou_visage,
              test_composeur):
        t()
    print("\n" + "=" * 72)
    if ECHECS:
        print(f"{len(ECHECS)} ECHEC(S) :")
        for e in ECHECS:
            print(f"  - {e}")
        return 1
    print("tout est vert")
    return 0


if __name__ == "__main__":
    sys.exit(main())
