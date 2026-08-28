"""Registre des univers de la plateforme (CLAUDE.md §3-§5, §7, J4 ; J7bis).

Un univers — dit « pack » depuis l'ADR-0012 — porte la famille de modele, le
mecanisme de verrou d'identite et le panel d'outils partages par tous les
personnages qui en dependent. C'est un axe distinct du personnage (donnees
mesurees + assets, dans CHARACTERS/<id>/) et du registre de creation (types de
contenu actifs, dans character.json).

Contrairement a CHARACTERS/, ce registre est VERSIONNE : il ne contient aucune
donnee personnelle, seulement des choix d'architecture (quel checkpoint, quel
verrou d'identite, quels outils). Un fichier par univers, decouverte par scan de
UNIVERS/<id>/ — pas de fichier central a merger.

    UNIVERS/<id>/universe.json   famille de modele, identite, posing, styles, types
    UNIVERS/<id>/tools.json      panel d'outils du Dashboard pour cet univers
    UNIVERS/resolution.json      table (type de personnage, style) -> pack (ADR-0012)

En J4, les champs `model_family` / `identity` / `posing` sont des chaines
declaratives : elles seront cablees a du code en J5 (AUTOMATION/identity/).

J7bis (ADR-0012) : le pack n'est plus choisi a la main. `resolve(type, style)`
le DEDUIT depuis resolution.json ; `universe.json` gagne un champ `types` (les
types de personnage qu'il sert, liste des le premier jour meme si la relation
reste 1-1 en V1).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
UNIVERS_DIR = OFM / "UNIVERS"


class UnknownUniverseError(ValueError):
    """Un id d'univers demande n'a pas de dossier UNIVERS/<id>/universe.json."""


class UnresolvedPackError(ValueError):
    """Aucun pack ne correspond au couple (type de personnage, style de sortie).

    Jamais de repli silencieux sur un pack par defaut global (ADR-0012) : un
    personnage rattache en silence a la mauvaise famille de modele est une panne
    invisible jusqu'a la premiere generation ratee.
    """


def universe_dir(uid):
    return UNIVERS_DIR / uid


def resolution_path():
    return UNIVERS_DIR / "resolution.json"


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


def types(uid):
    """Types de personnage que ce pack sert (`universe.json` / `types`, ADR-0012).

    Liste des le premier jour meme si la relation reste 1-1 en V1 — pour que le
    1-1 ne se petrifie pas en loi cote code. `resolve()` (ci-dessous) aiguille
    (type, style) -> pack ; ce champ est le lien inverse, verifie coherent avec
    la table par le diagnostic et les tests."""
    return list(load_universe(uid).get("types", []))


def workflow(uid):
    """Chemin (relatif au repo) du graphe de PRODUCTION du pack (`universe.json`
    / `workflow`). Le wizard « nouveau personnage » y RATTACHE le nouveau
    personnage (config.json/workflow) — il ne cree jamais de fichier de graphe
    (CLAUDE.md §8.11)."""
    return load_universe(uid).get("workflow")


def load_character_defaults(uid):
    """UNIVERS/<uid>/character_defaults.json : le gabarit que le wizard stampe
    dans un nouveau CHARACTERS/<id>/ (config aux defauts du pack, amorces de
    banque et de taxonomie). Pack inconnu -> UnknownUniverseError ; pack sans
    gabarit -> {}."""
    if not exists(uid):
        raise UnknownUniverseError(f"univers inconnu : {uid!r}")
    path = universe_dir(uid) / "character_defaults.json"
    if not path.is_file():
        return {}
    return _read_json(path, "character_defaults.json")


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


# --------------------------------------------------------- resolution du pack
# L'utilisateur choisit type, style et monde ; le pack, lui, se DEDUIT
# (CLAUDE.md §3-§4, ADR-0012). La table est une donnee versionnee, pas du
# code : un troisieme pack est un diff de resolution.json, jamais un if ici.
def _load_resolution():
    """(rules, defaults) de UNIVERS/resolution.json.

    Fichier absent -> UnresolvedPackError : sans table, aucun couple ne se
    resout, et le dire tout de suite vaut mieux qu'un pack devine.
    """
    path = resolution_path()
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        raise UnresolvedPackError(
            f"table de resolution absente ({_short(path)}) — aucun couple "
            f"(type, style) ne peut etre resolu")
    except json.JSONDecodeError as e:
        raise ValueError(f"{_short(path)} : JSON invalide — {e}")
    return data.get("rules") or [], data.get("defaults") or {}


def resolve(character_type, output_style):
    """Pack / famille technique pour un couple (type de personnage, style).

    Cherche d'abord une regle exacte (type, style) dans resolution.json, sinon
    le `default` du type. Aucune correspondance -> UnresolvedPackError (jamais
    un repli silencieux). Le pack rendu est garanti exister (UNIVERS/<pack>/).
    """
    rules, defaults = _load_resolution()
    pack = next((r.get("pack") for r in rules
                 if r.get("type") == character_type
                 and r.get("style") == output_style), None)
    if pack is None:
        pack = defaults.get(character_type)
    if pack is None:
        connus = sorted({r.get("type") for r in rules} | set(defaults))
        raise UnresolvedPackError(
            f"aucun pack pour (type={character_type!r}, style={output_style!r}) "
            f"— types declares dans la table : {', '.join(connus) or '(aucun)'}")
    if not exists(pack):
        raise UnresolvedPackError(
            f"la table de resolution renvoie le pack {pack!r} pour "
            f"(type={character_type!r}, style={output_style!r}), mais "
            f"UNIVERS/{pack}/universe.json est absent")
    return pack


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
        wf = workflow(uid)
        wf_ok = "" if (wf and (OFM / wf).is_file()) else "  <- INTROUVABLE" if wf else ""
        print(f"    modele   : {u.get('model_family')}  |  identite : {u.get('identity')}")
        print(f"    styles   : {', '.join(style_names(uid))}")
        print(f"    types    : {', '.join(types(uid)) or '(aucun)'}")
        print(f"    workflow : {wf or '(aucun)'}{wf_ok}")
        print(f"    defauts  : {'oui' if load_character_defaults(uid) else 'aucun gabarit'}")
        print(f"    outils   : {', '.join(o['id'] for o in outils) or '(aucun)'}")

    try:
        rules, defaults = _load_resolution()
    except UnresolvedPackError as e:
        print(f"\n  resolution : {e}")
        return 1
    print(f"\n  resolution ({len(rules)} regles, {len(defaults)} defaults)")
    drift = 0
    for t in sorted({r.get("type") for r in rules} | set(defaults)):
        style = next((r.get("style") for r in rules if r.get("type") == t), None)
        try:
            pack = resolve(t, style)
        except UnresolvedPackError as e:
            print(f"    {t:24} -> ECHEC : {e}")
            drift += 1
            continue
        served = t in types(pack)
        flag = "" if served else "  <- pack ne declare pas ce type dans `types`"
        drift += not served
        print(f"    {t:24} -> {pack}{flag}")
    return 1 if drift else 0


if __name__ == "__main__":
    sys.exit(_diagnostic())
