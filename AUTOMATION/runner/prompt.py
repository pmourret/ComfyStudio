"""Assemblage du prompt : donnees de personnage, filtrage de scenes, build_jobs.

Un seul assembleur de prompt par personnage, verrouille a l'octet pres par
tests/test_build_jobs.py (CLAUDE.md §8.3) — toute modification ici doit
laisser ce test vert sans toucher a la fixture tests/fixtures/scenes-byte-
exact.json.
"""
import json
import random
import re
from types import SimpleNamespace

from . import OFM, load_json

import env_config  # noqa: E402  (AUTOMATION/ sur le path via runner/__init__.py)
import universe    # noqa: E402
import worlds      # noqa: E402

# -------------------------------------------------------- donnees de personnage
# CHARACTERS/<character_id>/{character,config,scenes,creative}.json : donnees
# propres a un personnage, jamais melangees a une autre. Git-ignore (ADR-0005).
# character.json est le registre personnage (J4, CLAUDE.md §7) : univers associe,
# types de contenu actifs, interrupteur NSFW. L'univers lui-meme vit dans
# AUTOMATION/universe.py (axe distinct, versionne).
def character_dir(character_id):
    return OFM / "CHARACTERS" / character_id


def character_json_path(character_id):
    return character_dir(character_id) / "character.json"


def config_path(character_id):
    return character_dir(character_id) / "config.json"


def scenes_path(character_id):
    return character_dir(character_id) / "scenes.json"


def creative_path(character_id):
    return character_dir(character_id) / "creative.json"


def load_character(character_id):
    """Entree du registre personnage. Erreur explicite si elle manque —
    un dossier CHARACTERS/<id>/ sans character.json est invalide, pas un cas
    a rattraper en silence."""
    path = character_json_path(character_id)
    if not path.is_file():
        raise FileNotFoundError(
            f"registre personnage absent : {path.relative_to(OFM)} — chaque "
            f"personnage doit declarer son univers et ses types de contenu (J4)")
    return load_json(path)


def character_universe(character_id):
    """Id de l'univers du personnage (fixe a sa creation, CLAUDE.md §3-§4)."""
    return load_character(character_id).get("universe")


def character_style(character_id):
    """Style de sortie du personnage (fige a sa creation, CLAUDE.md §3). Repli
    `realiste` si le registre ne le porte pas encore."""
    return load_character(character_id).get("output_style") or "realiste"


def character_type(character_id):
    """Type de personnage : metier, panel d'outils, taxonomie de scenes (fige a
    la creation, CLAUDE.md §3, ADR-0012). Repli sur l'univers tant que le
    registre ne porte pas encore la cle — en V1 l'id du type == l'id du pack."""
    reg = load_character(character_id)
    return reg.get("type") or reg.get("universe")


def character_world(character_id):
    """Monde du personnage : cadre et assets de monde (fige a la creation,
    CLAUDE.md §3, ADR-0012). None si le registre ne le porte pas encore."""
    return load_character(character_id).get("world")


def list_characters():
    """Ids des personnages du registre : dossiers CHARACTERS/<id>/ portant un
    character.json, ordre alphabetique. [] si CHARACTERS/ absent — l'UI ne
    suppose jamais ce dossier present (ADR-0005). Sert au sas d'entree (J7bis)."""
    root = OFM / "CHARACTERS"
    if not root.is_dir():
        return []
    return sorted(p.parent.name for p in root.glob("*/character.json"))


_CID_RE = re.compile(r"[a-z][a-z0-9_-]*$")


def _write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def create_character(cid, name, character_type, output_style, world, base_gelee):
    """Cree CHARACTERS/<cid>/ pour le wizard « nouveau personnage » (J7bis).

    Ecrit character.json + config.json (aux DEFAUTS du pack, jamais mesures ici
    — ROADMAP J7bis : recalibrage plus tard dans Reglages) + scenes.json /
    creative.json amorces depuis le monde + l'arborescence INPUTS/PROD/EXPORT.

    Le pack se DEDUIT de (type, style) via universe.resolve — jamais choisi. Le
    graphe est celui du pack (universe.json/workflow) : le personnage y est
    RATTACHE, aucun fichier de graphe n'est cree (CLAUDE.md §8.11). Type, style
    et monde sont figes ici (CLAUDE.md §3-§4).

    Leve avant toute ecriture : ValueError (cid invalide, style absent du pack),
    FileExistsError (cid deja pris), UnresolvedPackError / UnknownWorldError /
    IncompatibleWorldError. Rend le cid.
    """
    if not _CID_RE.match(cid or ""):
        raise ValueError(f"character_id invalide : {cid!r} — attendu un slug "
                         f"minuscule (^[a-z][a-z0-9_-]*$)")
    dest = OFM / "CHARACTERS" / cid
    if dest.exists():
        raise FileExistsError(f"le personnage {cid!r} existe deja : {dest}")

    pack = universe.resolve(character_type, output_style)     # UnresolvedPackError
    if output_style not in universe.style_names(pack):
        raise ValueError(f"style {output_style!r} absent du pack {pack!r} "
                         f"({', '.join(universe.style_names(pack))})")
    if not worlds.exists(world):
        raise worlds.UnknownWorldError(f"monde inconnu : {world!r}")
    family = universe.model_family(pack)
    worlds.assert_compatible(world, family)                   # IncompatibleWorldError
    if not base_gelee:
        raise ValueError("base_gelee requis : image d'identite gelee (fournie "
                         "ou generee), c'est ce que le verrou charge")

    dft = universe.load_character_defaults(pack)

    character = {
        "id": cid,
        "name": name or cid,
        "universe": pack,
        "type": character_type,
        "world": world,
        "output_style": output_style,
        "content_types": {"image": True, "video": False, "voice": False,
                          "staging": False},
        "nsfw": False,
        "_notes": [
            f"Cree par le wizard « nouveau personnage » (J7bis). Pack {pack!r}",
            f"deduit de (type={character_type!r}, style={output_style!r}) ; monde",
            f"{world!r}. type / style / world figes a la creation (CLAUDE.md §3-§4).",
            "config.json est aux DEFAUTS du pack : identity et qc portent",
            "`measured: false`, a recalibrer dans Reglages avant de s'y fier.",
        ],
    }

    config = {
        "workflow": universe.capability_graph(pack, universe.PRODUCE),
        "base_gelee": base_gelee,
        "identity": dict(dft.get("identity") or {}),
        "preset": dict(dft.get("preset") or {}),
        "formats": dict(dft.get("formats") or {}),
        "export_sizes": dict(dft.get("export_sizes") or {}),
        "qc": dict(dft.get("qc") or {}),
        "export": dict(dft.get("export") or {"enabled": True, "format": "jpg",
                                             "quality": 92}),
    }

    seed = dft.get("scenes_seed") or {}
    fmt = next(iter(config["formats"]), "1:1")
    # Tampon de monde, racine et par scene (ADR-0014 §3). Une banque nait
    # tamponnee : c'est ce qui permet a /api/scenes d'etre STRICT ensuite au
    # lieu de reparer en silence. `origin` dit d'ou vient la scene — ici du
    # catalogue du monde, plus tard « manual » ou « compose ».
    # `merge_scene` (ADR-0015) fait le travail : le cadre (label/intention/
    # prompt) vient du lieu, l'overlay ci-dessous est le reglage de
    # personnage par defaut a la naissance — tenue VIDE, le catalogue du
    # monde n'habille pas ses lieux (ADR-0014 §2). Meme fonction que celle
    # que la Banque appelle a chaque chargement/enregistrement : une scene
    # nee ici a deja un prompt utilisable par build_jobs sans jamais passer
    # par la Banque.
    scenes = {
        "prefix": seed.get("prefix", ""),
        "anchor": seed.get("anchor", ""),
        "texture": seed.get("texture", ""),
        "direction": seed.get("direction", ""),
        "world": world,
        "scenes": [
            worlds.merge_scene(world, s["id"], {
                "tones": [], "intensity": 0, "format": fmt, "count": 1,
                "wardrobe": {"0": ""}, "variants": []})
            for s in worlds.places(world) if s.get("id")
        ],
    }

    creative = dict(dft.get("creative_seed") or {
        "intentions": [], "tones": [],
        "intensity": [{"level": 0, "key": "sfw", "label": "SFW strict",
                       "pipeline": family, "prompt_add": "", "export": True,
                       "requires": None}],
        "assemblage": {"wardrobe_position": "apres_scene"},
    })
    for lvl in creative.get("intensity", []):            # destination par personnage
        # Le palier qui EDITE range dans l'arbre NSFW du personnage
        # (PROD/<CID>/_NSFW, cf. nsfw_batch.out_root), les autres dans son arbre
        # SFW. La destination affichee doit etre la verite disque : c'est elle
        # que la confirmation de palier montre a l'utilisateur.
        edite = str(lvl.get("pipeline") or "").endswith("+edit")
        lvl.setdefault("destination", f"PROD/{cid.upper()}/_NSFW" if edite
                       else f"PROD/{cid.upper()}")

    dest.mkdir(parents=True)
    try:
        for sub in ("INPUTS/CHARACTER", "INPUTS/SCENE", "INPUTS/REALISME",
                    "INPUTS/POSE", "PROD/OK", "PROD/A_REVOIR", "PROD/REJET",
                    "PROD/ARCHIVE", "EXPORT"):
            (dest / sub).mkdir(parents=True, exist_ok=True)
        _write_json(dest / "character.json", character)
        _write_json(dest / "config.json", config)
        _write_json(dest / "scenes.json", scenes)
        _write_json(dest / "creative.json", creative)
    except Exception:
        import shutil
        shutil.rmtree(dest, ignore_errors=True)          # pas de demi-personnage
        raise
    return cid


def content_type_active(character_id, kind):
    """Un type de contenu (image / video / voice / staging) est-il actif pour ce
    personnage. Axe independant de l'univers (ADR-0004) : en V1 seul `image`
    l'est, partout."""
    return bool(load_character(character_id).get("content_types", {}).get(kind))


def load_config(character_id):
    """config.json d'un personnage, `comfy_url` toujours remplace par le
    reglage MACHINE (`env_config.comfy_url()`), jamais celui ecrit dans le
    fichier : un seul ComfyUI pour toute la plateforme, ce n'est plus un
    reglage par personnage (2026-09-01). Tout appelant qui lit `cfg["comfy_url"]`
    continue de fonctionner sans changement — seule la source change."""
    cfg = load_json(config_path(character_id))
    cfg["comfy_url"] = env_config.comfy_url()
    return cfg


def load_scenes(character_id):
    return load_json(scenes_path(character_id))


# --------------------------------------------------------- vocabulaire creatif
# Aucun fragment ajoute au prompt ne doit redecrire le visage : il entrerait en
# concurrence avec PuLID et ferait baisser le score d'identite (voir CLAUDE.md).
# L'ancre (cheveux / yeux / taches de rousseur) et la texture globale sont les
# seuls endroits ou ce vocabulaire est legitime : ils sont exclus du controle.
FORBIDDEN_FACE = re.compile(
    r"\b(faces?|facial|eyes?|eyebrows?|eyelashes?|nose|lips?|mouth|jawlines?|jaw|"
    r"cheekbones?|chin|complexion|freckles?|ethnicity)\b", re.I)


class FaceInPromptError(ValueError):
    """Un fragment de scene ou de taxonomie decrit le visage."""


def assert_no_face(fragments, origine):
    for frag in fragments:
        m = FORBIDDEN_FACE.search(frag or "")
        if m:
            raise FaceInPromptError(
                f"{origine} : ce fragment decrit le visage ({m.group(0)!r}) — "
                f"c'est PuLID qui le porte, jamais le prompt. Fragment : {frag!r}")


# Vocabulaire SIGNALE, pas interdit — le pendant souple de FORBIDDEN_FACE.
# L'ancre decrit deja les cheveux et la texture de peau : un fragment qui les
# redecrit entre en concurrence avec elle. Mais tout n'est pas fautif —
# « wind in the hair » decrit un mouvement, « wet hair » decrit les cheveux, et
# aucune regex ne fait la difference. On signale, l'humain tranche.
# Vit ici, avec FORBIDDEN_FACE : c'est le vocabulaire de prompt du projet, et il
# sert a la fois au composeur de scenes et a l'instruction d'edition NSFW.
WATCH_FACE = re.compile(r"\b(hair|skin|tanned?|pale|blonde?|brunette|"
                        r"redhead|makeup|lipstick)\b", re.I)


def load_creative(character_id):
    """Taxonomie creative du personnage, intentions/tons FUSIONNES avec la
    base de son monde (J8.3, ADR-0019 : `worlds.merge_creative_vocab` — le
    monde fournit la base, une `key` du personnage la remplace ou s'ajoute).
    Seul point de fusion sur le chemin de `build_jobs` : ni `build_jobs` ni
    aucun de ses autres appelants ne savent qu'un monde existe (meme
    principe qu'ADR-0015 §4 pour les scenes — la fusion vit en amont,
    jamais dans l'assemblage).

    Absente = le runner retombe sur l'ancien comportement (creative.json est
    optionnel, contrairement a config.json/scenes.json). `intensity` et
    `assemblage` ne sont jamais fusionnes : lies au pack (capacites, J8.2),
    pas au monde."""
    path = creative_path(character_id)
    data = (load_json(path) if path.exists()
           else {"intentions": [], "tones": [], "intensity": []})
    world = character_world(character_id)
    if world and worlds.exists(world):
        intentions, tones = worlds.merge_creative_vocab(
            world, data.get("intentions", []), data.get("tones", []))
        data = {**data, "intentions": intentions, "tones": tones}
    return data


def by_key(items, key):
    return next((it for it in items if it.get("key") == key), None)


def by_level(creative, level):
    return next((it for it in creative.get("intensity", [])
                 if it.get("level") == level), None)


def scene_intention(scene):
    """Defaut de compatibilite : sans champ `intention`, la categorie fait foi."""
    return scene.get("intention") or scene.get("category")


def scene_band(scene):
    """Bande de niveaux d'une scene : (minimum, maximum).

    Le maximum est DEDUIT de la tenue la plus haute definie. Une scene existe a un
    niveau si elle sait comment y habiller le personnage, pas autrement — et
    `wardrobe_for` prenait deja la tenue la plus haute <= niveau, donc la tenue
    faisait deja foi en pratique.

    Avant le 26/08/2026 il fallait saisir ce maximum a la main, en plus des
    tenues : deux champs pour la meme information. Trois scenes declaraient un
    maximum de 3, sans aucun effet — au cran NSFW le filtre tourne au niveau de
    base, seul le minimum compte. Verifie scene par scene : la bande obtenue est
    identique pour les 16 scenes de la banque.

    `intensity` accepte donc desormais un entier (le minimum). Une liste
    [bas, haut] continue d'etre lue pour son `bas` : le `haut` est ignore au
    profit des tenues, jamais en contradiction avec elles.
    """
    brut = scene.get("intensity")
    if isinstance(brut, bool):                       # bool est un int : a exclure
        lo = 0
    elif isinstance(brut, (int, float)):
        lo = int(brut)
    elif brut:
        lo = int(brut[0])
    else:
        lo = 0
    niveaux = [int(k) for k in (scene.get("wardrobe") or {}) if str(k).isdigit()]
    # sans tenue (banque non migree), l'ancien defaut [0, 1] s'applique
    hi = max(niveaux) if niveaux else max(lo, 1)
    return lo, max(lo, hi)


def wardrobe_for(scene, level, creative=None):
    """Tenue(s) de la scene pour ce niveau : la plus haute definie <= niveau.

    Retourne une liste : une scene peut proposer plusieurs tenues au meme niveau,
    ce qui remplace proprement une variante qui n'etait qu'un changement de tenue.

    Une scene SANS `wardrobe` ne recoit aucun fragment de tenue : c'est le cas
    d'une scene non migree, dont le prompt porte encore sa tenue en dur. Injecter
    la tenue par defaut du palier produirait deux tenues concurrentes dans le meme
    prompt — exactement ce que la migration sert a eviter.
    """
    wd = scene.get("wardrobe") or {}
    for lv in range(level, -1, -1):
        v = wd.get(str(lv))
        if v:
            return list(v) if isinstance(v, list) else [v]
    return [""]


def scene_visible(scene, level, intention=None, tone=None):
    """Le niveau et l'intention filtrent. Le ton, non.

    Le champ `tones` d'une scene dit avec quels tons elle va **bien**, pas les
    seuls tons possibles. En faire un filtre dur amenait des culs-de-sac : par
    exemple lifestyle + elegant ne laissait aucune scene, alors qu'un cafe en
    terrasse se photographie tres bien sur un ton elegant. Le ton reste donc un
    modificateur de prompt, et `tones` sert a mettre en avant les scenes affines
    dans l'interface (voir tone_affinity).
    """
    lo, hi = scene_band(scene)
    if not lo <= level <= hi:
        return False
    if intention and scene_intention(scene) != intention:
        return False
    return True


def tone_affinity(scene, tone):
    """1 si la scene est annoncee comme allant bien avec ce ton, 0 sinon."""
    if not tone or not scene.get("tones"):
        return 0
    return 1 if tone in scene["tones"] else 0


# ------------------------------------------------------------------- plan batch
def build_jobs(scenes_file, args, character_id, creative=None):
    """Construit la liste des jobs.

    `args.intensity` absent vaut niveau 0 (SFW strict). Sur une banque non migree —
    scenes sans `wardrobe`, tenue encore en dur dans le prompt — et sans ton ni
    intention, l'assemblage redonne **exactement** le prompt d'avant la refonte du
    parcours. C'est verifie a l'octet pres par tests/test_build_jobs.py, qui rejoue
    l'ancien algorithme sur scenes.avant-refonte.json.

    `character_id` est enfile dans chaque job produit (explicite plutot
    qu'implicite, J2) et sert de repli pour charger `creative` si l'appelant
    ne le fournit pas.
    """
    data = load_json(scenes_file)
    prefix, anchor, texture = data["prefix"], data["anchor"], data["texture"]
    direction = (data.get("direction") or "").strip()   # note de direction globale
    creative = load_creative(character_id) if creative is None else creative
    style = character_style(character_id)               # fige a la creation (J5)

    brut = getattr(args, "intensity", None)
    level = 0 if brut is None or brut == "" else int(brut)
    tone_key = getattr(args, "tone", None) or None
    intention_key = getattr(args, "intention", None) or None
    tone = by_key(creative.get("tones", []), tone_key) if tone_key else None
    intention = (by_key(creative.get("intentions", []), intention_key)
                 if intention_key else None)
    palier = by_level(creative, level)
    if palier is None:
        raise ValueError(f"niveau d'intensite inconnu : {level}")
    position = (creative.get("assemblage", {}).get("wardrobe_position")
                or "apres_scene")

    jobs = []
    for scene in data["scenes"]:
        if args.scene and scene["id"] not in args.scene:
            continue
        if args.category and scene_intention(scene) not in args.category:
            continue
        if not scene_visible(scene, level, intention_key, tone_key):
            continue

        variants = [""] if args.no_variants else [""] + list(scene.get("variants", []))
        tenues = wardrobe_for(scene, level, creative)
        if args.no_variants:
            # "la version la plus simple de la scene" : une seule tenue aussi. Une
            # liste de tenues joue le meme role qu'une liste de variantes, elle
            # doit donc se replier pareil.
            tenues = tenues[:1]
        count = args.count if args.count is not None else scene.get("count", 1)

        # amendement du texte de scene pour CE lancement seulement : il ne touche
        # pas scenes.json. N'a de sens qu'avec une seule scene retenue — c'est a
        # l'appelant de ne le passer que dans ce cas.
        texte_scene = getattr(args, "scene_override", None) or scene["prompt"]

        for tenue in tenues:
            for variant in variants:
                habit = f"wearing {tenue}" if tenue else ""
                # Position de la tenue : la migration l'a deplacee du milieu du
                # prompt vers la fin, et l'A/B du 24/08/2026 a mesure -0.014
                # d'identite (n=7, non concluant mais de signe constant). Le
                # reglage existe pour pouvoir trancher par la mesure.
                corps = ([("tenue", habit), ("scène", texte_scene)]
                         if position == "apres_ancre"
                         else [("scène", texte_scene), ("tenue", habit)])
                # Fragments ETIQUETES par leur source. Le prompt reste construit
                # de la meme facon, dans le meme ordre ; on garde seulement d'ou
                # vient chaque morceau, pour pouvoir le montrer avant de lancer.
                # 69 % du prompt final est assemble ici, hors de la vue de qui
                # ecrit la scene — et deux fragments peuvent se contredire sans
                # que rien ne le signale (mesure du 26/08/2026).
                controles = [*corps,
                             ("ton", (tone or {}).get("prompt_add", "")),
                             ("intention", (intention or {}).get("prompt_add", "")),
                             ("intensité", palier.get("prompt_add", "")),
                             ("variante", variant)]
                assert_no_face([t for _, t in controles], scene["id"])
                morceaux = [("préfixe + ancre", f"{prefix} {anchor}"),
                            *controles,
                            ("texture", texture),
                            ("note de direction", direction)]
                prompt = ", ".join(t for _, t in morceaux if t)
                for i in range(count):
                    jobs.append({
                        "character_id": character_id,
                        # style de sortie fige a la creation (J5) : donnee pour le
                        # runner (choix de checkpoint / fragment de prompt selon
                        # l'univers) ; inerte pour Lena (realiste). N'entre pas
                        # dans le prompt assemble ci-dessus.
                        "output_style": style,
                        "scene": scene["id"],
                        # `category` n'est plus un champ de scene : c'est
                        # l'intention. Elle portait trois roles a la fois
                        # (taxonomie, prefixe de fichier, dossier d'export) et
                        # divergeait de l'intention sur 2 scenes sur 16 — assez
                        # pour ranger `chambre_soir`, une scene Intime, dans
                        # PROD/EXPORT/mode/. Les deux disaient la meme chose ;
                        # celle qui est affichee fait desormais foi.
                        "category": scene_intention(scene),
                        "intention": scene_intention(scene),
                        "tone": tone_key or "",
                        "intensity": level,
                        "outfit": tenue,
                        "format": args.format or scene.get("format", "4:5"),
                        "variant": variant,
                        "index": i + 1,
                        "prompt": prompt,
                        # d'ou vient chaque morceau du prompt. Sert a l'apercu
                        # avant lancement ; n'entre dans aucun calcul.
                        "fragments": [{"source": s, "texte": t}
                                      for s, t in morceaux if t],
                        "seed": args.seed if args.seed is not None
                                else random.randint(1, 2 ** 48),
                        # reglages specifiques a la scene (guidance, refiner_denoise...)
                        "overrides": {k: v for k, v in scene.items()
                                      if k in ("guidance", "steps", "refiner_denoise")},
                        # squelette OpenPose (INPUTS/POSE/<fichier>) que la scene
                        # impose, ou None. Cote SFW uniquement — voir CLAUDE.md,
                        # section pose. A/B mesure : DOCS/lena-pose-controlnet.md.
                        "pose": scene.get("pose") or None,
                    })
    if args.limit is not None:
        jobs = jobs[:args.limit]
    return jobs


# ------------------------------------------------------------- declinaisons
MODES_DECLINAISON = ("lumiere", "ton", "seeds", "intensite")


def jobs_declinaison(scenes_file, source, mode, character_id, creative=None,
                     n=3, tone=None):
    """Reconstruit des jobs a partir d'une image DEJA produite.

    C'est la boucle courte du parcours : au lieu de relancer un batch entier, on
    repart d'une image gardee. Le seed est journalise exactement pour ca — a seed
    egal, seul ce qu'on change bouge.

    Passe TOUJOURS par build_jobs : il ne doit exister qu'un seul assembleur de
    prompt dans le projet. Les modes ne font que preparer ses filtres et trier sa
    sortie ; aucun d'eux ne fabrique un prompt.

    `source` est une ligne de journal (scene, intensite, ton, variante, seed).
    Retourne [] quand la declinaison n'a pas de sens pour cette image — scene sans
    autre variante, niveau deja au maximum : c'est a l'appelant de le dire.
    """
    creative = load_creative(character_id) if creative is None else creative
    sid = source.get("scene")
    niveau = int(source.get("intensite") or 0)
    ton_src = source.get("ton") or None
    variante = source.get("variante") or ""
    brut = str(source.get("seed") or "")
    seed = int(brut) if brut.isdigit() else None

    def filtres(**kw):
        base = dict(scene=[sid], category=None, format=None, count=1, limit=None,
                    seed=seed, no_variants=True, intensity=niveau,
                    tone=ton_src, intention=None)
        base.update(kw)
        return SimpleNamespace(**base)

    if mode == "lumiere":
        # meme seed, meme tenue : seule la variante de lumiere/saison change
        jobs = build_jobs(scenes_file, filtres(no_variants=False), character_id,
                          creative)
        vus, sortie = {variante}, []
        for j in jobs:
            if j["variant"] and j["variant"] not in vus:
                vus.add(j["variant"])
                sortie.append(j)
        return sortie[:n]

    if mode == "ton":
        if not tone or tone == ton_src:
            return []
        return build_jobs(scenes_file, filtres(tone=tone), character_id,
                          creative)[:1]

    if mode == "seeds":
        # seeds tires au hasard, pas "voisins" : deux seeds proches ne donnent
        # pas deux images proches en diffusion, l'espace n'est pas continu
        return build_jobs(scenes_file, filtres(seed=None, count=n), character_id,
                          creative)[:n]

    if mode == "intensite":
        cible = by_level(creative, niveau + 1)
        if cible is None:
            return []
        # meme regle que partout : au palier a deux passes, la GENERATION tourne
        # au niveau de base, l'edition vient apres
        gen = cible.get("base_level", cible["level"])
        return build_jobs(scenes_file, filtres(intensity=gen), character_id,
                          creative)[:1]

    raise ValueError(f"mode de declinaison inconnu : {mode}")
