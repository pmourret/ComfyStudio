# Modèles et nœuds par pack

Consulté par le skill `workflow-comfyui` pour savoir quelle famille de
modèle et quels nœuds appartiennent à quel pack (voir `CLAUDE.md` §4 —
le verrou d'identité appartient au pack, pas au personnage). Un
personnage hérite intégralement de ce qui est listé pour son pack ; il
n'a pas à re-choisir sa famille de modèle.

## Pack `instagram-influenceur` — famille Flux

- Checkpoint : `flux1-dev-fp8` (all-in-one : MODEL+CLIP+VAE en un seul
  `Load Checkpoint`, pas de `t5xxl`/`clip_l` séparés à charger)
- LoRA de rendu : `Realistic_Adult_Flux_10`
- Verrou d'identité : **PuLID-Flux** (`ComfyUI_PuLID_Flux_ll`, fork
  lldacing) — `pulid_flux_v0.9.1.safetensors`, encodeur CLIP
  `EVA02_CLIP_L_336_psz14_s6B.pt`, InsightFace `antelopev2`
- Pose (ControlNet) : `FLUX.1-dev-ControlNet-Union-Pro-2.0` — **spécifique
  à cette famille**, ne fonctionne pas avec un checkpoint SDXL/Pony

## Pack `rpg-personnage` — famille SDXL/Pony

- Checkpoints réalistes : `juggernautXL_ragnarok`, `realvisxlV50`
  (Lightning), `intorealismUltra`, `ponyRealism`, `autismmix`. L'écosystème
  NSFW local installé est entièrement SDXL/Pony
- Verrou d'identité : **LoRA de personnage** (mot déclencheur propre à
  chaque personnage) et/ou IPAdapter FaceID / FaceID-plusv2 SDXL
  (`ComfyUI_IPAdapter_plus`)
- Pose (ControlNet) : nécessite un modèle ControlNet **SDXL** (ex.
  `controlnet-canny-sdxl-1.0`) — le modèle Union Pro 2.0 du pack Flux
  n'est pas utilisable ici

## Communs aux deux packs (pas à dupliquer par pack)

- **Qwen-Image-Edit** (`qwen_image_edit_2511_bf16` + encodeur
  `qwen_2.5_vl_7b_fp8`, type CLIPLoader `qwen_image`, + `qwen_image_vae`,
  lora Lightning 4-steps) : outil d'édition guidée par instruction,
  utilisé pour la modification live par IA et la reprise NSFW (§6 du
  `CLAUDE.md`) — indépendant de la famille du checkpoint de génération
  d'origine, s'applique sur l'image déjà produite
- `comfyui-impact-pack` / `-subpack` (FaceDetailer), `comfyui-kjnodes`,
  `rgthree-comfy`, `comfyui-easy-use`, `comfyui-custom-scripts`,
  `ComfyUI-GGUF`, `comfyui-videohelpersuite`, `comfyui-advancedliveportrait`,
  `comfyui-florence2` / `qwen_2.5_vl_7b` (captioning)
- `comfyui_controlnet_aux` (préprocesseurs, dont `DWPreprocessor` pour
  l'extraction de squelette) — indépendant de la famille de checkpoint

## Matériel

RTX 4070 Ti Super, 16 Go VRAM. Flux dev fp8 et SDXL passent large.
Qwen-Image-Edit en bf16 (~20 Go) dépasse la VRAM disponible → ComfyUI
offload en RAM, premier run plus lent après un changement de modèle chargé
(une variante GGUF via `ComfyUI-GGUF` reste possible si besoin de confort).
Une seule instance ComfyUI sert tous les packs (§2 du `CLAUDE.md`) — le
choix du checkpoint chargé à un instant T dépend du job en cours, pas d'une
instance dédiée par pack.
