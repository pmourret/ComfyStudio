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

### Jetonné en V1

- **Palette** — fonds (`--bg`, `--panel`, `--panel2`), lignes (`--line`,
  `--line2`), textes (`--txt`, `--dim`, `--dim2`), accent (`--acc`, `--acc-d`,
  `--on-acc` = texte posé sur un aplat clair), verdicts (`--ok`, `--warn`,
  `--bad`, `--high`, `--none`).
- **Familles de bandeau** — avertissement (`--warn-bg` / `--warn-line` /
  `--warn-txt`), danger (`--danger-bg` / `--danger-line` / `--danger-txt`),
  pastille « mesuré » (`--mes-bg` / `--mes-line`).
- **Typographie** — `--font` (texte courant), `--font-mono` (`.kbd`, raccourcis).
- **Forme** — `--r` (rayon des cartes), `--maxw` (largeur max du contenu centré).

### Laissé brut en V1 (à jetonner plus tard si un univers en a besoin)

- **Élévations** — `box-shadow: 0 … #000x` des menus, panneaux, modales, toasts.
- **Scrims** — `#000000aa` / `#ffffff55` des pastilles cochées, fonds de modale.
- **Ambiances ponctuelles** — dégradé du composeur, surlignage de la scène dans
  l'aperçu de prompt, fond du journal technique, bleu du badge « pose ».
- **Rayons secondaires** — les `border-radius` des contrôles (7–9 px) et pilules
  (20 px) restent en dur ; seul `--r` (cartes) est jetonné.

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
