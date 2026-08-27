"""Verrou d'identite PuLID-Flux — univers instagram-influenceur (famille Flux).

Injecte dans le graphe converti, depuis WorkflowRunner.api_for :
  - weight / start_at / end_at  <- config.json, cle `identity`
  - image de reference          <- config.json, cle `base_gelee` (pose le widget
                                   du LoadImage qui alimente ApplyPulidFlux)

Avant J5, ces valeurs vivaient en dur dans les widgets du workflow
(ApplyPulidFlux, LoadImage « BASE GELEE ») — entorse a CLAUDE.md §8.4, et le
skill nouveau-personnage (etape 2) demande ces poids en config mesuree PAR
personnage. Reperes de lecture des valeurs : note « Reglages PuLID » du graphe
+ DOCS/lena-realisme.md.
"""

REQUIRED_ROLES = {
    "pulid_apply": ("ApplyPulidFlux", "Apply PuLID Flux - verrou identite"),
    "pulid_ref": ("LoadImage", "BASE GELEE - reference d'identite"),
}

# Valeurs de repli = celles mesurees pour Lena, au cas ou config.json ne porte
# pas encore de bloc `identity`. Un personnage doit quand meme le renseigner.
DEFAULTS = {"weight": 0.85, "start_at": 0.10, "end_at": 1.00}


def apply(api, roles, character_config, job):
    for role, (typ, titre) in REQUIRED_ROLES.items():
        if not roles.get(role):
            raise RuntimeError(
                f"verrou PuLID-Flux : role « {role} » introuvable dans le "
                f"workflow ({typ} / {titre!r}) — le graphe de ce personnage "
                f"doit porter le groupe d'identite")

    idc = {**DEFAULTS, **(character_config.get("identity") or {})}
    knobs = api[str(roles["pulid_apply"]["id"])]["inputs"]
    knobs["weight"] = float(idc["weight"])
    knobs["start_at"] = float(idc["start_at"])
    knobs["end_at"] = float(idc["end_at"])

    ref = character_config.get("base_gelee")
    if not ref:
        raise RuntimeError("verrou PuLID-Flux : config.json sans `base_gelee`")
    api[str(roles["pulid_ref"]["id"])]["inputs"]["image"] = ref
