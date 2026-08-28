# ADR-0012 : Quatre axes de création — le pack se résout, la spécialisation s'injecte

## Statut

Accepté (2026-08-28) — complète ADR-0004, précise ADR-0006, ne supersède ni
l'un ni l'autre. Pose la couture que ADR-0007 (MCP lecture seule) devra
traverser le jour où l'édition de pack sera ouverte.

## Contexte

`CLAUDE.md` §3 pose trois axes (Univers, Personnage, Registre de création) et
§4 énonce que le style de sortie « découle » de l'univers. Le cadrage
`DOCS/cadrage/2026-08-28-flux-usage-studio.md` décrit un parcours
`type → style → monde` où la famille technique se **résout** en coulisse. Les
deux ne décrivent pas le même produit.

Quatre constats avant de trancher :

1. **Le code a déjà avancé sur l'écrit.** J4 (ADR-0010) a implémenté
   `output_styles` comme une map de `universe.json` dans laquelle
   `character.json` choisit un `output_style`, avec `prompt_add` et
   `checkpoint` par style. Le style est donc déjà une sélection *à
   l'intérieur* d'une famille, et il injecte déjà des valeurs dans le graphe.
   C'est `CLAUDE.md` §4 qui est en retard, pas l'implémentation.
2. **Le mot « univers » porte trois notions à la fois.** Les ids en place —
   `instagram-influenceur`, `rpg-personnage` — nomment un **type de
   personnage**. La famille technique réelle est `flux + pulid_flux` /
   `sdxl + lora_sdxl`. Et dans le langage produit, « univers » désigne encore
   un troisième objet : le monde narratif (post-apo, slow-life, cosplay).
3. **Deux notions du parcours n'existent nulle part.** Le **type de
   personnage** est encodé dans un nom de dossier. Le **monde** n'existe ni en
   registre, ni en champ, ni en catalogue.
4. **Un monde est porteur d'assets, pas seulement d'ambiance.** Un monde RPG
   médiéval et un monde post-apo n'emploient pas les mêmes LoRA. Un monde
   n'est donc pas un décor sans conséquence sur le rendu ni sur la mesure du
   verrou d'identité.

Conséquence directe : le wizard « nouveau personnage » ne peut pas être écrit
au-dessus du modèle actuel sans un `if` déguisé en table — il faudrait faire
choisir un dossier `UNIVERS/` à la main, c'est-à-dire faire choisir la famille
technique à l'utilisateur, ce que le cadrage interdit.

## Décision

### 1 · Quatre axes de création, plus le registre de création

| Axe | Ce qu'il décide | Qui le choisit | Mutabilité |
|---|---|---|---|
| **Type de personnage** | métier, panel d'outils, empty states, taxonomie de scènes | l'humain | figé à la création |
| **Style de sortie** | rendu (réaliste, fantastique, cartoon, manga…), `prompt_add`, checkpoint dans la famille | l'humain | figé à la création (ADR-0006) |
| **Monde / cadre** | LoRA de monde, `prompt_add`, banque de scènes, ton, peau UI | l'humain | **figé à la création** (§4) |
| **Pack / famille technique** | graphes de rôle, verrou d'identité, ControlNet de posing, `tools.json`, famille de modèle | **le système** | dérivé, jamais choisi à la main |
| **Registre de création** | image / vidéo / voix / multi-persos | valeur du registre (ADR-0004) | transversal, inchangé |

### 2 · Trois étages de spécialisation — un seul graphe

Un graphe de rôle se spécialise par style, par monde et par personnage **sans
qu'aucun de ces trois n'ait son propre fichier**. Ce qui varie et où :

| Ce qui varie | Porté par | Édité par |
|---|---|---|
| **Topologie** — nœuds, chaîne, verrou, ControlNet, ordre des étages | le pack de la famille technique | l'auteur du pack (§6) |
| **Assets de style et de monde** — LoRA, `prompt_add`, checkpoint compatible | l'entrée `output_styles` / l'entrée monde | Réglages d'univers |
| **Valeurs mesurées du personnage** — base gelée, LoRA perso et mot déclencheur, poids du verrou, seuils | `character.json` / `config.json` | le studio (création, puis Réglages) |

Le graphe reste **lu, jamais réécrit** pendant un job (`CLAUDE.md` §8.1) ;
`identity.apply()` injecte des valeurs, il ne sauvegarde pas un JSON.

**Il n'existe jamais un fichier de graphe par personnage.** Un personnage qui
rend mal se règle par la mesure, pas par un graphe parallèle — c'est la leçon
de J6 (Abyssiaelle : IPAdapter à 0, LoRA porteur). Corollaire opérationnel :
le wizard ne génère aucun graphe à la création, il **attache** le personnage au
pack de sa famille.

### 3 · La résolution est une table déclarative versionnée

`UNIVERS/resolution.json`, versionné, lu par `AUTOMATION/universe.py` via
`resolve(character_type, output_style) -> pack_id`.

- Une liste de règles `{ type, style, pack }`, plus un `default` par type.
- Aucune règle applicable → erreur explicite (`UnresolvedPackError`, sur le
  modèle de `UnknownUniverseError`). **Jamais de repli silencieux sur un pack
  par défaut** : un personnage rattaché en silence à la mauvaise famille de
  modèle est une panne invisible jusqu'à la première génération ratée.
- Ni `if`, ni dictionnaire en dur : ajouter un troisième pack est un diff de
  données, pas de logique.

`universe.json` gagne un champ **`types`** : la liste des types de personnage
que ce pack sert. La relation reste 1-1 en V1, mais le champ est une **liste
dès le premier jour**, pour que le 1-1 ne se pétrifie pas en loi.

### 4 · Le monde est un registre versionné, et il est figé

Nouveau registre versionné `WORLDS/<id>.json` : `id`, `label`,
`compatible_families`, `suggested_styles`, assets (`lora`, poids,
`prompt_add`), ton, jeton de peau UI, banque de scènes de départ.

Un monde est **figé à la création** du personnage, au même titre que le style,
et **pour la même raison** : il apporte des assets qui entrent dans le rendu et
que la mesure du verrou d'identité a validés pour ce visage. Changer de monde
invaliderait cette mesure. Ce n'est pas un gel narratif — écrire la raison
importe, sinon une session future « dégèlera » le monde en le prenant pour un
simple décor.

Le monde **ne choisit ni la famille de modèle ni le mécanisme d'identité**. Ses
assets doivent être compatibles avec la famille déjà résolue par
`(type, style)` : `compatible_families` filtre les mondes proposables dans le
wizard. C'est pourquoi le monde est le **troisième** choix du parcours, pas le
premier.

Limite de vocabulaire, à tenir dans l'UI : un influenceur slow-life qui fait un
shooting cosplay ouvre **une scène**, pas un monde. Sans cette limite, la liste
des mondes enfle et chaque entrée devient un LoRA à mesurer.

### 5 · Ce que `character.json` gagne

Deux clés : `type` et `world`. Le champ `universe` **reste** et porte le pack
résolu — aucune migration des deux personnages existants au-delà de l'ajout de
ces deux clés, aucun renommage de valeur.

Renseigner `type` et `world` pour Léna et Abyssiaelle fait partie de la
décision : leur pack actuel doit être exactement ce que la table rend pour leur
`(type, style)`. C'est le test de non-régression de cet ADR.

### 6 · Les packs et les mondes sont des données éditables

Le studio charge des packs et des mondes **conçus, testés et validés par
avance**. Ils ne sont pas gravés : l'humain doit pouvoir les faire évoluer pour
ses propres exigences — à la main, via un agent MCP, ou avec un outil local
type Qwen Edit.

Cette ADR ne fixe pas *comment* (forme d'un overlay, surface d'édition, format
d'un diff : à décider avec la matière, pas avant). Elle fixe ce qui reste vrai
quelle que soit la solution retenue :

- **Éditer un pack ou un monde est une action de Réglages d'univers**, jamais
  une étape de naissance d'un personnage.
- **`wf_check` est la porte unique** : humain ou agent, un graphe modifié n'est
  utilisable qu'après validation des rôles attendus par le runner.
- **Le runner ne mute jamais un graphe pendant un job**, quelle que soit
  l'origine de la modification.
- **Éditer touche le pack (ou une surcharge du pack), pas un personnage.** Tous
  les personnages de ce pack héritent du changement — et doivent donc être
  re-mesurés, pas re-générés.
- **ADR-0007 / `CLAUDE.md` §8.10 restent en vigueur** : MCP = lecture et
  validation seulement. Les ouvrir à l'écriture exige une ADR dédiée, pas une
  extension silencieuse de celle-ci.

## Alternatives envisagées

- **Garder trois axes et traiter le monde comme un style** — écarté : le style
  résout la famille technique, le monde s'inscrit dedans. Les fusionner
  interdirait deux mondes sur un même pack (post-apo et médiéval sont tous deux
  du SDXL) et obligerait à dupliquer un pack entier par monde.
- **Monde souple après la création** — écarté : envisagé tant qu'on croyait le
  monde purement narratif. Un monde porteur de LoRA entre dans le rendu et donc
  dans la mesure du verrou ; le rendre modifiable rendrait une fiche mesurée
  fausse en silence.
- **Un fichier de graphe par personnage** — écarté : obligerait le wizard à
  générer un graphe à la création (interdit par le cadrage), multiplierait par
  N tout correctif de la chaîne de production, et offrirait la mauvaise réponse
  facile au problème que J6 a résolu par la mesure.
- **Table de résolution en Python** — écarté : un troisième pack deviendrait un
  changement de code, alors que les registres univers et personnage sont déjà
  des fichiers qui se diffent, se commentent (`_notes`) et se réparent à la
  main (ADR-0010).
- **Renommer `UNIVERS/` en `PACKS/` dans le même mouvement** — écarté :
  migration de chemins, de tests, de skills et de deux dossiers de données pour
  un gain de vocabulaire. Un renommage se fait seul.
- **Figer dès maintenant la forme de l'overlay d'édition de pack** — écarté :
  une ADR acceptée est immuable ici ; on figerait la structure d'un objet que
  personne n'a manipulé. Les contraintes de §6 suffisent tant que le chantier
  n'est pas ouvert.

## Conséquences

- Le wizard `type → style → monde` devient écrivable sans `if` : trois choix
  humains, une résolution, une écriture de fiche. La famille technique n'est
  **pas un cran du wizard** — elle s'affiche en lecture seule, en petit, pour
  le debug (« machine : Flux · verrou visage »).
- Le libellé « attribuer un workflow au personnage » est banni de l'UI, des
  skills et des plans. Le verbe est **attacher au pack**.
- Changer de type, de style ou de monde = créer un autre personnage. Trois
  gels, une seule phrase dans l'UI.
- Les assets de monde sont **à mesurer**, comme les `prompt_add` / `checkpoint`
  des styles non-`realiste` de `rpg-personnage`, déjà signalés en placeholders.
  Un monde livré non mesuré est une dette déclarée, pas un monde prêt.
- `CLAUDE.md` §3 et §4 sont à réécrire. §4 **garde** « le verrou d'identité
  appartient au pack, pas au personnage » (confirmé par J5/J6) et **perd** « le
  style de sortie découle de l'univers ».
- ADR-0006 est **précisé, pas amendé** : le style reste figé ; il devient une
  **entrée** de la résolution et non une sortie de l'univers.
- ADR-0004 reste valable : le registre de création est un axe transversal,
  orthogonal aux quatre autres.
- Le repli `CHARACTERS/lena/config.json` en dur dans `AUTOMATION/wf_check.py`
  devient indéfendable dès que la résolution existe.
- Test d'isolation attendu (§11) : deux personnages-sondes de même
  `(type, style)` et de mondes différents se résolvent sur le **même** pack,
  reçoivent des assets de monde différents, et leurs banques ne fuient pas
  l'une dans l'autre.
- La mesure du verrou reste **par personnage** (leçon J6) : la résolution donne
  un pack, le monde donne des assets, ni l'un ni l'autre ne donne des poids.