---
name: nouvel-univers
description: A utiliser pour creer un nouveau pack (ex-« univers ») - famille de modele, mecanisme d'identite, graphe de production, entree de resolution.json, character_defaults.json, panel d'outils. Chantier plus lourd et plus rare que l'onboarding d'un personnage, a ne lancer que si ROADMAP.md le prevoit.
---

# Créer un nouveau pack (« univers »)

Depuis ADR-0012, ce qu'on appelait **univers** est un **pack** : famille de
modèle + mécanisme d'identité + graphe de production + panel d'outils,
servant un ou plusieurs **types de personnage**. Le dossier reste `UNIVERS/`
(renommage `UNIVERS/`→`PACKS/` hors périmètre). Le personnage ne choisit
jamais son pack — il se **déduit** de `(type, style)` par
`universe.resolve()` / `UNIVERS/resolution.json`.

## Avant de commencer

Créer un pack est un chantier plus lourd que d'onboarder un personnage
(skill `nouveau-personnage`) : ça engage une famille de modèle et un
mécanisme d'identité pour tous les personnages qui en dépendront ensuite.
Vérifier dans `ROADMAP.md` que ce pack y est bien prévu — ne pas en créer un
pour un besoin ponctuel qui serait plutôt un outil (skill `nouvel-outil`)
dans un pack existant, ou juste un **monde** de plus (`WORLDS/<id>.json`) sur
un pack existant.

## Étape 1 — Choisir la famille de modèle

Déterminée par l'esthétique et les besoins de contenu visés par l'univers,
pas par préférence technique. Vérifier `workflow-comfyui/references/
modeles-par-univers.md` pour ce qui existe déjà avant d'introduire une
troisième famille — deux univers qui pourraient partager une famille de
modèle ne doivent pas en avoir deux implémentations séparées.

## Étape 2 — Mécanisme de verrou d'identité

Si la famille de modèle choisie a déjà une implémentation dans
`AUTOMATION/identity/` (voir `CLAUDE.md` §4), la réutiliser. Sinon, écrire
la nouvelle implémentation derrière l'interface commune — ne jamais
contourner l'interface pour un univers en particulier.

Contrat d'une implémentation `AUTOMATION/identity/<nom>.py` (voir
`pulid_flux.py` pour la référence, `DOCS/adr/0011`) :
- `REQUIRED_ROLES : dict[str, (type_nœud, titre|None)]` — les nœuds du
  graphe que l'implémentation pilote ; `WorkflowRunner._roles()` les résout
  et les ajoute à sa table.
- `apply(api, roles, character_config, job) -> None` — modifie le graphe
  **converti** (format API) **en place** : injecte les poids du verrou
  (lus dans `config.json` / `identity`, jamais en dur) et l'asset de
  référence du personnage (`config.json` / `base_gelee`). Même mécanisme
  que `WorkflowRunner.api_for` pour guidance/seed. `job` est fourni pour
  une variation par job éventuelle.
- Enregistrer l'implémentation dans `AUTOMATION/identity/__init__.py`
  (`_IMPLS`), et pointer `universe.json` / `identity` sur son nom.

L'implémentation est **choisie par l'univers**, partagée par tous ses
personnages ; seuls `config.json` / `identity` et les assets changent par
personnage. La couche de *mesure* (`qc_identity.py`, InsightFace) reste
commune à tous les univers — `identity/` ne fait que la génération.

Prévoir dès cette étape comment ce mécanisme sera **mesuré** par personnage
(voir skill `nouveau-personnage`, étape 2) — un univers sans méthode de
mesure d'identité claire n'est pas prêt à accueillir un premier personnage.

## Étape 3 — Posing, si prévu pour cet univers

Le posing est un outil global au niveau interface, mais son modèle
ControlNet sous-jacent dépend de la famille de modèle (voir
`workflow-comfyui/references/modeles-par-univers.md`). Identifier/valider
le modèle ControlNet compatible avant d'activer cet outil pour le nouvel
univers plutôt que de supposer que celui d'un autre univers fonctionne.

## Étape 4 — Panel d'outils initial

- Lister les outils globaux existants qui s'appliquent tels quels
  (`CLAUDE.md` §5 : édition d'image, modification live par IA, posing si
  étape 3 validée) — ne rien reconstruire qui existe déjà
- Lister les outils propres à ce monde (ex. un éditeur de lore pour un
  univers narratif) — ce sont des chantiers à part, pas à improviser dans
  la foulée de la création de l'univers si ROADMAP.md les place plus tard
- Écrire `UNIVERS/<nom>/tools.json` avec ce qui est réellement prêt, pas
  une liste d'intentions

## Étape 5 — Structure et enregistrement

```
UNIVERS/<pack>/
  universe.json            # id, label, model_family, identity, posing,
                            #   output_styles, types, workflow
  character_defaults.json  # gabarit stampé par le wizard dans un nouveau
                            #   CHARACTERS/<id>/ (config aux défauts du pack)
  tools.json               # panel d'outils (étape 4)
UNIVERS/resolution.json    # règles (type, style) -> pack + un default par type
```

`universe.json` (versionné — aucune donnée personnelle, cf. ADR-0010) :
- `identity` : nom de l'implémentation `AUTOMATION/identity/` (étape 2).
- `posing` : identifiant du modèle ControlNet compatible (étape 3), ou `null`.
- `output_styles` : **map** `{ style: { "prompt_add": str, "checkpoint": str|null } }`.
  Le style d'un personnage y est choisi et **figé à sa création** (`CLAUDE.md`
  §3, ADR-0011/0012). Un pack mono-style met `prompt_add: ""` /
  `checkpoint: null` (effet nul).
- `types` : **liste** des types de personnage que ce pack sert (ADR-0012).
  1-1 en V1, mais une liste dès le premier jour.
- `workflow` : chemin du graphe de **production** du pack. Le wizard y
  **attache** un nouveau personnage (`config.json` / `workflow`) — jamais un
  fichier de graphe par personnage (`CLAUDE.md` §8.11).

`UNIVERS/resolution.json` : ajouter une règle `{ type, style, pack }` par
couple exercé, **plus un `default` par type**. Sans règle applicable,
`universe.resolve()` lève `UnresolvedPackError` — jamais de repli silencieux
(ADR-0012).

`character_defaults.json` : `comfy_url`, `identity` (les `DEFAULTS` de
l'impl), `preset` / `formats` / `export_sizes` / `qc`, `scenes_seed`,
`creative_seed`. `identity` et `qc` portent `measured: false` : le wizard les
stampe, la mesure par personnage (skill `nouveau-personnage`, étapes 2 et 4)
les remplace.

Le scan de `UNIVERS/` découvre le pack — pas de fichier registre central.

## Étape 6 — Un monde compatible

Le wizard exige **au moins un monde** dont `compatible_families` inclut la
famille de ce pack (`WORLDS/<id>.json` : `id`, `label`, `compatible_families`,
`suggested_styles`, `assets`, `tone`, `ui_skin_token`, `starter_scenes`). Un
monde n'invente ni la famille ni le mécanisme d'identité — il apporte des
assets qui entrent dans le rendu, à **mesurer** comme le reste (un monde
livré avec des `assets` placeholder est une dette déclarée, pas un monde
prêt).

## Étape 7 — Premier personnage comme validation

Un pack n'est opérationnel qu'une fois son premier personnage onboardé
(skill `nouveau-personnage`) et sa première production validée. Si
l'onboarding demande de modifier autre chose que la config et les assets de
ce personnage — ou que la fiche du wizard —, le pack n'est pas encore
généralisé : corriger avant de conclure.
