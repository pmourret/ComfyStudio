"""Verrou d'identite cote GENERATION, choisi par l'univers (CLAUDE.md §4).

L'univers decide du mecanisme (PACKS/<id>/universe.json, cle `identity`) ;
tous ses personnages partagent la meme implementation, seuls les reglages
mesures (config.json, cle `identity`) et les assets de reference (`base_gelee`)
changent par personnage.

Ce paquet ne MESURE pas l'identite : le scoring InsightFace vit dans
AUTOMATION/qc_identity.py et reste commun a tous les univers, independamment
de la methode qui a genere le visage.

Contrat d'une implementation (voir pulid_flux.py pour la reference) :

    REQUIRED_ROLES : dict[str, tuple[str, str | None]]
        role -> (type de noeud ComfyUI, titre attendu ou None). Le runner les
        resout via ui_to_api.find_node et les ajoute a sa table de roles.

    apply(api, roles, character_config, job) -> None
        Modifie le graphe CONVERTI (format API) EN PLACE : injecte les poids du
        verrou et l'asset de reference du personnage. Meme mecanisme que
        WorkflowRunner.api_for pour guidance/seed. `job` fait partie du contrat
        pour une variation par job eventuelle ; pulid_flux ne s'en sert pas.
"""
from . import pulid_flux, lora_sdxl

_IMPLS = {
    "pulid_flux": pulid_flux,
    "lora_sdxl": lora_sdxl,
}


def get(name):
    """Implementation d'identite par nom (valeur de universe.json / `identity`)."""
    try:
        return _IMPLS[name]
    except KeyError:
        raise ValueError(
            f"mecanisme d'identite inconnu : {name!r} — connus : "
            f"{', '.join(sorted(_IMPLS))}")


def for_universe(universe_id):
    """Implementation d'identite de l'univers (universe.json, cle `identity`)."""
    import universe
    return get(universe.load_universe(universe_id)["identity"])
