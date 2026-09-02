"""Registre des mondes de la plateforme (ADR-0012, J7bis).

Un monde est le CADRE d'un personnage : forets et feux de camp d'une voyageuse,
cafes et lumiere douce d'une influenceuse slow-life. Il porte un ton, un jeton de
peau UI, un catalogue de LIEUX (`places`), et surtout des ASSETS (LoRA de monde,
prompt_add) qui entrent dans le rendu.

Trois choses qu'un monde n'est PAS :

  - il ne choisit ni la famille de modele ni le mecanisme d'identite. Ceux-la
    sont deja resolus par (type, style) -> pack (AUTOMATION/universe.py). Le
    monde doit seulement etre COMPATIBLE avec la famille resolue :
    `compatible_families` filtre les mondes proposables dans le wizard.
  - il n'est pas un simple decor. Ses assets sont mesures pour le visage du
    personnage au meme titre que le verrou d'identite ; un monde livre sans
    mesure est une dette declaree, pas un monde pret.
  - CE QUI EST FIGE A LA CREATION D'UN PERSONNAGE, c'est son APPARTENANCE a ce
    monde (CLAUDE.md §3-§4) : en changer reviendrait a creer un autre
    personnage, pour la meme raison que le style. Le catalogue `places`
    LUI-MEME reste vivant apres coup (ADR-0015) : un lieu s'edite depuis la
    Banque (routes `/api/worlds/<id>/places`, jamais `POST /api/scenes`), et
    toute scene qui le reference en herite en direct — voir `merge_scene()`.

Comme UNIVERS/, ce registre est VERSIONNE : aucune donnee personnelle, un fichier
plat par monde (WORLDS/<id>.json), decouverte par scan.

J7bis : le registre existe et se valide, mais RIEN ne consomme encore ses assets
— leur cablage dans le runner est explicitement hors perimetre (ROADMAP).
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
WORLDS_DIR = OFM / "WORLDS"

# Pour que `python AUTOMATION/worlds.py` retrouve ses modules freres (universe)
# meme sous l'interpreteur embarque de ComfyUI, dont le ._pth ne met pas le
# dossier du script sur le path. Meme repli que wf_check.py.
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import universe  # noqa: E402 — apres le repli de sys.path ci-dessus


class UnknownWorldError(ValueError):
    """Un id de monde demande n'a pas de fichier WORLDS/<id>.json."""


class UnknownPlaceError(ValueError):
    """Un id de lieu demande n'existe pas dans le catalogue de ce monde."""


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


# Meme forme que `_CID_RE` de runner/prompt.py : un id de monde devient un nom
# de fichier et une valeur d'URL, meme regle qu'un id de personnage.
_WID_RE = re.compile(r"[a-z][a-z0-9_-]*$")


def create_world(wid, label, pack, tone=""):
    """Cree WORLDS/<wid>.json pour l'ecran « Mondes » — catalogue `places`
    VIDE, un pack deja curate pour en deriver `compatible_families` /
    `suggested_styles` sans les faire taper a la main.

    LE PACK EST UNE PROPOSITION, PAS UN AIGUILLAGE (ADR-0016) : il sert une
    fois, ici, a deriver la famille et les styles suggeres. Il n'est ecrit
    nulle part comme un lien dur — `universe.resolve()` continue de deriver
    le pack d'un personnage depuis (type, style) exclusivement, et ce monde
    reste ensuite proposable a tout personnage d'un pack de la MEME famille,
    pas seulement celui choisi ici.

    N'ECRIT QUE ce fichier : aucun acces a CHARACTERS/, aucune ecriture dans
    UNIVERS/resolution.json. Le gel (« n'assigne ce monde a aucun
    personnage ») est vrai par construction, pas par un garde-fou en plus.

    Leve avant toute ecriture : ValueError (id invalide, pack inconnu),
    FileExistsError (id deja pris). Rend le wid.
    """
    if not _WID_RE.match(wid or ""):
        raise ValueError(f"identifiant de monde invalide : {wid!r} — attendu un "
                         f"slug minuscule (^[a-z][a-z0-9_-]*$)")
    if exists(wid):
        raise FileExistsError(f"le monde {wid!r} existe deja : {world_path(wid)}")
    if not universe.exists(pack):
        raise ValueError(f"pack inconnu : {pack!r} — packs declares : "
                         f"{', '.join(universe.list_universes()) or '(aucun)'}")

    family = universe.model_family(pack)
    data = {
        "id": wid,
        "label": (label or "").strip() or wid,
        "compatible_families": [family],
        "suggested_styles": universe.style_names(pack),
        "assets": {"lora": None, "lora_strength": None, "prompt_add": ""},
        "tone": (tone or "").strip(),
        "ui_skin_token": f"world-{wid}",
        "places": [],
        "_notes": [
            f"Cree par l'ecran « Mondes ». Pack {pack!r} choisi pour en deriver",
            f"compatible_families ({family!r}) et suggested_styles — UNE",
            "PROPOSITION, pas un aiguillage : universe.resolve() continue de",
            "deriver le pack d'un personnage de (type, style) exclusivement",
            "(ADR-0016). Catalogue de lieux vide, a construire depuis l'ecran",
            "d'edition (ADR-0015). Assets a mesurer avant un monde pret.",
        ],
    }
    world_path(wid).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8")
    return wid


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

# Cles d'overlay qu'une scene de personnage peut porter EN PLUS des cinq
# ci-dessus, quand elle est liee a un lieu du catalogue (ADR-0015). Toutes
# restent des reglages de personnage (tons/tags/intensite/guidance) : jamais
# le cadre (label/intention/prompt), qui vient toujours du lieu.
SCENE_OVERLAY_KEYS = CHARACTER_ONLY_SCENE_KEYS + ("tones", "tags", "intensity", "guidance")


def places(wid):
    """Catalogue de lieux du monde — le CADRE que chaque personnage de ce
    monde peut composer (ADR-0015). Vivant : lu a la creation du personnage
    (amorce de banque, J7bis) ET tant qu'il vit, chaque fois que sa Banque
    charge ou enregistre une scene qui reference un lieu (`world_ref`).

    Un catalogue de monde decrit des CADRES, pas des garde-robes : un lieu
    qui porte une tenue (ou une pose, un format, un compte) est une erreur
    explicite ici, pas un silence qui se propage a chaque personnage qui le
    reference.
    """
    entries = list(load_world(wid).get("places", []))
    for i, s in enumerate(entries):
        if not isinstance(s, dict):
            raise ValueError(f"monde {wid!r} : places[{i}] n'est pas un objet")
        intrus = [k for k in CHARACTER_ONLY_SCENE_KEYS if k in s]
        if intrus:
            raise ValueError(
                f"monde {wid!r} : le lieu {s.get('id', i)!r} declare "
                f"{', '.join(intrus)} — un catalogue de monde n'habille pas ses "
                f"lieux, ces reglages appartiennent au personnage (ADR-0014)")
    return entries


def place(wid, place_id):
    """Un lieu du catalogue de `wid`. Leve UnknownPlaceError si absent —
    monde inconnu leve deja UnknownWorldError via `places()`."""
    for p in places(wid):
        if p.get("id") == place_id:
            return p
    raise UnknownPlaceError(f"lieu inconnu : {place_id!r} dans le monde {wid!r}")


def save_places(wid, new_places):
    """Reecrit UNIQUEMENT la cle `places` de WORLDS/<wid>.json, le reste du
    fichier intact (lecture-modification-ecriture) — jamais depuis
    `POST /api/scenes`, toujours depuis une route monde dediee (ADR-0015).

    La validation de forme (ids uniques, prompt non vide, aucune cle de
    personnage) vit cote service HTTP (`api/services/worlds.py`) ; cette
    fonction fait confiance a son appelant et se contente d'ecrire.
    """
    path = world_path(wid)
    data = _read_json(path)
    data["places"] = list(new_places)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def merge_scene(wid, place_id, overlay):
    """La fusion vivante d'ADR-0015 : le CADRE du lieu (`label`/`intention`/
    `prompt`), toujours relu depuis le catalogue actuel, jamais fiable depuis
    `overlay` — plus l'OVERLAY du personnage (`SCENE_OVERLAY_KEYS`), recopie
    tel quel depuis `overlay` quand il le porte.

    `overlay` est la scene telle que le personnage la possede (ou un objet
    partiel a la creation) : ce que `merge_scene` en lit ne sert jamais a
    ecraser le catalogue, seulement a construire la scene fusionnee rendue a
    l'appelant. Leve UnknownWorldError / UnknownPlaceError si le monde ou le
    lieu a disparu — a l'appelant de decider quoi en faire.
    """
    p = place(wid, place_id)
    merged = {
        "id": overlay.get("id") or p["id"],
        "world": wid,
        "origin": "world",
        "world_ref": place_id,
        "label": p.get("label", ""),
        "intention": p.get("intention", ""),
        "prompt": p.get("prompt", ""),
    }
    for k in SCENE_OVERLAY_KEYS:
        if k in overlay:
            merged[k] = overlay[k]
    return merged


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
        print(f"    lieux     : {len(places(wid))}")
    for fam in sorted(familles_reelles):
        print(f"\n  famille {fam:8} -> mondes : {', '.join(worlds_for_family(fam)) or '(aucun)'}")
    return 1 if drift else 0


if __name__ == "__main__":
    sys.exit(_diagnostic())
