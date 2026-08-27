"""Verrou d'identite LoRA / IPAdapter — univers rpg-personnage (famille SDXL/Pony).

STUB : implemente en J6, avec le premier personnage de rpg-personnage et son
workflow SDXL de production. Aucun des deux n'existe encore — figer le contrat
a l'aveugle menerait a une interface fausse.

Mecanismes candidats (workflow-comfyui/references/modeles-par-univers.md) :
  - LoRA de personnage : mot declencheur propre au personnage injecte en tete du
    prompt positif + poids du LoRA sur un LoraLoader ;
  - IPAdapter FaceID / FaceID-plusv2 SDXL : embedding de visage applique via
    ComfyUI_IPAdapter_plus, avec poids et noeud de reference.
Le choix se tranche a l'onboarding du personnage (J6).
"""

REQUIRED_ROLES = {}


def apply(api, roles, character_config, job):
    raise NotImplementedError(
        "verrou LoRA SDXL — implemente en J6 avec le premier personnage "
        "rpg-personnage et son workflow SDXL de production")
