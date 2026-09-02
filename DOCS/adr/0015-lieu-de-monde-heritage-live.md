# ADR-0015 : Un lieu de monde est hérité en direct, le personnage ne recouvre que ce qu'il change

## Statut

Accepté (2026-08-31) — précise ADR-0014 §1 et §3, ne le supersède pas.

## Contexte

ADR-0014 a tranché quatre points sur ce qu'est une scène, et le premier
laissait un trou nommé mais pas comblé :

> Les scènes vivent dans `CHARACTERS/<id>/scenes.json`, pas dans le monde. Le
> monde n'a qu'une **amorce**, copiée à la naissance par `create_character`
> puis **oubliée**. Une banque grandit ensuite à la main, elle ne se
> resynchronise jamais avec son monde.

Concrètement : `WORLDS/<id>.json` portait `starter_scenes`, une liste que
seul le wizard lisait, une seule fois. Éditer une entrée après coup ne
changeait rien pour les personnages déjà nés dans ce monde — le fichier
versionné et la banque d'un personnage divergeaient dès la première
génération, sans que rien ne le dise.

Le but de ce chantier est de lever CE point précis, et lui seul : un monde
gagne une liste de **lieux éditable**, et une scène de personnage qui
compose dans un de ces lieux en **hérite en direct** — sans jamais pouvoir
écrire dans le catalogue partagé.

## Décision

### 1 · `places` remplace `starter_scenes` — même catalogue, statut différent

`starter_scenes` est renommé `places` dans `WORLDS/<id>.json` et dans
`AUTOMATION/worlds.py`. La forme ne change pas (`id`, `label`, `intention`,
`prompt` — un CADRE, jamais une garde-robe : `worlds.CHARACTER_ONLY_SCENE_
KEYS` continue de refuser toute tenue/pose/format/compte au chargement,
ADR-0014 §2 tient). Ce qui change est que ce catalogue n'est plus consommé
une fois puis oublié : il est lu et écrit tant que des personnages composent
dans ce monde.

### 2 · Une scène liée à un lieu ne stocke que son overlay

Une scène de personnage née d'un lieu porte `world` / `origin: "world"`
(ADR-0014 §3, inchangé) et un nouveau champ, `world_ref` — l'id du lieu dont
elle hérite. Elle ne stocke **jamais** `label` / `intention` / `prompt` comme
une vérité à elle : ces trois clés sont toujours redérivées du catalogue au
moment où la scène est lue ou écrite (`worlds.merge_scene`). Ce qui lui
appartient en propre — `worlds.SCENE_OVERLAY_KEYS` : tenue, pose, format,
compte, variantes, tons, tags, intensité, guidance — est recopié tel quel.

Conséquence directe : le client (l'écran Banque) ne peut pas faire diverger
le cadre d'une scène de son lieu en l'éditant localement. Ce que le
navigateur envoie pour `prompt`/`intention` sur une scène `origin: "world"`
est **ignoré** — écrasé par la fusion avant que quoi que ce soit n'atteigne
le disque. C'est ce qui rend « le personnage surcharge sans écraser le
catalogue » vrai par construction, pas par discipline d'écran.

### 3 · Lecture / écriture du catalogue passent par des routes monde

`GET /api/worlds/{id}/places` et `POST /api/worlds/{id}/places`
(`api/routers/worlds.py`) sont les seuls points d'écriture de
`WORLDS/<id>.json`. `POST /api/scenes` ne les appelle jamais et n'écrit
jamais dans `WORLDS/`, quoi que le client envoie sur les clés de cadre d'une
scène — voir §2. Éditer un lieu affecte **tous** les personnages de ce
monde ; l'écran Banque le dit avant d'enregistrer (`PlaceInspector`).

Il n'existe pas de créateur de monde : ces routes éditent des lieux d'un
monde déjà versionné, elles n'en créent pas un nouveau.

### 4 · La fusion est matérialisée à la Banque et à la naissance, jamais dans build_jobs

`build_jobs` (`AUTOMATION/runner/prompt.py`) reste **strictement inchangé** :
il lit `scenes.json` avec `load_json` et prend `scene["prompt"]` tel quel,
comme avant cet ADR. Le test à l'octet près (ADR-0014 §5,
`tests/test_build_jobs.py`) n'est pas touché.

Ce qui rend la fusion « vivante » sans toucher `build_jobs` : deux points de
matérialisation, tous deux en amont.

- **`create_character`** : la banque d'un personnage neuf est écrite avec des
  scènes déjà fusionnées (`worlds.merge_scene`, même fonction que la Banque)
  — un personnage jamais ouvert dans le studio produit quand même un prompt
  correct dès son premier lancement.
- **`GET`/`POST /api/scenes`** (`api/services/bank.py`,
  `refresh_world_scenes`) : `GET` fusionne pour l'affichage, `POST` fusionne
  **avant** `validate_scene_bank` et avant l'écriture — c'est ce second point
  qui rend le fichier sur disque, celui que `build_jobs` lira, déjà à jour.

**Limite assumée, écrite plutôt que découverte** : un lieu édité après le
dernier chargement/enregistrement de la Banque d'un personnage n'atteint sa
prochaine génération qu'après un aller-retour par la Banque. La production
(`api/routers/production.py`) ne refusionne pas avant `build_jobs`. C'est
délibéré — la fusion vit à la frontière où une scène est écrite ou affichée,
pas à celle où elle est lancée, pour ne pas faire porter à `build_jobs` une
responsabilité qu'il n'a jamais eue.

### 5 · Un lieu qui disparaît casse au prochain enregistrement, on ne le répare pas

Si un lieu référencé par `world_ref` est retiré du catalogue,
`refresh_world_scenes` laisse la scène telle quelle plutôt que de lever —
une bande passante entière ne doit pas tomber en 500 pour une référence
morte. C'est `validate_scene_bank` (« prompt vide ») qui refuse au prochain
`POST /api/scenes`, exactement l'esprit d'ADR-0014 §4 : le serveur refuse, il
ne répare pas.

## Alternatives envisagées

- **Garder `starter_scenes` et ajouter `places` à côté** — écarté : deux
  catalogues de forme quasi identique dans le même fichier posent la
  question de savoir lequel le wizard lit, et dupliquent la donnée pour rien.
- **Refusionner aussi juste avant `build_jobs` en production** — écarté pour
  ce chantier : ça aurait touché les deux points de lancement de
  `api/routers/production.py` en plus de la Banque, pour un gain (un lieu
  actif à la seconde près) que rien dans la demande n'exigeait. Rouvrable
  plus tard si l'écart Banque → production s'avère gênant en usage réel.
- **Laisser le personnage éditer librement `prompt`/`intention` d'une scène
  liée, et fusionner seulement à l'affichage** — écarté : ça aurait recréé
  exactement le trou qu'ADR-0014 §1 décrivait, un fork silencieux entre ce
  que l'écran montre et ce que le monde dit.
- **Faire lever une erreur dure quand un lieu référencé a disparu** — écarté,
  même raisonnement qu'ADR-0014 « le serveur refuse, il ne répare pas » : la
  Banque entière ne doit pas devenir illisible pour une seule scène orpheline
  ; le refus se fait au bon grain, à l'enregistrement de CETTE scène.

## Conséquences

- `WORLDS/<id>.json` : `starter_scenes` → `places`, `_notes` corrigées.
- `AUTOMATION/worlds.py` gagne `place()`, `save_places()`, `merge_scene()`,
  `UnknownPlaceError`, `SCENE_OVERLAY_KEYS`.
- Nouvelles routes `api/routers/worlds.py` + `api/services/worlds.py` +
  `api/schemas/worlds.py`.
- `api/services/bank.py` gagne `refresh_world_scenes`, appelée par
  `GET`/`POST /api/scenes`.
- `create_character` construit l'amorce via `worlds.merge_scene` au lieu de
  copier `prompt`/`intention` à la main.
- Écran Banque : cran Monde | Personnage sur les scènes `origin: "world"`
  (`PlaceInspector`, `SceneInspector` en lecture seule sur le cadre côté
  Personnage).
- `tests/test_world_catalog_isolation.py` (neuf) verrouille l'isolation
  d'écriture dans les deux sens.
