# Design system du tableau de bord

Deux couches, deux responsabilités (`.claude/rules/frontend.md`) :

| Fichier | Rôle | Change d'un univers à l'autre ? |
|---|---|---|
| `tokens.css` | **identité visuelle** : palette, typographie, forme | **oui** — c'est le seul fichier qu'un univers redéfinit |
| `base.css` | reset, primitives de formulaire et de bouton | non |
| `components.css` | composants (cartes, panneaux, grilles, modales, bandeaux) | non |
| `screens.css` | mise en page par écran + adaptation mobile | non |

Chargés dans cet ordre par `index.html`. `screens.css` en dernier : ce qui doit
primer sur un composant y est.

## Contrat de tokens

`base/components/screens` ne référencent l'identité visuelle **que** par
`var(--…)`. Aucune valeur en dur qui encoderait un choix de style. Un univers
fournit son propre `tokens.css` avec **les mêmes noms** et obtient un tableau de
bord cohérent, de structure identique, d'ambiance différente.

### Jetonné

- **Palette** — fonds (`--bg`, `--panel`, `--panel2`), lignes (`--line`,
  `--line2`), textes (`--txt`, `--dim`, `--dim2`), accent (`--acc`, `--acc-d`,
  `--on-acc` = texte posé sur un aplat clair), verdicts (`--ok`, `--warn`,
  `--bad`, `--high`, `--none`).
- **Familles de bandeau** — avertissement (`--warn-bg` / `--warn-line` /
  `--warn-txt`), danger (`--danger-bg` / `--danger-line` / `--danger-txt`),
  pastille « mesuré » (`--mes-bg` / `--mes-line`).
- **Profondeur** *(ajouté le 29/08/2026)* — `--elev` (ombre unique de toute
  surface qui flotte : `.idmenu`, `#gearPanel`, `.launch .inner`, `.ap`,
  `#toast`, `.card` des `<dialog>`), `--scrim` (voile posé sur du contenu :
  `::backdrop`, `#lightbox`, et les plaques sur vignette — `.sc .aff`, `.tick`,
  `.nav`, `.posebadge`, `.posecard .del`), `--focus` (anneau `:focus-visible`).
- **Typographie** — `--font` (texte courant), `--font-mono` (`.kbd`, raccourcis).
- **Forme** — `--r` (rayon des cartes), `--maxw` (largeur max du contenu centré).
  `--maxw` ne gouverne plus **tous** les écrans depuis le 29/08/2026 : Créer est
  passé en pleine largeur (voir ci-dessous). Les écrans-listes (registre, banque,
  revue, réglages, wizard) le gardent.

### Laissé brut, et pourquoi

- **Mouvement** — les deux seules durées de transition de l'inspecteur (fondu
  d'image `.28s`, barre de progression `.5s`) restent en dur : le bloc
  `prefers-reduced-motion` de `base.css` les écrase toutes, il n'y a rien qu'un
  univers voudrait redéfinir ici.
- **Détails de contrôle** — `0 1px 4px` du pouce de curseur, `0 2px 8px` de la
  pastille de score. Ce ne sont pas des surfaces flottantes : elles ne relèvent
  pas de `--elev`, qui les écraserait sous une ombre de menu.
- **Voile du cadre de recadrage** (`#edCropBox`, 40 %) — volontairement plus
  clair que `--scrim` : on doit voir l'image **hors** du cadre. Le passer au
  scrim serait une régression fonctionnelle de l'éditeur.
- **Liseré clair des pastilles cochées** (`#ffffff55`) — aucune famille de
  jetons ne décrit un rehaut clair ; en inventer une pour deux occurrences
  coûterait plus qu'elle ne rend.
- **Ambiances ponctuelles** — dégradé du composeur (désormais sur `--panel2`),
  surlignage de la scène dans l'aperçu de prompt, fond du journal technique,
  fond de vignette, bleu du badge « pose », noirs neutres des cadres image et
  du plan de travail de l'éditeur. Leurs valeurs ont été **retintées** avec la
  palette « Chambre noire » : elles étaient chaudes et faisaient des taches
  brunes sur le fond froid. Un univers qui les veut autrement les reprend ici.
- **Rayons secondaires** — les `border-radius` des contrôles (7–9 px) et pilules
  (20 px) restent en dur ; seul `--r` (cartes) est jetonné.

### Contrastes

Les valeurs de `tokens.css` sont vérifiées au ratio WCAG **contre les fonds où
elles servent réellement** — `--warn` porte du texte de 9,5 px sur `--warn-bg`,
`--dim` porte `#panneBar span` sur `--danger-bg`, etc. Tout texte est à 4,5:1 ou
mieux. Une nouvelle palette d'univers doit refaire ce contrôle : un jeu de
couleurs cohérent à l'œil peut très bien passer sous le seuil.

### Header

Depuis le 29/08/2026 le header ne porte plus la navigation : les cinq
destinations sont passées dans la **navbar latérale** (ci-dessous). Il ne garde
que ce qui répond à « où suis-je » — **`ComfyStudio · <personnage>`** et la
sonde ComfyUI.

Le header n'hérite pas de `--font` : ses zones ont des tailles propres
(16 / 13 px). Quand la largeur manque, l'identité se replie **du plus contextuel
au plus identifiant** (`screens.css`) : le monde sous 1100 px, le type sous
1000 px, puis sous 820 px l'identifiant technique **et le nom de
l'application** — savoir chez QUI on est prime alors sur savoir dans quel outil,
la navbar restant à l'écran pour le dire. Le **nom du personnage** ne disparaît
jamais.

## La navbar latérale

`.sidenav` (208 px, dans `.shell`, avant le rail) porte les **cinq
destinations**. `.tabs` reste la classe du conteneur : `.tabs button[data-s=…]`
est le **contrat** de navigation (`nav.js`, `review.js`, quatre fumigations) —
seuls le libellé et l'emplacement ont changé. Le bouton de repli vit **hors** de
`.tabs`, qui contient exactement cinq `data-s`.

*(`.sidenav` et pas `.nav` : `.nav` était déjà pris par les flèches
précédent/suivant de la Revue, dans `screens.css`, qui charge après.)*

| État | Navbar |
|---|---|
| personnage chargé | **208 px, libellés visibles** |
| `body.nav-mince` (préférence retenue) | 58 px, icônes seules |
| `body.focus` (mode de travail) | 58 px, icônes seules, header masqué |
| sous 1100 px | 58 px — imposé, pas une préférence |
| sas (`body.no-character`) | **absente** : entrer dans le studio, c'est choisir un personnage |
| mode éditeur (`body.editing`) | **présente** — c'est la sortie du mode, pas un outil |

En mode icônes les libellés sont retirés **visuellement** (`clip-path`), jamais
par `display:none` : ils restent le nom accessible du bouton. `studio.js` y pose
alors une infobulle portant ce libellé — c'est le seul moment où une bulle sur
une destination apprend quelque chose, et donc la seule exception à la liste
fermée des infobulles.

Sous 1100 px : **pas de hamburger, aucune destination repliée**, les cinq
restent atteignables en icônes.

## Deux modèles de largeur

| Modèle | Écrans | Règle |
|---|---|---|
| **Article centré** | registre, banque, revue, réglages, wizard | `.wrap` à `--maxw`, marges auto |
| **Poste de travail** | **Créer** seulement | `#creer .wrap.split` en pleine largeur ; l'inspecteur touche le bord droit du **viewport**, pas celui d'un wrap |

Depuis le 29/08/2026 les deux modèles vivent à droite d'un **rail** de 200 px
(voir ci-dessous) : « pleine largeur » et « centré » s'entendent désormais dans
`<main>`, pas dans le viewport. Le rail est hors de `<main>`, donc hors des deux
modèles — il ne défile pas et ne participe d'aucun wrap.

Créer a changé de modèle le 29/08/2026 : `--maxw` y laissait ~200 px de gouttière
de chaque côté sur un écran large, et l'inspecteur collait au bord droit du wrap.
La correction n'est **pas** de monter `--maxw` — ce serait garder le modèle et le
distendre. Les deux surfaces de chrome qui bordent l'écran suivent
(`#creer .launch .inner` par portée, `body:has(#creer.on) .intbar .inner` parce
que la barre d'intensité vit hors des écrans). La colonne de droite est en
`clamp(280px, 22vw, 420px)` : la borne haute est la largeur réelle de la vignette
servie, au-delà on afficherait un fichier remonté au-dessus de sa résolution.

## Le rail d'outils n'est pas une seconde navigation

`.rail` (200 px, hors de `<main>`, dans `.shell`) porte les **outils du pack**
— lus dans `UNIVERS/<pack>/tools.json` via `/api/universe/tools` — et les
raccourcis d'atelier. Les **cinq destinations de la navbar restent le chrome** :
aucune n'est recopiée dans le rail. Les deux colonnes se lisent côte à côte et
ne se confondent pas — la navbar dit **où aller** dans l'application, le rail
dit **quoi faire** sur l'écran courant.

| | Dans le rail | Jamais dans le rail |
|---|---|---|
| | outils déclarés par le pack, raccourcis Banque/Poses, ⚙ réglages de **génération** | Personnages, Produire, Revue, Application, n° de version, ETA (déjà dans `#stTxt`) |

Le rail ne connaît ni le personnage ni le pack (CLAUDE.md §8.7). Il lit le champ
`surface` de chaque outil et cherche ce que cette surface ouvre dans la table
`SURFACES` de `rail.js` — **une table de données, jamais un `if`**. Surface
inconnue → bouton **inerte qui dit pourquoi**, jamais une destination inventée.
Vérifié : Léna (`instagram-influenceur`) et Abyssiaelle (`rpg-personnage`)
rendent un rail identique, au caractère près.

Il s'affiche là où ses entrées ont une surface — **Produire et Banque** —, au
dessus de 1100 px, personnage chargé, hors mode éditeur. Sous 1100 px il
disparaît, et en mode éditeur aussi : ce sont des **outils**, la retouche a les
siens. La navbar, elle, reste dans les deux cas — c'est la sortie. La condition est écrite en `@media(min-width:1101px)` avec
`:not(.no-character):not(.editing):has(…)`, ce qui fait du masquage le défaut.

`--rail` (0 ou 200 px) existe pour **une** raison : `.launch` est
`position:fixed`, donc aveugle à la grille — sans `left:var(--rail)` la barre de
lancement passerait sous le rail. La variable porte exactement la même condition
que l'affichage : une condition écrite deux fois, jamais deux conditions.

## La banque a deux sous-vues

`#scenes` porte un `.seg` **Scènes | Poses** au-dessus de deux enveloppes
(`#bankScenes` / `#bankPoses`) que `setBankView()` montre ou masque — aucune
n'est repeinte à la bascule. Hash partageable : `#scenes` et `#scenes/poses`,
résolu par `ROUTES` dans `constants.js`, qui allume l'onglet **Banque** dans les
deux cas. L'onglet Banque rouvre toujours sur **Scènes** : la sous-vue laissée
au passage précédent n'est écrite nulle part dans l'URL.

La barre « Enregistrer scenes.json » reste visible sur les deux vues — elle
enregistre le document de l'écran, et une édition en attente sur l'autre vue
doit garder son bouton pendant que `#dirtyBar` avertit.

## Collision de noms de classe — la carte est scopée à sa grille

`sc` et `src` nomment chacun **deux à trois** choses différentes dans l'app : une
carte cliquable, et une ou deux étiquettes de texte. Tant que la règle de carte
était écrite `.sc{…}` / `.src{…}`, elle atteignait aussi les étiquettes et leur
posait `width:100%`, une bordure de 2 px et un curseur main.

| Classe | La carte | Les étiquettes qui portaient le même nom |
|---|---|---|
| `sc` | `.scenes .sc` (carte de scène) | `.fr.sc` (ligne « scène » de l'aperçu), `.bib .sc` (pastille de score) |
| `src` | `.srcgrid .src` (vignette de source NSFW) | `.fr .src` (provenance d'un fragment), `#declineBox .src` (sous-titre) |

C'est ce qui vidait l'aperçu du prompt de son texte : l'étiquette `.fr .src`
prenait toute la ligne et chassait `.fr .tx` hors du cadre — on lisait
« 5 % TENUE » et rien du fragment. Corrigé en scopant les règles de **bloc** à
leur grille ; les descendantes (`.sc .ph`, `.src .tick`…) restent non scopées,
elles ne trouvent rien à mordre ailleurs. Renommer aurait été plus propre mais
touchait le JS et le sélecteur de fumigation `.fr .src`.

**Règle pour la suite** : une règle de carte se scope à son conteneur. Un nom de
classe court (`sc`, `src`, `tx`, `fr`) n'est pas un identifiant global.

## Inventaire des composants

**Boutons** — `.btn` (+ `.primary`, `.sm`, `.danger`), `.link`.
**Contrôles** — `.seg` (segmenté, boutons `.on`/`:disabled`), `.chip-t` (pilule
à bascule), `.check`, `label.f` (champ + libellé), `input/select/textarea`,
`input[type=range]` (dans `.rg`).
**Cartes** — `.it` (intention), `.sc` (scène, avec `.ph`/`.tick`/`.info`/`.aff`),
`.tile` (vignette de tri), `.prop` (proposition du composeur), `.sceneCard`
(éditeur de scène), `.posecard` / `.src` (miniatures sélectionnables).
**Panneau de réglages** — `#gearPanel` > `.rgs` (section, `.pli` = repliée) >
`.rg` (un réglage : `.rgh`/`.rgv`/`.mes`/`.rge`/`.rgq`, états `.modif`/`.inerte`).
**Barre de lancement** — `.launch` > `.inner` > `.sum` / `.seg` / `.btn`.
**Exécution** — `.run` > `.bar` / `.strip` / `pre.log`.
**Inspecteur de l'écran Créer** *(29/08/2026)* — `#creer .wrap.split` (grille
deux colonnes) > `.cr-main` / `.cr-side` (collante) ; dans la colonne :
`.ins-shot` (cadre image, deux calques `.ins-layer` en fondu croisé,
état `.vide` + `.ins-void`) et `.ins-meta` (une `.meta`).
**Tri** — `.triage` > `.stage`/`.nav`/`.side`/`.meta`/`.score`/`.acts`/`.kbd`,
`.grid` de `.tile`, `.bars`/`.b2` (sous-scores), `.tacts` (actions directes),
`.badge` / `.chip` (score).
**Modales** — `#armBox` / `#declineBox` (`.card` centrée), `#editorBox`
(`.edWrap`), `#lightbox`.
**Bandeaux d'état** (haut d'écran, `flex:none`) — `#panneBar` (panne de
chargement), `#dirtyBar` (modifications non enregistrées).
**Chrome** — `.idwrap` / `.idmenu` (zone identité de l'en-tête : personnage
chargé + menu changer de perso / registre / nouveau), `.brand-av` (pastille
d'initiale, 32 px), `.brand-app` (nom de l'application), `.status` +
`.status-lab` (zone santé ComfyUI), `.intbar` (curseur d'intensité).
`body.no-character` réduit le chrome au sas.
**Navbar** *(29/08/2026)* — `.sidenav` > `.tabs` (les cinq destinations,
en colonne) / `.nav-ic` (icône SVG) / `.nav-lab` (libellé) / `.nav-foot` >
`.nav-chrome` (`#btnFocus`, `#btnNavPli`). États : `body.nav-mince`,
`body.focus`.
**Rail d'outils** *(29/08/2026)* — `.shell` (rail + `<main>` côte à côte) >
`.rail` > `.rail-grp` / `.rail-lab` / `.rail-it` (états `.on` / `:disabled`) /
`.rail-foot` (⚙, collé en bas) / `.rail-msg` (+ `.rail-ko` en panne).
**Sous-vues de la banque** *(29/08/2026)* — `.bankview` (un `.seg`) +
`#bankScenes` / `#bankPoses`.
**Divers** — `#toast`, `.empty` (état vide).
