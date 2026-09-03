# ADR-0020 : Couche plateforme — registre singleton, `resolve()` ignorant, `execute_jobs` réutilisé

## Statut

Accepté (2026-09-03) — précise ADR-0017 et ADR-0018, ne les supersède pas.

## Contexte

ADR-0017 (J8.1) pose quatre couches et une règle : plateforme et pack ont le
droit de porter un graphe, monde et personnage jamais. ADR-0018 (J8.2) donne
au pack une carte de capacités (`{graph, roles}` par id), conçue
explicitement pour que la plateforme s'y range plus tard sans que la forme
change. Cette ADR est ce « plus tard ».

Une capacité de plateforme est agnostique du modèle : elle s'applique à une
image déjà produite, quelle que soit la famille qui l'a générée — upscale,
grain, recadrage, correction colorimétrique, watermark. Aucune n'avait
d'emplacement avant ce chantier. Symptôme concret trouvé en explorant :
l'upscale existe déjà, mais enterré dans le graphe de Léna seul.
`runner/comfy.py` bascule un groupe (`« 09 - UPSCALE IMAGE 2K »`) de
`lena_master_prod_ui.json` selon `preset.upscale_2k` ; le graphe
d'Abyssiaelle n'a que 2 groupes (identité + LoRA), aucun groupe d'upscale.
Si son `config.json` portait `upscale_2k: true`, `ui_to_api.convert()`
chercherait un groupe absent et ne ferait rien, **silencieusement**
(`nodes_in_group()` rend `[]` sur un titre introuvable, sans erreur). C'est
le trou concret que cette ADR ferme, au-delà du principe général.

## Décision

### 1 · `PLATFORM/capabilities.json` — un registre, pas un dossier par entité

À la différence de `PACKS/<id>/` (plusieurs packs) et `WORLDS/<id>.json`
(plusieurs mondes), la plateforme est un **singleton** : un seul fichier
plat, pas un id à résoudre. Même forme d'entrée `{graph, roles}` qu'un pack
(ADR-0018) — aucune modification du schéma.

`AUTOMATION/platform_capabilities.py` (nouveau module — **pas** `platform.py`,
qui masquerait le module standard du même nom) expose `capabilities()`,
`capability(cap_id)`, `capability_graph(cap_id)`, `require_capability(cap_id)`,
`CapabilityUnavailableError` : le jumeau exact des accesseurs de capacité
d'`AUTOMATION/universe.py` (J8.2), moins le paramètre `uid`. Aucune de ces
fonctions ne prend de `character_id` ni de `pack_id`.

### 2 · `universe.resolve()` ne connaît aucune capacité de plateforme

`resolve(type, style) -> pack` reste inchangé, dans les deux sens : une
capacité de plateforme n'y entre jamais, et une capacité de plateforme ne
consulte jamais `resolve()`. Une capacité de plateforme est **toujours
disponible** — elle ne demande jamais « ce pack a-t-il le droit ? » ni
« ce personnage a-t-il le droit ? ». `platform_capabilities.capability(
"upscale")` répond la même chose pour tout le monde, y compris un appelant
sans aucun personnage (même exigence que J8.3 pour les mondes : « lisible
sans qu'aucun personnage n'existe »).

Un monde peut fournir un réglage par défaut pour une capacité de plateforme
(ex. une cible d'upscale préférée) — jamais le graphe, jamais une condition
d'éligibilité. Aucun monde n'en déclare aujourd'hui ; rien n'est construit
pour cette possibilité tant qu'un besoin réel ne la justifie pas.

### 3 · Aucun résolveur unifié pack + plateforme

Un consommateur qui veut « les capacités disponibles pour ce personnage »
interroge les deux registres séparément (`universe.capability(pack, id)` et
`platform_capabilities.capability(id)`) — le pack ne participe jamais à la
résolution d'une capacité de plateforme, et réciproquement. Pas de second
appelant aujourd'hui pour justifier une fusion.

### 4 · L'upscale passe par `execute_jobs`, jamais une boucle à part

`AUTOMATION/runner/sortie.py::execute_jobs` (CLAUDE.md §8.2) a déjà un
paramètre `runner` injectable (`runner or WorkflowRunner(cfg, character_id)`).
`AUTOMATION/runner/upscale.py::UpscaleRunner` respecte le même contrat que
`WorkflowRunner`/`NsfwRunner` (`api_for`, `queue`, `wait`) et s'y substitue :
`run_upscale_batch()` construit des jobs à partir d'images déjà produites et
appelle `execute_jobs(jobs, cfg, checker, batch_id, character_id,
runner=UpscaleRunner(...))`. Tri, QC, journal viennent gratuitement,
inchangés — c'est le précédent que ce chantier choisit de **ne pas**
reproduire : `nsfw_batch.run()`/`editer()` ont leur propre boucle, séparée
d'`execute_jobs`, pour l'édition NSFW. Ce chantier réutilise `execute_jobs`
au lieu d'ajouter une troisième boucle.

**Preuve que `UpscaleRunner` ne consulte jamais le pack** : `upscale.py`
n'importe ni `universe` ni `identity` — vérifiable par grep
(`test_platform_capabilities.py` §2), pas seulement par relecture.
`character_id` y sert uniquement au namespacing de fichiers (isolation),
jamais à choisir un graphe ou une règle.

### 5 · Le graphe est extrait, pas réinventé

`WORKFLOWS/platform/upscale_ui.json` reprend les trois nœuds mesurés du
groupe 09 de Léna (`UpscaleModelLoader` → `4x_NMKD-Siax_200k.pth`,
`ImageUpscaleWithModel`, `ImageScale`) — netteté +31 %, identité -0,004,
mesuré le 24/08/2026, déjà génériques. Différence assumée : la cible de
`ImageScale` y était figée à `1440×1800` (le format 4:5 de Léna en dur — un
vrai bug de généricité, pas une fonctionnalité) ; le graphe autonome laisse
largeur/hauteur en widgets, pilotés par job depuis la taille réelle de
l'image reçue (`UpscaleRunner._target_size`, ×2 plafonné à 2560px de long
côté, arrondi au multiple de 16).

## Alternatives envisagées

- **Une boucle dédiée pour l'upscale (comme NSFW)** — écartée : la
  contrainte du chantier est explicite (« passe par execute_jobs, jamais un
  chemin parallèle »). Contrairement à l'édition NSFW (qui a son propre
  préambule, son propre garde-fou d'armement), l'upscale n'a besoin
  d'aucune règle spécifique que tri/QC/journal ne couvrent pas déjà.
- **`resolve()` étendu pour dire quelles capacités de plateforme un pack
  « autorise »** — écarté : contredirait directement la contrainte
  (« ne consulte jamais le pack ») et réintroduirait exactement le
  couplage que la couche plateforme existe pour éviter.
- **Un dossier `PLATFORM/<cap_id>/` par capacité, comme `PACKS/<id>/`** —
  écarté : la plateforme est UNE seule, pas une collection à discriminer
  par id. Un registre plat suffit et évite un niveau d'indirection inutile.
- **Un résolveur unifié pack+plateforme dès maintenant** — écarté, pas de
  second appelant pour le justifier (cohérent avec CLAUDE.md contre
  l'abstraction prématurée).

## Conséquences

- `PLATFORM/capabilities.json`, `AUTOMATION/platform_capabilities.py`,
  `AUTOMATION/runner/upscale.py`, `WORKFLOWS/platform/upscale_ui.json`
  nouveaux.
- `AUTOMATION/runner/__init__.py` réexporte `upscale.py` comme il le fait
  déjà pour `prompt.py`/`comfy.py`/`sortie.py`.
- Pas d'écran studio pour l'upscale dans ce chantier : le mécanisme et un
  point d'entrée programmatique testé, pas une surface Dashboard — un futur
  outil suivrait le skill `nouvel-outil` (patron 2) séparément.
- `grain`/`recadrage`/`correction colorimétrique`/`watermark` restent des
  candidats non construits : « premier habitant » veut dire un seul.
- `wf_check.py` n'est pas modifié : ses rôles `--roles`/`--famille` sont le
  contrat du graphe de PRODUCTION (pack), pas pertinents pour un graphe de
  plateforme. `WORKFLOWS/platform/upscale_ui.json` se valide par
  `wf_check.py` sans `--roles` (étapes génériques 1-4) puis `--essai`.
