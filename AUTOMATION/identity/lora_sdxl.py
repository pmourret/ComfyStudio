"""Verrou d'identite IPAdapter FaceID (+ LoRA de personnage optionnel) —
univers rpg-personnage (famille SDXL/Pony).

Mecanisme retenu a l'onboarding d'Abyssiaelle (J6, premier personnage de cet
univers) : IPAdapter FaceID par defaut, meme logique que PuLID-Flux pour Lena
— image de reference gelee, aucun entrainement necessaire.

MESURE REELLE (J6 etape 6, Abyssiaelle) : ce plan de depart ne tient pas.
Sweep sur weight/weight_faceidv2 (0.3 a 2.0, meme seed/prompt/LoRA) : le score
d'identite InsightFace BAISSE quand le poids IPAdapter MONTE (0.40 a w=0.7,
0.24 a w=2.0), et IPAdapter seul (sans LoRA, w=1.5) s'effondre a 0.09 — pire
que deux visages differents. Le LoRA de personnage seul (w=0, lora=1.0) fait
mieux que toute combinaison avec IPAdapter actif (0.51-0.63 sur 6 seeds, cadre
neutre). Pour CE personnage, IPAdapter FaceID ne verrouille pas l'identite,
il la degrade — le LoRA entraine porte seul l'identite reelle. Reglage retenu :
weight/weight_faceidv2 a 0.0 (role garde actif dans le graphe pour ne pas
toucher a l'univers, poids neutralise par la mesure -- CHARACTERS/abyssiaelle/
config.json). Un futur personnage du meme univers peut mesurer autre chose :
ce n'est pas une regle de l'univers, c'est une mesure PAR personnage (comme
partout ailleurs dans ce fichier). Noeuds confirmes
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
graphe — aucune chaine d'ENTRAINEMENT LoRA n'existe dans ce depot (un LoRA se
forme hors plateforme, ici via kohya_ss) ; ce role reste inerte tant que le
resultat n'est pas branche a la main. Abyssiaelle : `abyss1a_v1.safetensors`,
entraine le 20/07/2026 sur 53 images (mot declencheur `abyss1a`), branche J6
etape 6.

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

# Points de depart generiques de l'ecosysteme IPAdapter FaceID SDXL — remplaces
# par la mesure reelle d'Abyssiaelle (J6 etape 6, CHARACTERS/abyssiaelle/
# config.json / identity) des qu'elle existe ; ne restent DEFAULTS que pour un
# personnage rpg-personnage pas encore mesure.
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
