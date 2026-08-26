---
name: workflow-comfyui
description: A utiliser des qu'un workflow ComfyUI (fichier JSON) est cree, modifie ou touche par du code d'orchestration. Couvre le contrat de lecture des workflows, le format UI/API, les regles d'edition de graphe et la validation obligatoire avant commit.
---

# Éditer un workflow ComfyUI sans le casser

## Le contrat qui prime sur tout le reste

**Les workflows sont lus, jamais réécrits par le code.** L'orchestration
convertit le fichier UI en format API à l'exécution (`ui_to_api.convert`) —
un changement fait dans ComfyUI est pris en compte au batch suivant, sans
maintenance d'une copie API à part. Ne jamais faire l'inverse (générer/écrire
un JSON de workflow depuis du code Python) : ça casse cette propriété pour
tout le monde, pas seulement pour le workflow touché.

## Format : deux formats JSON coexistent

- **Format UI** (`Save`) : `nodes`, `links`, positions, widgets. Éditable
  dans l'interface ComfyUI.
- **Format API** (`Save (API Format)`) : dict plat indexé par node ID, avec
  `class_type` et `inputs`. C'est celui utilisable en appel programmatique.

Toujours vérifier le format d'un fichier avant de le modifier. Ne jamais
convertir de l'un vers l'autre sans que ce soit demandé explicitement.
Convention de nommage : suffixe `_ui.json` / `_api.json`.

## Règles d'édition de graphe

1. **IDs de nœuds = chaînes, pas des entiers.** Ne jamais les renuméroter —
   les liens y font référence.
2. **Liens** : en format API, un input lié s'écrit `["node_id", slot]`. Un
   input littéral est une valeur directe. Ne pas confondre.
3. **Ajout de nœud** : attribuer un ID libre, câbler explicitement les
   inputs, vérifier qu'aucun nœud existant ne perd sa source.
4. **Suppression de nœud** : vérifier avant qu'aucun autre nœud ne le
   référence en input. Un lien orphelin fait planter le workflow à
   l'exécution, sans message clair.
5. **Seeds** : jamais fixé en dur sans le signaler. Seed fixe pour un test
   de reproductibilité, seed randomisé en production.
6. **Toute variante expérimentale part d'un fichier versionné**, pas d'une
   modification en place sur le fichier de production.

## Validation obligatoire après toute édition

La validation statique ne suffit pas — cas réel : un `ControlNetApplyAdvanced`
sans son entrée `vae` connectée (pourtant exigée par le modèle utilisé) est
passé inaperçu en validation statique, et a rendu tout un groupe inexécutable
pendant plusieurs jours. Toujours lancer les deux niveaux :

- `wf_check.py --roles` : types connus, conversion API, liens orphelins,
  nœud de sortie actif, rôles attendus par le runner
- `wf_check.py --essai` : fait valider **par ComfyUI lui-même** — seul ce
  niveau aurait détecté l'entrée manquante ci-dessus

Dix secondes de validation contre un batch raté. Ne jamais committer une
édition de graphe sans avoir lancé les deux.

## Activer/désactiver une partie du graphe sans dupliquer le fichier

Pattern à réutiliser plutôt que de créer un workflow variante : un groupe de
nœuds optionnel reste câblé dans le graphe (bypass par défaut), et
l'orchestration décide de l'activer **par job**, pas pour tout le batch, via
un mécanisme de `node_modes` appliqué à la conversion UI→API. Un seul
fichier de workflow porte alors plusieurs comportements possibles, pilotés
depuis la config/les données du job plutôt que par un choix de fichier.

## Données sensibles qui transitent par un workflow

Si un workflow reçoit en entrée une vraie photo d'un tiers (ex. extraction
de pose depuis une photo de référence) : la photo ne doit jamais persister
au-delà du traitement. Elle transite par le dossier d'input de ComfyUI le
temps du job, et repart dans un bloc `finally` — succès ou échec. Ce n'est
pas une option, c'est la même règle que le principe fondateur de la
plateforme (personnages fictifs, jamais de personne réelle) appliquée aux
données de passage.

## Pour aller plus loin

- `references/pieges-noeuds-custom.md` — pièges connus par nœud custom,
  à consulter avant de toucher à PuLID, IPAdapter, ControlNet aux, ou
  `comfyui_essentials`
- `references/modeles-par-univers.md` — quelle famille de modèle et quels
  nœuds appartiennent à quel univers (voir `CLAUDE.md` §4)
