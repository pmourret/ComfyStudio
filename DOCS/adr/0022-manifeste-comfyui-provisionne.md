# ADR-0022 : les custom nodes et modèles ComfyUI sont provisionnés depuis un manifeste versionné

## Statut

Accepté (2026-09-05)

## Contexte

`COMFYUI_ROOT` (ADR-0008) dit **où** vivre l'installation ComfyUI, mais rien
ne déclare **ce que** les workflows de ce repo y attendent : quels custom
nodes, à quelle version, quels fichiers modèles. Cette connaissance était
tribale, répartie entre deux docs de skill (`workflow-comfyui/references/
modeles-par-pack.md`, `pieges-noeuds-custom.md`) et un check qui exige un
ComfyUI déjà entièrement provisionné (`wf_check.py`, interroge
`/object_info` en direct). Le skill `comfyui-custom-nodes` le disait déjà
explicitement : *« Ce repo ne contient pas les custom nodes... Sans cette
trace, le pipeline devient non reproductible sur une autre machine — ce qui
est exactement le problème que la Mission "passage en public" cherche à
éviter. »*

Preuve concrète du problème, trouvée en auditant l'installation réelle de
cette machine pour ce chantier : `ComfyUI_PuLID_Flux_ll` (verrou d'identité
du pack Flux) tourne avec un **patch local non versionné** — sans lui,
`ApplyPulidFlux` lève `TypeError: pulid_forward_orig() got an unexpected
keyword argument 'timestep_zero_index'` sur toute version de ComfyUI ≥ 0.26
(la signature amont de `forward_orig` a changé, PuLID ne l'a pas suivie). Un
clone frais du repo, aujourd'hui, ne peut pas reproduire un pack Flux qui
marche — le patch n'existait nulle part ailleurs que dans les fichiers
modifiés à la main sur cette installation.

## Décision

Un fichier versionné, `AUTOMATION/comfyui_manifest.json`, déclare tout ce
qu'une installation ComfyUI doit porter en plus de son cœur : version
minimale du cœur, custom nodes (avec leur source — un commit git épinglé,
ou une version du Comfy Registry — et un éventuel patch local), fichiers
modèles (nom, sous-dossier `models/`, URL de téléchargement). Un module,
`AUTOMATION/comfy_provision.py`, sait lire ce manifeste et combler les
écarts (cloner/checkout/patcher/pip installer un nœud, télécharger un
modèle manquant) — jamais rien retirer de ce qui est déjà présent.
`comfy_server.ensure()` l'appelle automatiquement juste avant de démarrer
ComfyUI, jamais pendant qu'il tourne déjà.

Le **cœur ComfyUI reste un prérequis apporté par la personne qui installe**
— `ensure_core()` vérifie sa présence et affiche une instruction actionnable
(commande `git clone` exacte, ou pointer un ComfyUI déjà installé) au lieu
d'échouer sans explication, mais ne l'installe jamais lui-même. `COMFYUI_
ROOT` reste une configuration machine explicite et obligatoire — ADR-0008
n'est ni modifié ni supersédé, ce chantier se pose par-dessus lui.

Deux sources de custom node coexistent dans le manifeste parce que
l'installation réelle de cette machine les utilise réellement toutes les
deux : `ComfyUI_PuLID_Flux_ll`, `ComfyUI_IPAdapter_plus` et
`comfyui_controlnet_aux` sont des checkouts git (clonés/épinglés par
commit) ; `comfyui-impact-pack`, `-impact-subpack`, `comfyui_essentials`,
`ComfyUI-Crystools`, `ComfyUI-KJNodes` et `comfyui-advancedliveportrait`
viennent du Comfy Registry (`api.comfy.org`, résolu par nom + version,
sans dépendre de `comfy-cli` ni de ComfyUI-Manager). Vérifié réellement le
2026-09-05 : `comfy_provision.py --check` contre l'installation existante
ne rapporte aucun écart, et les deux mécanismes (clone+patch+pip pour
PuLID, résolution registre+téléchargement+pip pour Crystools) ont été
exécutés pour de vrai contre cette même installation — nœud déplacé,
reprovisionné, fichier patché comparé octet à octet à la version de
production, puis restauré.

## Alternatives envisagées

- **Provisionner aussi le cœur ComfyUI automatiquement** (git clone + venv
  + pip install torch avec le bon index CUDA, ou téléchargement automatique
  du build portable Windows officiel) — écarté : la détection GPU/CUDA
  correcte est la partie la plus fragile de tout installeur ComfyUI communautaire,
  pour une valeur ajoutée bien plus faible que provisionner les nœuds/modèles
  (le cœur ne change quasiment jamais une fois installé). Un prérequis
  manuel bien documenté, avec un message d'erreur actionnable, suffit —
  même choix déjà fait pour Node.js dans `AUTOMATION/tools/toolchain.py`
  (« Node itself is NOT installed by this script — it is the one
  prerequisite the developer brings »).
- **S'appuyer sur le format de snapshot de ComfyUI-Manager** plutôt qu'un
  manifeste maison — écarté : ajouterait une dépendance bootstrap (ComfyUI-
  Manager doit lui-même être installé et à jour) pour une fonction cœur du
  pipeline, et son format de snapshot ne sait pas exprimer un patch local
  appliqué après checkout (le cas PuLID).
- **Vérifier les modèles par hash** plutôt que par simple existence de
  fichier — écarté pour cette version : aucun incident mesuré ne le
  justifie encore (cohérent avec le reste du repo, qui n'ajoute une garde
  que sur un problème réel constaté).
- **Un manifeste par pack** plutôt qu'un seul fichier — écarté pour
  l'instant : deux packs seulement existent aujourd'hui, le tag `packs` sur
  chaque entrée suffit à documenter qui a besoin de quoi sans fragmenter le
  fichier ; un filtrage réel par pack peut se brancher plus tard sur ce même
  tag si le nombre de packs grandit.

## Conséquences

Un custom node ou un modèle qu'un workflow committé introduit se déclare
désormais dans `AUTOMATION/comfyui_manifest.json` dans le même commit
(règle ajoutée à `CLAUDE.md` et au skill `comfyui-custom-nodes`) — sinon il
reste une dépendance implicite qui ne se découvre qu'en production, exactement
le problème que ce chantier corrige. `workflow-comfyui/references/
modeles-par-pack.md` s'allège : il garde le POURQUOI (quelle famille de
modèle appartient à quel pack) et renvoie au manifeste pour la liste exacte,
plutôt que de la dupliquer.

Limite assumée : une quinzaine d'entrées modèle du manifeste n'ont pas
d'URL de téléchargement vérifiée (checkpoints/LoRA communautaires, sources
CivitAI probables) — marquées `"url": null` avec une note, provisioning les
signale comme manquantes sans les fabriquer ni deviner une URL. À compléter
au fil de l'eau, pas un blocage pour ce chantier.
