# Protocole de garde-fou identité

Consulté par le skill `workflow-comfyui` quand une modification de graphe
touche, de près ou de loin, le verrou d'identité d'un univers (`CLAUDE.md`
§4). La cohérence du visage prime sur le rendu : une image plus belle dont
le visage a dérivé est un échec, pas un compromis.

Les chiffres de ce fichier sont **mesurés**, pas estimés. Ils viennent des
campagnes A/B de l'univers `instagram-influenceur` (famille Flux + PuLID,
scoring InsightFace `antelopev2`) — voir `references/modeles-par-pack.md`.
Ils sont reportés ici **tels quels**, sans arrondi ni résumé, parce que
c'est leur précision qui donne au protocole son autorité : « 0.70 donne
0.44 » se discute, « ça dégrade l'identité » ne se discute pas.

## Le protocole — trois temps, dans cet ordre

Quand une demande touche une des lignes de la table ci-dessous, **ne pas
appliquer d'abord et commenter ensuite**. Dans l'ordre :

1. **Annoncer le chiffre mesuré.** Nommer la valeur, pas l'impression :
   « baisser `end_at` à 0.70 fait tomber l'identité mesurée à 0.44, sous le
   seuil de rejet ». Un chiffre se vérifie et se contredit ; un avertissement
   vague se contourne.
2. **Proposer l'alternative.** Chaque ligne de la table en porte une. Le but
   n'est pas de refuser la demande, c'est d'obtenir le même effet visuel par
   un chemin qui ne passe pas par le verrou d'identité — c'est presque
   toujours possible.
3. **Attendre l'accord avant d'éditer.** L'utilisateur peut vouloir la
   dégradation en connaissance de cause (un test, un A/B, une exception
   assumée). C'est sa décision, pas la nôtre — mais elle se prend informée.
   Une fois l'accord donné, appliquer la demande **entière**, sans la
   réduire en douce ni y revenir.

Ce protocole ne s'applique qu'aux lignes mesurées ci-dessous. Il ne se
généralise pas en demande de permission pour toute édition de graphe : sur
tout le reste, éditer normalement.

## Bandes de lecture du score d'identité

Bandes du code de ce repo (`AUTOMATION/qc_identity.py`, cohérentes avec
`config.json`) — ce sont celles qui font foi :

| Score | Lecture |
|---|---|
| **≥ 0.72** | conforme — seuil auquel la production existante a réellement été triée |
| **0.71** | **seuil d'alerte** (frontière OK/À_REVOIR observée entre 0.713 et 0.727) |
| 0.60 – 0.71 | dérive visible, à revoir |
| **< 0.60** | ce n'est plus le même visage |

**Deux divergences avec la documentation amont**, relevées le 27/08/2026 en
portant ce fichier — dans les deux cas c'est le code de ce repo qui est
retenu ci-dessus :

- La doc amont annonce une bande conforme **0.72 – 0.78**. `config.json`
  porte `qc.threshold_high: 0.74` avec la note que la plage réellement
  observée sur les 10 premières mesures est **0.674 – 0.749**, et que 0.75
  donnait *« un filtre toujours vide »* — `threshold_high` y est déclaré
  *« provisoire, à recalibrer sur quelques centaines de lignes de
  journal »*. La borne 0.78 n'est adossée à aucune mesure de ce repo.
- La doc amont place le plancher « ce n'est plus le même visage » à
  **0.55**. `qc_identity.py` et `config.json` (`qc.threshold_watch: 0.6`)
  disent tous deux **0.60**.

`threshold_high` reste à recalibrer : c'est une borne de **lecture** (filtre
« Excellentes » du tableau de bord), elle ne trie rien sur le disque.

Conséquence pratique, et elle est ferme : **la config est la source de
vérité, pas ce tableau** (invariant `CLAUDE.md` §8.4 — aucun seuil en dur,
lu depuis `CHARACTERS/<nom>/config.json` via API). Ce tableau sert à
raisonner et à parler à l'utilisateur ; tout code qui trie, alerte ou
affiche lit la config. Ne jamais recopier une de ces valeurs dans du code.

## Table de coûts identité par réglage

Chaque ligne est une modification qui **a été mesurée** comme dégradant
l'identité. Colonne « mesuré » = le chiffre à annoncer au temps 1 du
protocole.

| Modification demandée | Mesuré | Alternative à proposer |
|---|---|---|
| Baisser `end_at` de PuLID sous 1.00 | 0.70 → identité **0.44** ; 0.85 → **0.55** | la texture se récupère par le refiner (groupe 07) et le grain (groupe 10) |
| Mettre FaceDetailer **avant** le refiner | **0.42** (SDXL) / **0.31** (Krea) — rien ne rattrape le visage après le refiner | garder l'ordre refiner → FaceDetailer → grain |
| Piloter FaceDetailer par un modèle SDXL | **0.34** — le visage doit être re-rendu par Flux+PuLID | laisser le modèle Flux patché PuLID |
| Ajouter `Realistic_Adult_Flux` à 0.5 | le LoRA tire le visage vers son esthétique et concurrence PuLID | le groupe 07 fait mieux, sans effet de bord |
| Remplacer Flux par une archi non-Flux (Krea-2…) | PuLID ne s'applique pas (blocs `blocks.N.attn.*`) | Krea-2 reste valable **en refiner img2img** |
| Utiliser ReActor sur la branche NSFW | classificateur `vit-base-nsfw-detector` interne → carré noir 512×512 | verrou d'identité natif de l'univers + FaceDetailer (groupe N4), déjà en place |
| Éditer au-delà de ~1 MP sur la branche NSFW | netteté **11** à 2,06 MP contre **20** à 1,14 MP, **+25 %** de temps | éditer à ~1 MP puis remonter (4x NMKD-Siax) |
| Brancher un **ControlNet** dans une chaîne PuLID | **non mesuré** — les deux injectent dans les mêmes blocs Flux | passer d'abord l'A/B ; si l'identité chute, baisser `strength` puis `end_percent`, **jamais** toucher à PuLID |
| Ajouter les points de **visage** à un squelette OpenPose | impose l'orientation et la géométrie du visage source, concurrence le verrou | `detect_face: disable` dans le préprocesseur — corps et mains seulement |

Deux de ces lignes ont leur détail au niveau du nœud dans
`references/pieges-noeuds-custom.md` (ReActor, `detect_face`) — ici, c'est
leur **coût identité** qui est documenté, là-bas leur mécanique.

### Ce qui, dans cette table, dépend de l'univers

Les lignes citant PuLID, Flux ou un groupe numéroté valent pour l'univers
`instagram-influenceur` et son graphe de production. Un univers dont le
verrou est un LoRA de personnage ou un IPAdapter FaceID (`rpg-personnage`)
**n'a pas encore ses propres mesures** — n'en inventer aucune par analogie.

Ce qui se transpose sans mesure nouvelle, parce que c'est structurel et non
numérique :

- un étage qui re-rend le visage **après** le verrou d'identité le dégrade,
  quel que soit le verrou (d'où l'ordre imposé refiner → FaceDetailer →
  grain, invariant `CLAUDE.md` §8.5) ;
- deux mécanismes qui injectent dans les mêmes couches se concurrencent
  (LoRA de rendu vs verrou, ControlNet vs verrou) ;
- un collage de visage (face-swap) est toujours moins bon qu'un visage
  re-rendu par le verrou.

Sur un univers sans mesures, le protocole tient toujours — simplement, le
temps 1 devient « ce point n'est pas mesuré sur cet univers », ce qui est
une information, pas une esquive.

## Prompt et géométrie du visage

**Le verrou d'identité ne porte que la géométrie du visage.** Dans tout
nœud de prompt :

- **Ne jamais redécrire la géométrie faciale** (forme des yeux, du nez, des
  lèvres, structure osseuse) : le texte entre alors en concurrence avec le
  verrou. C'est l'invariant n° 8 de la liste d'édition du `SKILL.md`.
- **Toujours conserver l'ancre des attributs que le verrou ne transporte
  pas** — typiquement cheveux (longueur, couleur), yeux (couleur), marques
  de peau. Sans elle, ces attributs dérivent d'une génération à l'autre
  alors que le score d'identité, lui, reste bon : la mesure ne les voit pas.

La chaîne d'ancre concrète d'un personnage est une **donnée de personnage**,
pas un contenu de skill : elle vit dans sa banque de scènes /
`CHARACTERS/<nom>/` (ADR-0005), et se lit là plutôt que de se recopier ici.
Ce fichier ne documente que la règle.

## Après une modification à risque appliquée

Rappeler de passer le scoring d'identité sur la **série**, pas sur une
image : la dérive lente ne se lit pas sur une seule sortie. Un A/B à seed
fixe avant/après est le seul moyen de dire si le coût réel correspond au
coût annoncé — et si ce n'est pas le cas, c'est cette table qu'il faut
corriger, pas la mesure qu'il faut ignorer (`CLAUDE.md` §11).
