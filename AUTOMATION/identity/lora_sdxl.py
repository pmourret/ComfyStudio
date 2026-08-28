"""Verrou d'identite IPAdapter FaceID (+ LoRA de personnage optionnel) —
univers rpg-personnage (famille SDXL/Pony).

Mecanisme retenu a l'onboarding d'Abyssiaelle (J6, premier personnage de cet
univers) : IPAdapter FaceID par defaut, meme logique que PuLID-Flux pour Lena
— image de reference gelee, aucun entrainement necessaire. Noeuds confirmes
installes sur le ComfyUI de ce poste (object_info reel) : IPAdapterFaceID,
IPAdapterUnifiedLoaderFaceID, IPAdapterInsightFaceLoader
(ComfyUI_IPAdapter_plus). Seul le noeud d'application (IPAdapterFaceID) et
l'image de reference sont des roles : les loaders (unified loader,
InsightFace) sont des choix structurels baked dans le graphe, pas des
reglages par personnage — meme partage des responsabilites que pulid_flux.py,
qui ne touche pas non plus a PulidFluxModelLoader/EvaClipLoader/InsightFaceLoader.

Un LoRA de personnage reste importable et activable EN PLUS du verrou
IPAdapter (pas a sa place) : le graphe peut porter un LoraLoaderModelOnly
bypasse par defaut, meme convention que le « LoRA realisme (bypass) / futur
LoRA Lena » deja present dans le workflow de Lena. Il ne s'active que si
config.json / identity / lora est renseigne ET que le role existe dans le
graphe — aucune chaine d'entrainement LoRA n'existe dans ce depot, donc tant
qu'aucun LoRA n'est entraine pour un personnage donne ce role reste inerte.

Injecte dans le graphe converti, depuis WorkflowRunner.api_for :
  - weight / weight_faceidv2 / start_at / end_at   <- config.json, cle `identity`
  - image de reference                              <- config.json, cle `base_gelee`
  - (optionnel) lora_name / strength / trigger_word <- config.json, cle
    `identity.lora`, seulement si presente
"""

REQUIRED_ROLES = {
    "ipadapter_apply": ("IPAdapterFaceID", "IPAdapter FaceID - verrou identite"),
    "ipadapter_ref": ("LoadImage", "BASE GELEE - reference d'identite"),
    # role optionnel : identity.apply() ne l'exige que si config.json /
    # identity / lora est renseigne (voir plus bas). Resolu ici de facon
    # tolerante comme le reste (comfy.py._roles()) -> None si le graphe ne le
    # porte pas encore.
    "character_lora": ("LoraLoaderModelOnly", None),
}

# Points de depart generiques de l'ecosysteme IPAdapter FaceID SDXL — PAS des
# valeurs mesurees pour Abyssiaelle, contrairement aux DEFAULTS de
# pulid_flux.py qui sont le reglage reel de Lena. A remplacer par la mesure
# reelle contre sa base gelee (skill nouveau-personnage etape 2 ; ROADMAP J6
# etape 6) avant toute premiere production.
DEFAULTS = {"weight": 0.7, "weight_faceidv2": 1.0, "start_at": 0.0, "end_at": 1.0}


def apply(api, roles, character_config, job):
    for role, (typ, titre) in REQUIRED_ROLES.items():
        if role == "character_lora":
            continue  # optionnel — verifie plus bas, seulement si demande
        if not roles.get(role):
            raise RuntimeError(
                f"verrou IPAdapter FaceID : role « {role} » introuvable dans "
                f"le workflow ({typ} / {titre!r}) — le graphe de ce "
                f"personnage doit porter le groupe d'identite")

    idc = {**DEFAULTS, **(character_config.get("identity") or {})}
    knobs = api[str(roles["ipadapter_apply"]["id"])]["inputs"]
    knobs["weight"] = float(idc["weight"])
    knobs["weight_faceidv2"] = float(idc["weight_faceidv2"])
    knobs["start_at"] = float(idc["start_at"])
    knobs["end_at"] = float(idc["end_at"])

    ref = character_config.get("base_gelee")
    if not ref:
        raise RuntimeError("verrou IPAdapter FaceID : config.json sans `base_gelee`")
    api[str(roles["ipadapter_ref"]["id"])]["inputs"]["image"] = ref

    lora = idc.get("lora")
    if lora and lora.get("name"):
        lora_role = roles.get("character_lora")
        if not lora_role:
            raise RuntimeError(
                "verrou IPAdapter FaceID : config.json / identity / lora "
                "demande un LoRA de personnage, mais ce workflow n'a pas le "
                "role « character_lora » (LoraLoaderModelOnly) pour le recevoir")
        lknobs = api[str(lora_role["id"])]["inputs"]
        lknobs["lora_name"] = lora["name"]
        lknobs["strength_model"] = float(lora.get("strength", 1.0))
        trigger = (lora.get("trigger_word") or "").strip()
        if trigger:
            positive = roles.get("positive")
            if positive:
                pknobs = api[str(positive["id"])]["inputs"]
                pknobs["text"] = f"{trigger}, {pknobs['text']}"
