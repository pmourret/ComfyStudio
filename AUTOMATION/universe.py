"""Registre des univers de la plateforme (CLAUDE.md §3-§5, §7, J4).

Un univers porte la famille de modele, le mecanisme de verrou d'identite et le
panel d'outils partages par tous les personnages qui en dependent. C'est un axe
distinct du personnage (donnees mesurees + assets, dans CHARACTERS/<id>/) et du
registre de creation (types de contenu actifs, dans character.json).

Contrairement a CHARACTERS/, ce registre est VERSIONNE : il ne contient aucune
donnee personnelle, seulement des choix d'architecture (quel checkpoint, quel
verrou d'identite, quels outils). Un fichier par univers, decouverte par scan de
UNIVERS/<id>/ — pas de fichier central a merger.

    UNIVERS/<id>/universe.json   famille de modele, identite, posing, styles
    UNIVERS/<id>/tools.json      panel d'outils du Dashboard pour cet univers

En J4, les champs `model_family` / `identity` / `posing` sont des chaines
declaratives : elles seront cablees a du code en J5 (AUTOMATION/identity/).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
UNIVERS_DIR = OFM / "UNIVERS"


class UnknownUniverseError(ValueError):
    """Un id d'univers demande n'a pas de dossier UNIVERS/<id>/universe.json."""


def universe_dir(uid):
    return UNIVERS_DIR / uid


def _short(path):
    """Chemin relatif au repo si possible, sinon tel quel (registre jetable de test)."""
    try:
        return path.relative_to(OFM)
    except ValueError:
        return path


def _read_json(path, quoi):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise UnknownUniverseError(
            f"univers inconnu : {path.parent.name!r} — {quoi} absent ({_short(path)})")
    except json.JSONDecodeError as e:
        raise ValueError(f"{_short(path)} : JSON invalide — {e}")


def list_universes():
    """Ids des univers declares, ordre alphabetique. [] si UNIVERS/ absent."""
    if not UNIVERS_DIR.is_dir():
        return []
    return sorted(p.name for p in UNIVERS_DIR.iterdir()
                  if (p / "universe.json").is_file())


def exists(uid):
    return bool(uid) and (universe_dir(uid) / "universe.json").is_file()


def load_universe(uid):
    """Contenu de UNIVERS/<uid>/universe.json. Leve UnknownUniverseError si absent."""
    return _read_json(universe_dir(uid) / "universe.json", "universe.json")


def load_tools(uid):
    """Liste d'outils de UNIVERS/<uid>/tools.json.

    tools.json est optionnel : un univers sans outil declare rend []. Un
    universe.json manquant, lui, reste une erreur (l'univers n'existe pas)."""
    if not exists(uid):
        raise UnknownUniverseError(f"univers inconnu : {uid!r}")
    path = universe_dir(uid) / "tools.json"
    if not path.is_file():
        return []
    data = _read_json(path, "tools.json")
    return data.get("tools", [])


def model_family(uid):
    """Famille de modele de l'univers (`universe.json` / `model_family`,
    ex. 'flux', 'sdxl') — decide quelle table de roles guidance/latent le
    runner resout (CLAUDE.md §4 : c'est un choix d'univers, pas de personnage,
    generalise en J6 quand rpg-personnage devient reellement SDXL)."""
    return load_universe(uid).get("model_family")


class UnknownStyleError(ValueError):
    """Un style de sortie demande n'est pas declare par l'univers."""


def _styles_map(uid):
    """output_styles de l'univers, toujours sous forme de map style -> effet."""
    raw = load_universe(uid).get("output_styles") or {}
    if isinstance(raw, list):                        # tolere l'ancienne forme
        return {name: {"prompt_add": "", "checkpoint": None} for name in raw}
    return raw


def style_names(uid):
    """Noms des styles de sortie que l'univers peut produire (CLAUDE.md §3)."""
    return sorted(_styles_map(uid))


def style_effect(uid, name):
    """Effet d'un style sur le pipeline : {prompt_add, checkpoint}.

    Style inconnu -> UnknownStyleError (jamais un KeyError nu). Les cles
    absentes sont completees : un univers peut ne declarer que prompt_add.
    """
    styles = _styles_map(uid)
    if name not in styles:
        raise UnknownStyleError(
            f"style de sortie inconnu pour l'univers {uid!r} : {name!r} — "
            f"declares : {', '.join(sorted(styles)) or '(aucun)'}")
    eff = styles[name]
    return {"prompt_add": eff.get("prompt_add", ""),
            "checkpoint": eff.get("checkpoint")}


def _diagnostic():
    print("=" * 72)
    print("universe - registre des univers")
    print("=" * 72)
    ids = list_universes()
    if not ids:
        print(f"aucun univers dans {UNIVERS_DIR}")
        return 1
    for uid in ids:
        u = load_universe(uid)
        outils = load_tools(uid)
        print(f"  {uid}")
        print(f"    modele   : {u.get('model_family')}  |  identite : {u.get('identity')}")
        print(f"    styles   : {', '.join(style_names(uid))}")
        print(f"    outils   : {', '.join(o['id'] for o in outils) or '(aucun)'}")
    return 0


if __name__ == "__main__":
    sys.exit(_diagnostic())
