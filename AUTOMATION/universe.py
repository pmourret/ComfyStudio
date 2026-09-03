"""Registre des univers de la plateforme (CLAUDE.md §3-§5, §7, J4 ; J7bis).

Un univers — dit « pack » depuis l'ADR-0012 — porte la famille de modele, le
mecanisme de verrou d'identite et le panel d'outils partages par tous les
personnages qui en dependent. C'est un axe distinct du personnage (donnees
mesurees + assets, dans CHARACTERS/<id>/) et du registre de creation (types de
contenu actifs, dans character.json).

Contrairement a CHARACTERS/, ce registre est VERSIONNE : il ne contient aucune
donnee personnelle, seulement des choix d'architecture (quel checkpoint, quel
verrou d'identite, quels outils). Un fichier par univers, decouverte par scan de
PACKS/<id>/ — pas de fichier central a merger.

    PACKS/<id>/universe.json   famille de modele, identite, posing, styles, types
    PACKS/<id>/tools.json      panel d'outils du Dashboard pour cet univers
    PACKS/resolution.json      table (type de personnage, style) -> pack (ADR-0012)

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
PACKS_DIR = OFM / "PACKS"


class UnknownUniverseError(ValueError):
    """Un id d'univers demande n'a pas de dossier PACKS/<id>/universe.json."""


class UnresolvedPackError(ValueError):
    """Aucun pack ne correspond au couple (type de personnage, style de sortie).

    Jamais de repli silencieux sur un pack par defaut global (ADR-0012) : un
    personnage rattache en silence a la mauvaise famille de modele est une panne
    invisible jusqu'a la premiere generation ratee.
    """


def universe_dir(uid):
    return PACKS_DIR / uid


def resolution_path():
    return PACKS_DIR / "resolution.json"


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
    """Ids des univers declares, ordre alphabetique. [] si PACKS/ absent."""
    if not PACKS_DIR.is_dir():
        return []
    return sorted(p.name for p in PACKS_DIR.iterdir()
                  if (p / "universe.json").is_file())


def exists(uid):
    return bool(uid) and (universe_dir(uid) / "universe.json").is_file()


def load_universe(uid):
    """Contenu de PACKS/<uid>/universe.json. Leve UnknownUniverseError si absent."""
    return _read_json(universe_dir(uid) / "universe.json", "universe.json")


def load_tools(uid):
    """Liste d'outils de PACKS/<uid>/tools.json.

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


# ------------------------------------------------------------- capacites (J8.2)
# Une capacite est declaree par la couche qui la fournit (ADR-0017) ; en J8.2
# seul le pack en declare (`universe.json` / `capabilities`). La forme (id ->
# {graph, roles}) est deliberement generale : la couche plateforme (J8.4) y
# entrera sans que ce schema change (ADR-0018).
PRODUCE = "produce"    # capacite de production : un graphe, jamais absente
EDIT = "edit"          # capacite d'edition live par IA : nullable (ADR-0013)


class CapabilityUnavailableError(ValueError):
    """The pack declares no such capability — it is simply absent from its
    `capabilities` map, never a null placeholder (CLAUDE.md §6/ADR-0013's
    rule, generalised beyond the edit tool alone: an absent capability makes
    the tool disappear, it is never greyed out).
    """


def capabilities(uid):
    """Carte de capacites du pack (`universe.json` / `capabilities`), brute.

    Cle -> {graph, roles}. Jamais de cle pour une capacite absente (pas de
    `null`) : `capability()`/`require_capability()` rendent None / levent."""
    return load_universe(uid).get("capabilities") or {}


def capability(uid, cap_id):
    """Une entree de la carte, ou None si le pack ne declare pas `cap_id`."""
    return capabilities(uid).get(cap_id)


def capability_graph(uid, cap_id):
    """Raccourci : juste le chemin (repo-relatif) de la capacite, ou None."""
    entry = capability(uid, cap_id)
    return entry.get("graph") if entry else None


def require_capability(uid, cap_id):
    """Same as `capability`, but raises CapabilityUnavailableError when the
    pack has none — for callers that cannot proceed without it."""
    entry = capability(uid, cap_id)
    if not entry:
        raise CapabilityUnavailableError(
            f"le pack {uid!r} ne declare pas la capacite {cap_id!r} "
            f"(universe.json / capabilities) : l'outil correspondant "
            f"n'existe pas encore pour ce pack")
    return entry


def load_character_defaults(uid):
    """PACKS/<uid>/character_defaults.json : le gabarit que le wizard stampe
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
    """(rules, defaults) de PACKS/resolution.json.

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
    un repli silencieux). Le pack rendu est garanti exister (PACKS/<pack>/).
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
            f"PACKS/{pack}/universe.json est absent")
    return pack


def _diagnostic():
    print("=" * 72)
    print("universe - registre des univers")
    print("=" * 72)
    ids = list_universes()
    if not ids:
        print(f"aucun univers dans {PACKS_DIR}")
        return 1
    for uid in ids:
        u = load_universe(uid)
        outils = load_tools(uid)
        print(f"  {uid}")
        print(f"    modele   : {u.get('model_family')}  |  identite : {u.get('identity')}")
        print(f"    styles   : {', '.join(style_names(uid))}")
        print(f"    types    : {', '.join(types(uid)) or '(aucun)'}")
        caps = capabilities(uid)
        if not caps:
            print(f"    capacites: (aucune)")
        for cap_id, entry in caps.items():
            graph = entry.get("graph")
            ok = "" if (graph and (OFM / graph).is_file()) else "  <- INTROUVABLE" if graph else ""
            print(f"    capacite '{cap_id}' : {graph or '(aucun graphe)'}{ok}")
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
