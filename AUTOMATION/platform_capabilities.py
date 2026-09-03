"""Carte de capacites de la couche PLATEFORME (ADR-0017, ADR-0018, ADR-0020, J8.4).

Une capacite de plateforme est agnostique du modele : elle s'applique a une
image deja produite, quelle que soit la famille de modele qui l'a generee
(upscale, et plus tard grain / recadrage / correction colorimetrique /
watermark — pas construits ici, "premier habitant" veut dire un seul).

Meme forme qu'une entree de la carte d'un PACK (`PACKS/<id>/universe.json` /
`capabilities`, ADR-0018) : `{graph, roles}`. Ce module est volontairement le
jumeau des accesseurs de capacite d'`AUTOMATION/universe.py`, moins le
parametre `uid` : la plateforme est un SINGLETON, jamais une par id comme les
packs.

CE QUE CE MODULE N'EST PAS : un resolveur qui consulterait le pack ou le
personnage. Aucune fonction ici ne prend de `character_id` ni de `pack_id` —
une capacite de plateforme est toujours disponible, ou n'existe pas du tout,
jamais conditionnee (contrainte du chantier). `universe.resolve()` ne connait
rien de cette carte, et cette carte ne connait rien de `universe.resolve()`.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
PLATFORM_DIR = OFM / "PLATFORM"
CAPABILITIES_PATH = PLATFORM_DIR / "capabilities.json"


class CapabilityUnavailableError(ValueError):
    """La plateforme ne declare pas cette capacite — absente de la carte,
    jamais une valeur nulle (meme principe qu'ADR-0013/ADR-0018 pour les
    packs : un outil sans capacite disparait de l'interface, il n'est
    jamais grise)."""


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as e:
        raise ValueError(f"{path} : JSON invalide — {e}")


def capabilities():
    """Carte de capacites brute (sans les cles `_notes*`). Jamais de cle pour
    une capacite absente (pas de `null`) : `capability()`/`require_capability()`
    rendent None / levent."""
    data = _read_json(CAPABILITIES_PATH)
    return {k: v for k, v in data.items() if not k.startswith("_")}


def capability(cap_id):
    """Une entree de la carte, ou None si la plateforme ne declare pas
    `cap_id`. Ne prend aucun character_id ni pack_id — voir le docstring du
    module."""
    return capabilities().get(cap_id)


def capability_graph(cap_id):
    """Raccourci : juste le chemin (repo-relatif) de la capacite, ou None."""
    entry = capability(cap_id)
    return entry.get("graph") if entry else None


def require_capability(cap_id):
    """Same as `capability`, but raises CapabilityUnavailableError when the
    platform has none — for callers that cannot proceed without it."""
    entry = capability(cap_id)
    if not entry:
        raise CapabilityUnavailableError(
            f"la plateforme ne declare pas la capacite {cap_id!r} "
            f"(PLATFORM/capabilities.json) : l'outil correspondant "
            f"n'existe pas encore")
    return entry
