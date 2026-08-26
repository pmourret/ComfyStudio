# Grille de critique — les cinq axes

Consulté par le skill `image-realism-check` après l'étape provenance et
l'étape zoom. À parcourir sur les crops, pas sur la vignette.

## a) Dérive des attributs que le verrou d'identité ne porte PAS

C'est l'axe le plus mal diagnostiqué du lot. Le verrou d'identité (PuLID,
LoRA de personnage, IPAdapter FaceID selon l'univers) ne transporte que la
**géométrie du visage**. Tout le reste vient du prompt et dérive en premier
— et le score d'identité **reste bon pendant cette dérive**, parce que la
mesure ne regarde pas ces attributs.

Conséquence à retenir : **une dérive sur ces points n'est pas un problème de
verrou d'identité.** C'est le prompt qui a perdu son ancre, ou une étape
d'édition qui l'a écrasée. Proposer de toucher au verrou serait exactement
le mauvais réflexe (voir la table de coûts dans
`workflow-comfyui/references/protocole-identite.md`).

Comparer à l'**ancre déclarée du personnage** — elle vit dans sa banque de
scènes / `CHARACTERS/<nom>/`, pas dans ce skill (ADR-0005). Ce qu'on
regarde, dans cet ordre :

| Point | Ce qu'on cherche |
|---|---|
| **Sourcils** | **Priorité n° 1.** Dérive documentée sur l'univers `instagram-influenceur` : plus fins, plus « dessinés »/maquillés au fil d'une série, observée sur 3 générations consécutives d'un même prompt-pont. Les sourcils sont portés par le prompt sur tous les univers — c'est le premier endroit à regarder quelle que soit la famille de modèle. |
| **Marques de peau** (taches de rousseur, grains de beauté) | densité, dispersion, taille. Défaut typique : semis régulier « tamponné » en plaques symétriques, au lieu d'une dispersion irrégulière. |
| **Cheveux** | longueur et couleur par rapport à l'ancre. La dérive vers plus clair et plus court est fréquente sur les scènes très éclairées. |
| **Yeux** | couleur conforme à l'ancre. Point de contrôle QC historique du projet. |

## b) Sur-lissage de la peau

Le verrou d'identité lisse la peau — c'est structurel et assumé, pas un
bug. La question n'est donc **jamais** « est-ce lisse ? » mais « est-ce
lisse **alors que** la couche réalisme a tourné ? ». D'où l'étape provenance
en amont : sans elle, cet axe produit un faux diagnostic à tous les coups.

Signes à chercher dans le crop visage :

- pores absents sur les joues et le front, dégradé de carnation
  parfaitement propre ;
- transition front/cheveux nette au pixel, sans duvet ni cheveux fous ;
- cils et sourcils en masse uniforme plutôt qu'en poils distincts ;
- **zone du visage plus propre que le reste de l'image** — le décor a du
  grain, la peau non. C'est la signature d'un FaceDetailer qui a re-lissé
  **après** le refiner, donc d'un ordre d'étages inversé.

Le dernier point est le seul de cette liste qui soit **critique** : les
autres sont mineurs si les étages sont bien appliqués. Dans ce cas, le
signaler comme mineur et renvoyer vers le refiner et le grain.

**Ne jamais recommander de baisser l'emprise du verrou d'identité** (par
exemple `end_at` de PuLID) pour récupérer de la texture : c'est le piège
classique, il est mesuré (0.70 → identité 0.44) et la texture se récupère
par des étages qui ne touchent pas au visage.

## c) Lumière et ombres

- direction de l'ombre portée du sujet cohérente avec les ombres du décor ;
- température de la lumière sur la peau cohérente avec celle du fond —
  défaut courant : sujet en lumière neutre incrusté dans un fond doré ;
- **contact au sol** : présence d'une ombre de contact, sinon le sujet
  flotte. Très visible, souvent oublié ;
- spéculaires (yeux, lèvres, bijoux) orientés vers la même source ;
- profondeur de champ : le bokeh crémeux + golden hour est **la** signature
  « rendu IA » identifiée sur ce projet. Le signaler comme **choix
  éditorial**, pas comme défaut technique — c'est une décision de style, et
  la critique n'a pas à la trancher à la place de l'utilisateur.

## d) Mains, articulations, structure

- **doigts** : les compter, vérifier le nombre de phalanges et le sens des
  courbures ;
- poignets, coudes, genoux, chevilles : longueurs et torsions plausibles ;
- **points de contact main/objet** (mug, téléphone en selfie miroir) — la
  préhension est le défaut le plus fréquent et le plus visible à taille de
  publication. À vérifier en priorité dès qu'un objet est tenu ;
- symétrie des épaules, cohérence de la colonne sur les poses de profil ;
- vêtements : continuité des coutures, bretelles, ourlets d'un côté à
  l'autre du corps ; motifs qui ne se raccordent pas au pli.

## e) Propre à une branche NSFW

Le rattrapage d'identité y est **le verrou natif de l'univers +
FaceDetailer**. Un face-swap type ReActor y est proscrit — son
classificateur interne renvoie un carré noir 512×512, silencieusement (voir
`workflow-comfyui/references/pieges-noeuds-custom.md`).

Conséquence directe pour la critique : le visage est **re-rendu**, pas
collé. On ne doit donc voir **aucun artefact de collage**. En chercher un
est justement le test que la branche a fonctionné :

- liseré ou changement de netteté sur le contour du visage / la mâchoire ;
- rupture de carnation ou de température entre visage et cou/épaules ;
- visage plus net ou plus lisse que le corps, ou orienté différemment de la
  tête ;
- crâne/cheveux non raccordés au visage re-rendu.

Un seul de ces signes = **critique**. C'est le mécanisme de rattrapage qui a
raté, pas un défaut esthétique — la nuance change complètement l'action
proposée.

À vérifier aussi, propre à cette branche :

- **mollesse de la zone éditée** — signe d'une édition faite au-delà de
  ~1 MP (netteté 11 à 2,06 MP contre 20 à 1,14 MP sur l'A/B mesuré).
  Comparer la netteté de la zone éditée à celle du reste de l'image, pas à
  une table extérieure ;
- **le refiner ne doit pas rhabiller le sujet** — écart à la source mesuré
  stable (20.2 → 20.4) ; si des vêtements sont réapparus, c'est une
  régression du refiner, pas de l'édition ;
- **grain cohérent avec le reste de la production** — sans lui la sortie
  ressort trop propre par rapport aux autres (bruit de fond 3.71 contre
  3.62 côté SFW, sur l'A/B d'origine) ;
- anatomie, raccords peau/peau, cohérence des marques de bronzage et de la
  pilosité avec les sorties SFW du même personnage — traité comme n'importe
  quel autre défaut de continuité, ni plus ni moins.
