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

### Laissé brut, et pourquoi

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
**Tri** — `.triage` > `.stage`/`.nav`/`.side`/`.meta`/`.score`/`.acts`/`.kbd`,
`.grid` de `.tile`, `.bars`/`.b2` (sous-scores), `.tacts` (actions directes),
`.badge` / `.chip` (score).
**Modales** — `#armBox` / `#declineBox` (`.card` centrée), `#editorBox`
(`.edWrap`), `#lightbox`.
**Bandeaux d'état** (haut d'écran, `flex:none`) — `#panneBar` (panne de
chargement), `#dirtyBar` (modifications non enregistrées).
**Chrome** — `.idwrap` / `.idmenu` (zone identité de l'en-tête : personnage
chargé + menu changer de perso / registre / nouveau), `.tabs` (nav studio à
plat), `.status` + `.status-lab` (zone santé ComfyUI), `.intbar` (curseur
d'intensité). `body.no-character` réduit le chrome au sas.
**Divers** — `#toast`, `.empty` (état vide).
