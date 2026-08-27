# ADR-0008 : Le chemin ComfyUI est une configuration explicite

## Statut

Accepté (2026-08-27)

## Contexte

Avant J1, ce repo vivait DANS l'installation ComfyUI
(`ComfyUI_windows_portable/ComfyUI/output/OFM/`). Neuf modules déduisaient le
chemin de l'installation par position relative sur le disque
(`Path(__file__).parents[N]`), en comptant sur ce nombre exact de niveaux
d'imbrication : `lena_batch.py`, `comfy_server.py`, `expression.py`,
`nsfw_batch.py`, `pose_tools.py`, `web/app.py`,
`tests/backfill_embeddings.py`, `tests/mesure_pose_controlnet.py`, plus les
lanceurs `run_web.bat` / `run_batch.bat` (même calcul en `%~dp0..\..\..\..`).
Le fork vers ce nouveau repo a changé cette position sans changer le code,
et chaque `.parents[N]` résout maintenant vers un dossier qui n'a aucun
rapport avec l'installation réelle.

Le même type d'hypothèse s'était aussi glissée dans une valeur écrite en
dur : `expression.py` et le workflow `pose_extract_ui.json` utilisaient un
préfixe de sortie `OFM/PROD/...` / `OFM/INPUTS/POSE/...`, qui ne fonctionnait
que parce que `ComfyUI/output/` contenait littéralement `OFM/` — donc le
repo lui-même — avant J1. Une fois le repo déplacé, ce préfixe pointe vers
un dossier orphelin à l'intérieur de l'installation ComfyUI, sans rapport
avec le repo (voir `pose_tools.py` : l'extraction de pose échouait
silencieusement, le fichier annoncé par ComfyUI n'existant jamais à
l'endroit attendu).

Deux autres points dépendaient de la même hypothèse par un mécanisme
différent : le hook pre-commit invoquait un `python` générique — qui
fonctionne par hasard pour `wf_check.py` (aucune dépendance hors bibliothèque
standard) mais reste non déterministe dès que plusieurs interpréteurs
coexistent sur la machine — et deux skills (`comfyui-custom-nodes`,
`image-realism-check`) documentaient le chemin de l'installation et du
binaire `python_embeded` en dur dans leurs fichiers de référence.

## Décision

Le chemin de l'installation ComfyUI (et, dérivé de lui, l'interpréteur
Python à utiliser) devient une configuration machine explicite, lue depuis
un fichier `.env` à la racine du repo — jamais commité, documenté par
`.env.example` — via un module dédié, `AUTOMATION/env_config.py`. Ce module
est volontairement séparé de `AUTOMATION/config.json` : l'un décrit la
machine, l'autre les réglages mesurés d'un personnage ; les deux ne doivent
jamais se mélanger.

`COMFYUI_ROOT` est la seule variable obligatoire. `COMFYUI_PYTHON` est
optionnelle : par défaut déduite comme `<parent de COMFYUI_ROOT>/
python_embeded/python.exe` (la mise en page de la distribution portable
Windows, celle de cette machine), mais surchargeable pour toute autre mise
en page (installation source, venv, autre OS) — condition nécessaire pour
qu'un futur contributeur, sur une machine différente, n'ait qu'une variable
à changer. Il n'existe pas de variable séparée pour la racine InsightFace :
elle est toujours `COMFYUI_ROOT/models/insightface`, un sous-chemin fixe de
l'installation ComfyUI, jamais un second point de configuration.

Les préfixes de sortie qui supposaient `ComfyUI/output/` imbriqué dans le
repo (`expression.py`, `pose_extract_ui.json`) sont remplacés par un
espace de scratch neutre (`_LENA_EXPR`, `_LENA_POSE`) à l'intérieur du
dossier `output/` de ComfyUI, dont le code relit le nom réel via le champ
`subfolder` renvoyé par ComfyUI puis déplace explicitement le fichier vers
son emplacement final dans le repo — le même mécanisme que celui déjà
utilisé partout ailleurs dans le runner de production (`lena_batch.py`,
`mesure_pose_controlnet.py`), plutôt qu'une coïncidence de chemins.

Le hook pre-commit résout `COMFYUI_PYTHON` via `env_config.py` (un `python`
générique suffit pour ce seul appel, `env_config.py` n'a aucune dépendance)
puis l'utilise pour invoquer `wf_check.py`, au lieu d'un `python` non
déterministe. Les deux skills documentent désormais la résolution
dynamique du chemin plutôt qu'une valeur figée.

## Alternatives envisagées

- **Recalculer le bon nombre de `.parents[N]`** pour la position actuelle du
  repo — écarté : recasserait au prochain déplacement du repo, et casserait
  immédiatement pour tout contributeur dont l'installation ComfyUI n'est
  pas imbriquée de la même façon (condition nécessaire à un passage du
  dépôt en public, `CLAUDE.md` §2).
- **Une variable d'environnement système** (`setx COMFYUI_ROOT ...`) plutôt
  qu'un fichier `.env` — écarté : invisible à la relecture du repo, plus
  difficile à documenter pour un nouveau contributeur qu'un fichier
  `.env.example` versionné à côté du code qui le lit.
- **Une entrée dans `config.json`** — écartée explicitement (§2 de la
  consigne de ce chantier) : `config.json` porte des réglages de
  personnage, potentiellement appelé à devenir public ou à varier par
  personnage ; le chemin d'installation est une propriété de la machine,
  commune à tous les personnages, qui ne doit jamais transiter par ce
  fichier.

## Conséquences

Un nouveau contributeur (ou ce même repo déplacé une seconde fois) n'a
qu'à copier `.env.example` vers `.env` et renseigner `COMFYUI_ROOT` — aucun
code à toucher. `AUTOMATION/env_config.py` sert de point de vérité unique ;
tout futur module qui a besoin du chemin ComfyUI l'importe au lieu de
recalculer sa propre position sur le disque. Le hook pre-commit et les deux
skills concernés suivent la même source, donc ne divergent plus d'elle avec
le temps.
