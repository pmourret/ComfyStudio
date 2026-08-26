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

1. **IDs de nœuds : chaînes en format API, entiers en format UI.**
   Erreur fréquente sur ce genre de repo : appliquer la règle API en UI ou
   l'inverse. Vérifier le format (§ ci-dessus) avant de faire quoi que ce
   soit avec un ID. Ne jamais les renuméroter — les liens y font référence.
2. **Liens** : en format API, un input lié s'écrit `["node_id", slot]`. Un
   input littéral est une valeur directe. Le format UI est plus dense —
   voir `references/format-ui-mecanique.md` avant d'éditer un fichier UI à
   la main.
3. **Ajout de nœud** : attribuer un ID libre, câbler explicitement les
   inputs, vérifier qu'aucun nœud existant ne perd sa source.
4. **Suppression de nœud** : vérifier avant qu'aucun autre nœud ne le
   référence en input. Un lien orphelin fait planter le workflow à
   l'exécution, sans message clair.
5. **Seeds** : jamais fixé en dur sans le signaler. Seed fixe pour un test
   de reproductibilité, seed randomisé en production.
6. **Toute variante expérimentale part d'un fichier versionné**, pas d'une
   modification en place sur le fichier de production.
7. **Les réglages de production ne vivent pas dans le graphe.** Steps,
   guidance, seed, denoise, grain, résolution max : ces valeurs sont
   écrasées depuis `config.json` à l'exécution. « Changer les steps en
   prod » veut dire éditer la config, pas le graphe — éditer le graphe
   pour ça n'a aucun effet et fait perdre du temps à chercher pourquoi.
8. **Ne jamais redécrire la géométrie faciale dans un prompt** quand un
   verrou d'identité est actif — décrire les yeux/nez/bouche/forme du
   visage entre en conflit avec ce que le verrou impose. Garder l'ancrage
   sur les attributs que le verrou ne contrôle pas (tenue, pose, décor).
   Coûts mesurés et protocole : `references/protocole-identite.md`.

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

**Limite connue** : les deux niveaux ci-dessus exigent une instance
ComfyUI démarrée (`--essai` l'appelle directement, `--roles` interroge
`fetch_object_info` pour les types de nœuds connus). Un hook pre-commit
qui dépend de cette validation ne peut donc pas tourner ComfyUI éteint —
si un contrôle d'intégrité des liens en pur Python (hors ligne) existe
dans le repo, le préférer pour un hook local ; sinon c'est une limite
actuelle de l'outillage, pas un choix.

## Garde-fou identité — annoncer le chiffre avant d'appliquer

La cohérence du visage prime sur le rendu. Certaines modifications de
graphe ont un coût d'identité **mesuré**, et ce coût est souvent
contre-intuitif : le réglage qui « rendrait la peau plus texturée » est
justement celui qui fait tomber l'identité sous le seuil de rejet.

Quand une demande touche un de ces réglages, le protocole est en trois
temps : **annoncer le chiffre mesuré, proposer l'alternative, attendre
l'accord** — pas appliquer d'abord et commenter ensuite. La table des
coûts par réglage et le détail du protocole sont dans
`references/protocole-identite.md` : le consulter dès qu'une édition
approche le verrou d'identité, l'ordre des étages, ou un LoRA/ControlNet
qui injecte dans les mêmes couches.

Ce protocole ne vaut que pour les réglages listés là-bas. Sur tout le
reste du graphe, éditer normalement.

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

## Format de réponse attendu sur ce genre de tâche

Expliquer le pourquoi d'un changement de graphe, pas seulement le quoi.
Signaler les nœuds custom requis qui ne sont pas dans ComfyUI de base.
Si une modification demandée risque de dégrader la cohérence du
personnage, le dire avant de l'appliquer, pas après. Préférer une
modification incrémentale testable à une refonte complète du graphe.
Finir par ce qui reste à vérifier plutôt que de présenter le résultat
comme définitivement acquis.

## Pour aller plus loin

- `references/pieges-noeuds-custom.md` — pièges connus par nœud custom,
  à consulter avant de toucher à PuLID, IPAdapter, ControlNet aux, ou
  `comfyui_essentials`
- `references/modeles-par-univers.md` — quelle famille de modèle et quels
  nœuds appartiennent à quel univers (voir `CLAUDE.md` §4)
- `references/format-ui-mecanique.md` — mécanique interne du format UI
  (triplication des liens, compteurs d'ID, modes de nœud, `widgets_values`
  positionnel, appartenance géométrique aux groupes, ambiguïté de
  `find_node`) à consulter avant toute édition d'un fichier `_ui.json` à
  la main plutôt que via l'interface ComfyUI
- `references/protocole-identite.md` — protocole de garde-fou et table des
  coûts identité par réglage, avec les chiffres mesurés
