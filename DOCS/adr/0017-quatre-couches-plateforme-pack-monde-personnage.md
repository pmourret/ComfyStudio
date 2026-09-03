# ADR-0017 : Quatre couches de responsabilité — plateforme, pack, monde, personnage

## Statut

Accepté (2026-09-03).

## Contexte

ADR-0012 pose **quatre axes de création** (type, style, monde, pack) : à
quoi un personnage se résout quand il naît. Cette ADR répond à une question
différente, posée en session de cadrage : une fois le personnage créé, **qui
a le droit de porter un graphe ComfyUI à l'exécution** ? Les deux modèles
sont orthogonaux — l'un décrit une résolution au moment de la naissance,
l'autre une responsabilité au moment de l'exécution — et cette ADR ne
supersède ni ADR-0012, ni ADR-0013 (`edit_workflow` appartient au pack), ni
ADR-0015/0016 (un monde ne porte « aucun graphe »).

La réponse existe déjà dans le code, mais dispersée et jamais nommée comme
un seul modèle :
- `architecture.md` §5 dit que « posing, édition d'image, modification live
  par IA sont globaux » dans la même phrase où `edit_workflow` (ADR-0013)
  est décrit comme un graphe de **pack** — deux catégories différentes,
  traitées comme une seule.
- `nouvel-outil/SKILL.md` (patron 1) fait choisir entre « outil global » et
  « outil propre à un univers » sans jamais dire ce qui rend un outil
  éligible à « global » : dans les faits, c'est déjà le critère d'ADR-0013
  (a-t-il une famille de modèle à respecter ?), mais rien ne l'écrit.
- Concrètement, l'éditeur de pose (extraction OpenPose) et l'éditeur
  d'expression (`ExpressionEditor`) **portent chacun un graphe ComfyUI**,
  tout comme le graphe de production et `edit_workflow` du pack — mais les
  deux premiers s'appliquent à une image déjà produite, indépendamment de
  quelle famille de modèle l'a générée, alors que les deux seconds sont
  injectés par le mécanisme d'identité d'une famille précise. « Global »
  masquait cette différence de nature, pas seulement de portée.

Cette ambiguïté a un coût concret : sans nom pour la couche plateforme, rien
n'empêche un futur outil qui devrait être agnostique du modèle de finir
câblé comme s'il appartenait à un pack (ou l'inverse), simplement parce que
le vocabulaire ne force pas la question.

## Décision

Quatre couches de responsabilité, avec une seule règle qui les décide entre
elles — qui a le droit de porter un graphe ComfyUI :

| Couche | Porte | Droit au graphe | Exemple actuel |
|---|---|---|---|
| **Plateforme** | capacités agnostiques du modèle, appliquées à une image déjà produite | **oui** | éditeur de pose (extraction OpenPose), éditeur d'expression (`ExpressionEditor`), éditeur d'image |
| **Pack technique** | capacités liées à la famille de modèle | **oui** | graphe de production, `edit_workflow` NSFW (ADR-0013), verrou d'identité |
| **Monde** | données pures, unité distribuable | **jamais** | `WORLDS/<id>.json` : LoRA, `prompt_add`, catalogue de lieux (ADR-0015/0016) |
| **Personnage** | instance des deux couches précédentes, identité et seuils propres | **jamais** | `character.json`, `config.json` |

- **Plateforme** et **pack** peuvent tous les deux porter un graphe — ce qui
  les distingue n'est pas la présence d'un graphe, mais sa dépendance à une
  famille de modèle. Un outil plateforme fonctionne à l'identique quel que
  soit le pack qui a produit l'image en entrée ; un outil de pack est câblé
  au mécanisme d'identité et à la topologie d'une famille précise.
- **Monde** et **personnage** ne portent jamais de graphe — ce sont des
  données consommées PAR un graphe (de plateforme ou de pack), jamais des
  exécutants. C'est déjà vrai et testé (ADR-0015/0016 pour le monde,
  `character.json`/`config.json` pour le personnage) ; cette ADR nomme la
  règle générale dont ces deux décisions étaient des cas particuliers.
- Le champ `scope` de `tools.json` (`global` / `universe`) ne change pas de
  valeur — il encode déjà cette distinction, seul le nom qui l'explique
  était manquant.

## Alternatives envisagées

- **Garder « outil global » comme vocabulaire informel** — écarté : c'est
  précisément l'ambiguïté qui a motivé cette ADR (voir Contexte). Un mot qui
  décrit à la fois « pas propre à un univers » et « pas de famille de modèle
  à respecter » finit par confondre les deux un jour.
- **Fusionner plateforme et pack en une seule couche « outils »** — écarté :
  un outil plateforme n'a aucune famille de modèle à respecter (il vit
  correctement dans `AUTOMATION/` sans dépendre de `identity/`), un outil de
  pack en a une par construction (ADR-0013). Les fusionner effacerait la
  seule question qui décide où un nouveau module de code doit vivre.
- **Traiter le monde comme une variante de personnage** (tous deux « ne
  portent jamais de graphe ») — écarté : un monde est distribuable et
  partagé par plusieurs personnages (ADR-0016), un personnage porte des
  mesures et une identité qui lui sont propres. Les confondre en une seule
  couche perdrait cette distinction déjà actée.

## Conséquences

- `CLAUDE.md` invariant 7 réécrit pour couvrir les quatre couches, pas
  seulement le registre de pack.
- `architecture.md` §5 reformulé pour nommer les couches au lieu de
  « outil global » / « outil propre à un univers ».
- `nouvel-outil/SKILL.md` (patron 1) décide désormais explicitement entre
  couche plateforme et couche pack, avec cette ADR comme référence.
- `workflow-comfyui/SKILL.md` — qui est déjà la porte qui valide tout graphe
  avant commit — cite cette ADR comme critère : un graphe qui n'est ni
  plateforme ni pack n'a pas de raison d'exister.
- Aucun changement de comportement, de schéma de données, ou de test sur le
  fond : cette ADR nomme une distinction déjà vraie dans le code et déjà
  appliquée par ADR-0013/0015/0016.
