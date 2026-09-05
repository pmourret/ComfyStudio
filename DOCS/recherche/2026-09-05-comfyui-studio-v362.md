# ComfyUI Studio v362 — inventaire et pistes d'inspiration

Source inspectée : `H:\ComfyUIStudio\v362` (installation ComfyUI portable
« v360u », version App marquée v362, mise à jour 2026-09-05). Distribution
grand public généraliste (image/audio/vidéo/3D), **pas** conçue pour un
studio à personnages verrouillés comme SoulGlade — mais son panel d'outils,
sa gestion de modèles et son organisation de workflows recoupent plusieurs
sujets déjà ouverts côté SoulGlade (voir « Recoupements » en fin de doc).

## Arborescence racine

```
1-WORKFLOWS/   150 workflows JSON, curatés par catégorie (voir plus bas)
2-PROMPTS/     bibliothèque de styles (275 + 294 styles Fooocus/Flux, en .png+.csv)
3-POSE/        packs de poses de référence (Daz3D .tip.png — 5, 10, 647 poses)
4-MODELS/      manifeste de téléchargement (models.txt, 350 entrées) + mapping par workflow
5-APPS/        outils d'entraînement/annexes (ai-toolkit, OneTrainer, Fluxgym, ffmpeg, Zoom Video Composer)
App/           ComfyUI portable lui-même (python embarqué, 139 custom_nodes, modèles installés)
```

Le tout est piloté par un **Studio Launcher** (`5-APPS/Studio Launcher/`) :
une fenêtre WinForms (PowerShell) qui retrouve dynamiquement la racine du
studio (`App\ComfyUI\main.py`), lance le serveur, ouvre les dossiers
input/output et propose de créer un raccourci bureau. Rien de transférable
tel quel (SoulGlade est déjà un studio web), mais le principe « un seul
point d'entrée qui sait retrouver sa propre racine et exposer les actions
courantes » est un patron de lanceur simple et robuste.

## Catalogue des workflows (150 fichiers)

| Dossier | Nb | Contenu |
|---|---|---|
| `0-IMAGE/` (+ `FLUX/`, `QWEN/`) | 22 | un workflow par famille de modèle image : Flux (2, Klein, GGUF, Kontext, Krea, Original, SRPO), Qwen Image, HiDream, Ideogram, SD3.5, SDXL, Z-Image, Wan-image, Skin Fix |
| `1-AUDIO/` | 14 | TTS/voice cloning (Qwen3 TTS, VibeVoice, ChatterboxTTS, Fish Audio, DramaBox), séparation audio, musique (ACE-Step, Minimax), lipsync (FLOAT), sous-titres |
| `2-VIDEO/` (+ `WAN/`) | 32 | quasi tout le volume vidéo est du Wan 2.1/2.2 (23 variantes : VACE, Animate, FLF, SVI, talking-head, dance-transfer…), plus LTX 2.3, Minimax, HoloCine, FramePack |
| `3-CHARACTER/` | 3 | `CHARACTER.json` / `V2` / `V3` — **préparation de dataset identité** (InstantID + auto-crop face + groupe nommé « ID + POSE FACE DATASET FOR FLUXGYM ») : génère un jeu pose+visage prêt à entraîner une LoRA de personnage |
| `4-FACESWAP/` | 5 | ACE++ (Flux, inpaint identité), FaceSwap générique (Reactor-like, mask manuel/auto/vidéo/batch), ID 11 (InstantID, 11 groupes : sticker, wedding, pose+style batch…) |
| `5-BATCH/` | 10 | Wildcards, ABC Styler (une image par lettre de l'alphabet), 275/294 styles Fooocus, batch d'upscale |
| `6-INPAINT/` | 3 | Flux Fill + automask, Inpaint King/Pro |
| `7-UPSCALE/` | 8 | Latent upscale, Ultimate SD Upscale, SeedVR2 (image+vidéo), upscalers vidéo dédiés |
| racine (`1-WORKFLOWS/*.json`) | 40 | outils transverses : Expression Editor, Pose Editor, Portrait Master, Retouch Pro, PhotoMaker, LivePortrait, Segment Anything, Remove BG, 3D (Trellis/Hunyuan3D), panorama 360°, IC-Light, Try-on (CatVTON), watermark, Studio Nodes |
| `XXX/` | 13 | branche NSFW, **dossier séparé mais mêmes briques** (Flux, Wan, LTX, SDXL) recomposées avec prompts/LoRA différents — pas de moteur dédié |

## Custom nodes installés (139)

Le gros des node packs est de l'outillage générique connu de l'écosystème
(Impact/Inspire Pack, rgthree, KJNodes, Crystools, ControlNet Aux, IPAdapter
Plus, InstantID, Segment-Anything(2), ReActor, LayerStyle, Easy-Use,
GGUF loaders, VideoHelperSuite…). Deux paquets sont notables comme
**bespoke** plutôt que communautaires :

- `ComfyUI-Studio-nodes` — nodes propres à la distribution : calcul/resize
  d'aspect ratio « intelligent » (1MP auto, crop/stretch, orientation),
  un **Git Clone Manager** (clone dépôts GitHub/HuggingFace vers
  `custom_nodes/` ou `models/`, branches, submodules, tokens d'auth) et un
  **HuggingFace Downloader** — un système de mise à jour de modèles/nodes
  piloté depuis un workflow ComfyUI plutôt que depuis un script externe.
- `CharacterFaceSwap` — swap de visage orienté personnage récurrent
  (LoRA + embeddings + ControlNet ip2p), avec ses propres workflows fournis
  dans le repo du node.

Autres briques identité pertinentes : `comfyui_instantid`, `infiniteyou`,
`comfyui-reactor`, `ComfyUI-PhotoMaker-Plus`, `comfyui-advancedliveportrait`,
`ComfyUI-AutoCropFaces`, `comfyui_face_parsing`.

## Familles de modèles couvertes (`models.txt`, 350 entrées)

Image : Flux (dev, Kontext, Krea, SRPO, 2/Klein), Qwen-Image (+ Edit
2509/2511), HiDream-I1, Ideogram-4, SD3.5, SDXL, Z-Image-Turbo, ERNIE-Image.
Vidéo : Wan 2.1/2.2 (t2v/i2v/ti2v, 14B et 5B), LTX-2/2.3, HunyuanVideo 1.5,
FramePack. Audio : ACE-Step (1.0 et 1.5), MMAudio. Identité/contrôle :
InstantID, PhotoMaker, IP-Adapter, ViTPose, Qwen-Image ControlNet-Union.
Chaque entrée `models.txt` est `<url_huggingface> <dossier_cible>`, et
`4-MODELS/MODELS BY WORKFLOW/<NOM>/` répète le sous-ensemble utile à un seul
workflow — un modèle de « ce dont ce workflow précis a besoin » séparé du
manifeste global.

## Outils transverses les plus proches du panel SoulGlade

- **Expression Editor** — un seul node `ExpressionEditor` piloté par des
  `PrimitiveFloat` nommés en langage naturel (Turn head, Smile, Pucker
  Lips, Wink, Eyebrow, Mouth Open, Show Teeth…) + un groupe d'upscale
  SeedVR2 en aval. Contrat très proche de ce que fait déjà l'éditeur
  d'expression SoulGlade : sliders nommés → un seul node d'application.
- **Pose Editor** — deux variantes de graphe (SDXL / Flux) partageant un
  `PoseNode` 512×512 et un `Load Styles CSV`, avec un Redux/style-transfer
  optionnel activable via un `Fast Bypasser`.
- **Retouch Pro / Skin Fix / Portrait Master** — trois workflows distincts
  qui se recoupent (retouche peau, détails, high/low frequency restore),
  chacun avec plusieurs variantes de moteur (SDXL / Flux GGUF / inpaint) en
  groupes bypassables dans le même fichier plutôt qu'en fichiers séparés.
- **Load Styles CSV** — un loader de style (`styles.csv`, 275 ou 294
  entrées Fooocus) réutilisé tel quel dans une dizaine de workflows
  (Retouch Pro, Pose Editor, ID, Wildcards, ABC Styler…) : un seul registre
  de styles, consommé partout plutôt que dupliqué par outil.
- **ABC Styler / Wildcards / 294 Styles** — patrons de génération par axes
  (une image par style/lettre/wildcard, prompt assemblé par concaténation),
  proches dans l'esprit des « axes de création » indépendants de SoulGlade,
  mais ici portés par le graphe lui-même (nodes `Text Random Line`,
  `Wildcard Processor`, `Text Concatenate`) plutôt que par une couche
  d'orchestration externe.

## Entraînement d'identité (hors ComfyUI, dans `5-APPS/`)

`ai-toolkit`, `OneTrainer`, `Fluxgym` sont packagés comme apps annexes avec
leurs propres scripts d'install/start — trois chemins différents pour
entraîner une LoRA de personnage à partir d'un dataset. Le workflow
`3-CHARACTER/CHARACTER V3.json` est le pont : il prépare (pose + visage
recadré + prompts) le dataset que ces outils consomment ensuite. Aucun des
trois n'est un custom node ComfyUI — ce sont des apps Gradio/CLI séparées
lancées à côté.

## Organisation NSFW (`XXX/`)

13 workflows dans un dossier à part, mais qui réutilisent les mêmes moteurs
que le reste du pack (Flux, Wan, LTX, SDXL) avec des prompts/LoRA
spécifiques — aucun moteur ou node dédié au NSFW. C'est la même logique que
l'invariant SoulGlade « le NSFW ne construit jamais de sous-système propre,
il recompose les outils existants », observée ici comme pratique de fait
plutôt que comme principe explicite.

## Recoupements avec des sujets déjà ouverts côté SoulGlade

- `DOCS/ideas/2026-08-27_LOT_1.md` note déjà l'envie de (1) pouvoir modifier
  les workflows ComfyUI propres à l'appli et (2) vérifier les versions des
  modèles par défaut avec un système de mise à jour. Le couple
  `models.txt` (manifeste plat url → dossier) + `HuggingFaceDownloader` /
  `GitCloneManager` (`ComfyUI-Studio-nodes`) est un exemple concret et
  simple de (2) — un manifeste versionné à côté du code, pas une base de
  données.
- Le principe « registre de styles unique consommé partout » (`Load Styles
  CSV`) et « axes de génération portés par des nodes texte » (wildcards,
  ABC Styler) sont deux implémentations différentes de la même idée
  d'axes de création indépendants — utiles comme points de comparaison si
  la question revient, sans qu'aucun ne soit un patron à copier tel quel
  (SoulGlade porte cette logique dans son orchestrateur, pas dans le
  graphe).
- L'Expression Editor et le Pose Editor de ce pack sont vraisemblablement
  la source directe des écrans SoulGlade du même nom (`DOCS/design-pass/
  screen-expression-editor.md`, `screen-6-editeur-de-pose.md`) : utile de
  s'y référer si une question de contrat de nœuds (quels sliders, quel
  node d'application) se pose sur ces écrans.
