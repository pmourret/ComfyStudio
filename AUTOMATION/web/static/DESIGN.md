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

Le header n'hérite pas de `--font` : ses trois zones ont des tailles propres
(16 / 14 / 13 px). Le rétrécir n'est donc pas un levier de place — mesuré au
pixel près le 29/08/2026. Quand la largeur manque, ce sont les **tags
d'identité** qui se replient (monde sous 1100 px, type sous 1000 px,
identifiant technique sous 820 px, dans `screens.css`) : le nom du personnage
et les **cinq onglets** ne disparaissent jamais, et aucun onglet n'est replié
dans un menu.

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
raccourcis d'atelier. Les **cinq onglets du header restent le chrome** : aucune
de leurs destinations n'est recopiée dans le rail.

| | Dans le rail | Jamais dans le rail |
|---|---|---|
| | outils déclarés par le pack, raccourcis Banque/Poses, ⚙ réglages de **génération** | Personnages, Produire, Revue, Réglages **de l'app**, n° de version, ETA (déjà dans `#stTxt`) |

Le rail ne connaît ni le personnage ni le pack (CLAUDE.md §8.7). Il lit le champ
`surface` de chaque outil et cherche ce que cette surface ouvre dans la table
`SURFACES` de `rail.js` — **une table de données, jamais un `if`**. Surface
inconnue → bouton **inerte qui dit pourquoi**, jamais une destination inventée.
Vérifié : Léna (`instagram-influenceur`) et Abyssiaelle (`rpg-personnage`)
rendent un rail identique, au caractère près.

Il s'affiche là où ses entrées ont une surface — **Produire et Banque** —, au
dessus de 1100 px, personnage chargé, hors mode éditeur. Sous 1100 px il
disparaît : les onglets suffisent, **pas de hamburger, aucune destination
repliée**. La condition est écrite en `@media(min-width:1101px)` avec
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
d'initiale, 32 px), `.tabs` (nav studio à plat), `.status` + `.status-lab`
(zone santé ComfyUI), `.intbar` (curseur d'intensité). `body.no-character`
réduit le chrome au sas.
**Rail d'outils** *(29/08/2026)* — `.shell` (rail + `<main>` côte à côte) >
`.rail` > `.rail-grp` / `.rail-lab` / `.rail-it` (états `.on` / `:disabled`) /
`.rail-foot` (⚙, collé en bas) / `.rail-msg` (+ `.rail-ko` en panne).
**Sous-vues de la banque** *(29/08/2026)* — `.bankview` (un `.seg`) +
`#bankScenes` / `#bankPoses`.
**Divers** — `#toast`, `.empty` (état vide).
