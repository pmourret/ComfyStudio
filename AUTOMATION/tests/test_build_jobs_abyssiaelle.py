"""build_jobs verrouille pour Abyssiaelle -- test a l'octet pres (CLAUDE.md §8.3).

build_jobs() lui-meme est deja generalise et teste exhaustivement contre le
contenu de lena (test_build_jobs.py) : ce fichier ne reteste pas la mecanique
generique (filtrage par niveau, repli de tenue, matrice ton x intention...),
il verrouille l'ASSEMBLAGE REEL d'Abyssiaelle -- prefix/anchor/texture propres
a elle (scenes.json), tons/intentions propres a elle (creative.json). Si
l'un des deux personnages divergeait silencieusement d'un changement dans
prompt.py, ce test le verrait la ou test_build_jobs.py ne peut pas (il ne lit
que scenes.json de lena).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_build_jobs_abyssiaelle.py
"""
import sys
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb      # noqa: E402

CHARACTER = "abyssiaelle"
SCENES = lb.scenes_path(CHARACTER)
CREATIVE = lb.load_creative(CHARACTER)
ECHECS = []


def verifie(condition, message):
    if condition:
        print(f"  ok   {message}")
    else:
        print(f"  ECHEC {message}")
        ECHECS.append(message)


def filtres(**kw):
    base = dict(scene=None, category=None, format=None, count=None, limit=None,
                seed=1234, no_variants=True, intensity=0, tone=None, intention=None)
    base.update(kw)
    return SimpleNamespace(**base)


# --------------------------------------------------------------------- oracle
def oracle(data, scene, tenue, tone_add="", intention_add="", variant=""):
    """Reimplementation independante de l'assemblage courant (apres_scene) --
    ne PAS l'aligner sur un bug de prompt.py, c'est l'inverse qui doit se
    produire si les deux divergent un jour."""
    prefix, anchor, texture = data["prefix"], data["anchor"], data["texture"]
    direction = (data.get("direction") or "").strip()
    habit = f"wearing {tenue}" if tenue else ""
    morceaux = [f"{prefix} {anchor}", scene["prompt"], habit,
                tone_add, intention_add, variant, texture, direction]
    return ", ".join(m for m in morceaux if m)


def scene_by_id(data, sid):
    return next(s for s in data["scenes"] if s["id"] == sid)


def test_byte_exact_sans_ton():
    print("\n[1] assemblage a l'octet pres -- sans ton ni intention (niveau 0)")
    data = lb.load_json(SCENES)
    jobs = lb.build_jobs(SCENES, filtres(), CHARACTER, CREATIVE)
    verifie(len(jobs) == len(data["scenes"]),
            f"un job par scene de niveau 0 ({len(jobs)}/{len(data['scenes'])})")
    for job in jobs:
        scene = scene_by_id(data, job["scene"])
        tenue = scene["wardrobe"]["0"]
        attendu = oracle(data, scene, tenue)
        verifie(job["prompt"] == attendu,
                f"{scene['id']} : prompt identique a l'oracle")
        if job["prompt"] != attendu:
            print(f"        attendu : {attendu}")
            print(f"        obtenu  : {job['prompt']}")


def test_byte_exact_avec_ton_et_variante():
    print("\n[2] assemblage a l'octet pres -- avec ton + variante")
    data = lb.load_json(SCENES)
    jobs = lb.build_jobs(SCENES, filtres(no_variants=False, tone="sombre",
                                         scene=["camp_soir"]),
                         CHARACTER, CREATIVE)
    verifie(len(jobs) == 2, f"scene + sa variante = 2 jobs ({len(jobs)})")
    scene = scene_by_id(data, "camp_soir")
    tenue = scene["wardrobe"]["0"]
    ton = lb.by_key(CREATIVE["tones"], "sombre")["prompt_add"]
    for job in jobs:
        attendu = oracle(data, scene, tenue, tone_add=ton, variant=job["variant"])
        verifie(job["prompt"] == attendu,
                f"variante {job['variant']!r} : prompt identique a l'oracle")
        if job["prompt"] != attendu:
            print(f"        attendu : {attendu}")
            print(f"        obtenu  : {job['prompt']}")


def test_trigger_word_absent_du_prompt_assemble():
    print("\n[3] le mot declencheur du LoRA n'est PAS dans le prompt assemble")
    # identity.apply() le prefixe lui-meme depuis config.json (lora_sdxl.py) --
    # le dupliquer dans scenes.json/creative.json le repeterait deux fois dans
    # le prompt final envoye a ComfyUI.
    cfg = lb.load_config(CHARACTER)
    trigger = (cfg.get("identity", {}).get("lora") or {}).get("trigger_word", "")
    verifie(bool(trigger), f"config.json declare un mot declencheur ({trigger!r})")
    jobs = lb.build_jobs(SCENES, filtres(), CHARACTER, CREATIVE)
    verifie(all(trigger not in j["prompt"] for j in jobs),
            "aucune scene n'inclut deja le mot declencheur")


def test_garde_fou_visage():
    print("\n[4] garde-fou : aucun fragment d'Abyssiaelle ne decrit le visage")
    data = lb.load_json(SCENES)
    propre = True
    for s in data["scenes"]:
        frags = [s["prompt"], *s.get("variants", [])]
        for v in (s.get("wardrobe") or {}).values():
            frags.extend(v if isinstance(v, list) else [v])
        try:
            lb.assert_no_face(frags, s["id"])
        except lb.FaceInPromptError as e:
            propre = False
            print(f"        {e}")
    verifie(propre, "scenes.json est propre")

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


def main():
    print("=" * 72)
    print("build_jobs -- Abyssiaelle (verrou a l'octet pres, CLAUDE.md §8.3)")
    print("=" * 72)
    for t in (test_byte_exact_sans_ton, test_byte_exact_avec_ton_et_variante,
              test_trigger_word_absent_du_prompt_assemble, test_garde_fou_visage):
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
