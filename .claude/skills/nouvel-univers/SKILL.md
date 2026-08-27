---
name: nouvel-univers
description: A utiliser pour creer un nouvel univers sur la plateforme (famille de modele, mecanisme d'identite, panel d'outils initial) - chantier plus lourd et plus rare que l'onboarding d'un personnage, a ne lancer que si ROADMAP.md le prevoit.
---

# Créer un nouvel univers

## Avant de commencer

Créer un univers est un chantier plus lourd que d'onboarder un personnage
(skill `nouveau-personnage`) : ça engage une famille de modèle et un
mécanisme d'identité pour tous les personnages qui en dépendront ensuite.
Vérifier dans `ROADMAP.md` que ce nouvel univers y est bien prévu avant de
le lancer — ne pas en créer un pour un besoin ponctuel qui pourrait plutôt
être un outil (skill `nouvel-outil`) à l'intérieur d'un univers existant.

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
UNIVERS/<nom>/
  universe.json    # id, label, model_family, identity, posing, output_styles
  tools.json       # panel d'outils (étape 4)
```

`universe.json` (versionné — aucune donnée personnelle, cf. ADR-0010) :
- `identity` : nom de l'implémentation `AUTOMATION/identity/` (étape 2).
- `posing` : identifiant du modèle ControlNet compatible (étape 3), ou `null`.
- `output_styles` : **map** `{ style: { "prompt_add": str, "checkpoint": str|null } }` —
  les styles que l'univers peut produire et leur effet sur le pipeline. Le
  style d'un personnage est choisi dans cette map et **figé à sa création**
  (`CLAUDE.md` §3, ADR-0011). Un univers mono-style met `prompt_add: ""` et
  `checkpoint: null` (effet nul).

Le scan de `UNIVERS/` découvre l'univers — pas de fichier registre central.

## Étape 6 — Premier personnage comme validation

Un univers nouvellement créé n'est considéré opérationnel qu'une fois son
premier personnage onboardé avec succès (skill `nouveau-personnage`) et sa
première production validée. Si l'onboarding demande de modifier autre
chose que la config et les assets de ce personnage, l'univers n'est pas
encore généralisé correctement — corriger avant de considérer le chantier
terminé.
