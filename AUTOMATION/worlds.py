"""Registre des mondes de la plateforme (ADR-0012, J7bis).

Un monde est le CADRE d'un personnage : forets et feux de camp d'une voyageuse,
cafes et lumiere douce d'une influenceuse slow-life. Il porte un ton, un jeton de
peau UI, une amorce de banque de scenes, et surtout des ASSETS (LoRA de monde,
prompt_add) qui entrent dans le rendu.

Trois choses qu'un monde n'est PAS :

  - il ne choisit ni la famille de modele ni le mecanisme d'identite. Ceux-la
    sont deja resolus par (type, style) -> pack (AUTOMATION/universe.py). Le
    monde doit seulement etre COMPATIBLE avec la famille resolue :
    `compatible_families` filtre les mondes proposables dans le wizard.
  - il n'est pas un simple decor. Ses assets sont mesures pour le visage du
    personnage au meme titre que le verrou d'identite ; un monde livre sans
    mesure est une dette declaree, pas un monde pret.
  - il n'est pas modifiable apres la creation du personnage. En changer
    reviendrait a creer un autre personnage (CLAUDE.md §3-§4), pour la meme
    raison que le style : la mesure du verrou deviendrait fausse en silence.

Comme UNIVERS/, ce registre est VERSIONNE : aucune donnee personnelle, un fichier
plat par monde (WORLDS/<id>.json), decouverte par scan.

J7bis : le registre existe et se valide, mais RIEN ne consomme encore ses assets
— leur cablage dans le runner est explicitement hors perimetre (ROADMAP).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
WORLDS_DIR = OFM / "WORLDS"

# Pour que `python AUTOMATION/worlds.py` retrouve ses modules freres (universe,
# dans le diagnostic) meme sous l'interpreteur embarque de ComfyUI, dont le
# ._pth ne met pas le dossier du script sur le path. Meme repli que wf_check.py.
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))


class UnknownWorldError(ValueError):
    """Un id de monde demande n'a pas de fichier WORLDS/<id>.json."""


class IncompatibleWorldError(ValueError):
    """Un monde a ete demande pour une famille de modele qu'il ne declare pas.

    Le monde ne resout pas la famille (c'est (type, style) -> pack qui le fait) ;
    il doit etre compatible avec elle. Un monde rattache a la mauvaise famille
    donnerait des assets qui ne chargent pas — ou pire, chargent et degradent.
    """


def world_path(wid):
    return WORLDS_DIR / f"{wid}.json"


def _short(path):
    """Chemin relatif au repo si possible, sinon tel quel (registre jetable de test)."""
    try:
        return path.relative_to(OFM)
    except ValueError:
        return path


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise UnknownWorldError(f"monde inconnu : {path.stem!r} — {_short(path)} absent")
    except json.JSONDecodeError as e:
        raise ValueError(f"{_short(path)} : JSON invalide — {e}")


def list_worlds():
    """Ids des mondes declares, ordre alphabetique. [] si WORLDS/ absent."""
    if not WORLDS_DIR.is_dir():
        return []
    return sorted(p.stem for p in WORLDS_DIR.glob("*.json"))


def exists(wid):
    return bool(wid) and world_path(wid).is_file()


def load_world(wid):
    """Contenu de WORLDS/<wid>.json. Leve UnknownWorldError si absent."""
    return _read_json(world_path(wid))


def label(wid):
    return load_world(wid).get("label", wid)


def compatible_families(wid):
    """Familles de modele avec lesquelles les assets de ce monde sont utilisables."""
    return list(load_world(wid).get("compatible_families", []))


def suggested_styles(wid):
    """Styles de sortie que ce monde met en avant dans le wizard (indicatif)."""
    return list(load_world(wid).get("suggested_styles", []))


def assets(wid):
    """Assets de monde, sous forme normalisee {lora, lora_strength, prompt_add}.

    Cles absentes completees : un monde peut n'avoir aucun asset (cadre
    contemporain sans LoRA) et ne declarer que `prompt_add`, ou rien du tout.
    """
    raw = load_world(wid).get("assets") or {}
    return {"lora": raw.get("lora"),
            "lora_strength": raw.get("lora_strength"),
            "prompt_add": raw.get("prompt_add", "")}


def tone(wid):
    return load_world(wid).get("tone", "")


def ui_skin_token(wid):
    return load_world(wid).get("ui_skin_token")


# Reglages qui appartiennent au PERSONNAGE, jamais au catalogue d'un monde
# (ADR-0014 §2). Une tenue livree par le monde habillerait de la meme facon
# tous les personnages qui y naissent, et rendrait fausse la premiere mesure de
# verrou qui suit. Le format et le compte, eux, se deduisent de la fiche.
CHARACTER_ONLY_SCENE_KEYS = ("wardrobe", "pose", "format", "count", "variants")


def starter_scenes(wid):
    """Amorce de banque de scenes pour un nouveau personnage de ce monde.

    Consommee par le wizard (J7bis etape 5) ; rien ne la lit avant. La banque
    reelle d'un personnage grandit ensuite a la main depuis le Dashboard.

    Un catalogue de monde decrit des CADRES, pas des garde-robes : une amorce
    qui porte une tenue (ou une pose, un format, un compte) est une erreur
    explicite ici, pas un silence qui se propage a chaque naissance.
    """
    scenes = list(load_world(wid).get("starter_scenes", []))
    for i, s in enumerate(scenes):
        if not isinstance(s, dict):
            raise ValueError(f"monde {wid!r} : starter_scenes[{i}] n'est pas un objet")
        intrus = [k for k in CHARACTER_ONLY_SCENE_KEYS if k in s]
        if intrus:
            raise ValueError(
                f"monde {wid!r} : la scene d'amorce {s.get('id', i)!r} declare "
                f"{', '.join(intrus)} — un catalogue de monde n'habille pas ses "
                f"scenes, ces reglages appartiennent au personnage (ADR-0014)")
    return scenes


def is_compatible(wid, family):
    """`family` figure-t-elle dans compatible_families du monde. Leve
    UnknownWorldError si le monde n'existe pas."""
    return family in compatible_families(wid)


def assert_compatible(wid, family):
    """Garde-fou : le monde doit etre compatible avec la famille deja resolue
    par (type, style). Sinon IncompatibleWorldError."""
    if not is_compatible(wid, family):
        raise IncompatibleWorldError(
            f"le monde {wid!r} n'est pas compatible avec la famille {family!r} — "
            f"compatible_families : {', '.join(compatible_families(wid)) or '(aucune)'}")


def worlds_for_family(family):
    """Ids des mondes proposables pour une famille de modele donnee (ordre
    alphabetique) — le filtre du wizard une fois le pack resolu."""
    return [w for w in list_worlds() if family in compatible_families(w)]


def _diagnostic():
    print("=" * 72)
    print("worlds - registre des mondes")
    print("=" * 72)
    ids = list_worlds()
    if not ids:
        print(f"aucun monde dans {WORLDS_DIR}")
        return 1

    familles_reelles = set()
    try:
        import universe
        familles_reelles = {universe.model_family(u) for u in universe.list_universes()}
    except Exception as e:  # noqa: BLE001
        print(f"  (cross-check des familles indisponible : {type(e).__name__})")

    drift = 0
    for wid in ids:
        a = assets(wid)
        etat = "pret" if (a["lora"] or a["prompt_add"]) else "assets vides (dette declaree)"
        fam = compatible_families(wid)
        inconnues = [f for f in fam if familles_reelles and f not in familles_reelles]
        drift += len(inconnues)
        print(f"  {wid}")
        print(f"    label     : {label(wid)}")
        print(f"    familles  : {', '.join(fam) or '(aucune)'}"
              + (f"   <- inconnues : {', '.join(inconnues)}" if inconnues else ""))
        print(f"    styles    : {', '.join(suggested_styles(wid)) or '(aucun)'}")
        print(f"    assets    : {etat}")
        print(f"    scenes    : {len(starter_scenes(wid))} d'amorce")
    for fam in sorted(familles_reelles):
        print(f"\n  famille {fam:8} -> mondes : {', '.join(worlds_for_family(fam)) or '(aucun)'}")
    return 1 if drift else 0


if __name__ == "__main__":
    sys.exit(_diagnostic())
