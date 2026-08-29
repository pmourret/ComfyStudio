# VAGUE 2 — primitives `<dialog>` + éditeur en mode (terminé)

Session « VAGUE 2 ». Plan validé avant patch (sections A→D). Le SHELL (vague 1)
reste clos — aucune réouverture de l'IA de navigation. Rien touché au runner,
aux workflows, à `CHARACTERS/`, à `routes/production`, à `shared_state`. Stack
inchangée : JS vanilla, modules ES, zéro build, zéro dépendance ajoutée.

Références : `.claude/rules/frontend.md`, `AUTOMATION/web/static/DESIGN.md`,
`DOCS/handoffs/2026-08-29-shell-studio.md` (« Ce qui reste ouvert »), skill
`audit-ux-ui`.

## Ce qui change

### 1 · Primitive `ui-dialog.js` (neuve, ~35 lignes)

`openDialog(el, {initialFocus, dismissable, onDismiss})` / `closeDialog(el)` sur
`<dialog>` natif : `showModal()`, focus déplacé dans la boîte à l'ouverture et
**rendu à l'élément déclencheur** à la fermeture (event `close`), Échap natif
(`cancel`), clic sur le backdrop = fermer quand `dismissable`. Aucune lib. Sert
`#armBox` (confirmation + armement NSFW) et `#declineBox`. **L'éditeur n'est pas
une modale** — c'est un mode (voir §3).

### 2 · Modales branchées sur `<dialog>`

- `index.html` : `<div id="declineBox">` / `<div id="armBox">` → `<dialog …>`
  (contenu `.card` / `#armCard` / `#declineCard` inchangé, **textes métier
  intacts**).
- `components.css` : les règles overlay `position:fixed;inset:0;background;
  display:none` + `.on{display:flex}` remplacées par `#armBox,#declineBox{border:0;
  padding:0;background:transparent;max-width:…}` + `::backdrop{background:#000c}`.
  Le centrage vient du UA `<dialog>`.
- `modal.js` `confirmer()` : via la primitive. `cancel`/backdrop → `resolve(false)` ;
  Entrée = valider (keydown local, hors bouton/lien) ; **supprimé** l'écouteur
  `document` Échap, le `boite.onclick` maison, la gymnastique `ancienClic`.
- `review.js` : `ouvrirArmement` / `ouvrirDeclinaison` / `fermerDeclinaison` via
  la primitive ; **supprimés** les handlers backdrop `$('#armBox').onclick` /
  `$('#declineBox').onclick`. `fermerDeclinaison` passé en `onDismiss` du
  `#declineBox` pour que Échap/backdrop nettoient aussi `DECLINE_SRC/DRY`.
- `review.js` keydown global (`#trier`) : branches Échap `#armBox`/`#declineBox`
  retirées (Échap natif) ; gardes anti-raccourcis `classList.contains('on')` →
  `.open` ; garde `#editorBox` → `document.body.classList.contains('editing')`.
- `advanced.js` : **rien** — hérite via `confirmer` (suppression de squelette de
  pose).

### 3 · Éditeur photo = mode, plus une overlay

- `index.html` : `#editorBox` **déplacé dans `<main>`**, `<div class="screen"
  id="editorBox">`. `.screen` / `.screen.on` (base.css) gèrent l'affichage.
- `screens.css` : `#editorBox{position:fixed;inset:0;z-index:40;background:#000d}`
  + `.on{display:flex}` supprimés → `#editorBox .edWrap{display:flex;height:100%;
  background:var(--panel);overflow:hidden}`.
- `components.css` : `body.editing .intbar{display:none}` (le curseur d'intensité
  n'a pas de sens pendant une retouche).
- `editor.js` : `ouvrirEditeur` mémorise l'écran courant (`ED_RETURN`), pose
  `body.editing`, bascule `.screen.on` vers `#editorBox`. `fermerEditeur` retire
  `editing` + revient à `ED_RETURN` (pas « toujours #trier »). Backdrop-click
  supprimé. Échap → `fermerEditeur` via un keydown local à `editor.js` (marche
  même focus dans un curseur `<input type=range>`).
- `nav.js` `go()` : `document.body.classList.remove('editing')` en tête — cliquer
  un onglet du chrome pendant l'édition quitte le mode proprement.

Le chrome (identité · nav · santé) **reste visible** pendant l'édition. Vérifié
en fumigation : `.tabs` visible, `body.editing` posé, `?character=lena` conservé,
retour sur l'écran d'origine après Enregistrer/Fermer/Échap.

### 4 · Nit Revue — onglet allumé sur `#galerie`

- `review.js` `syncTriageUi` : le sélecteur `[data-s="galerie"]` (retiré du
  chrome au shell) remplacé par `[data-s="trier"]` allumé dès `SPACE === 'lena'`
  (tous buckets SFW, `#galerie`/bucket OK compris). Le NSFW n'a pas d'onglet.
- `nav.js` `go()` : le surlignage d'onglet mappe `galerie` → `trier` (le hash
  `#galerie` partage l'écran `#trier`). **L'onglet Galerie n'est pas recréé.**

### 5 · Cartes cliquables générées en JS → `<button>`

- `create.js` : `.sc` (cartes de scène **et** carte « + créer une scène »)
  `<div onclick>` → `<button type="button">` + `aria-pressed`. `components.css`
  `.sc` reçoit le reset `display:block;width:100%;font/color:inherit;text-align:
  left` + `:focus-visible`.
- `review.js` : la vignette de `.tile` (`<img onclick>` ouvrant la vue Revue)
  enveloppée dans `<button class="thumb">` — accès clavier à la loupe depuis la
  grille. `.tile` reste un `<div>` (il contient les `<button>` de `.tacts`).
  `components.css` `.thumb` : reset + `:focus-visible`.
- **Déjà faits au shell, laissés tels quels** : `.it` (`create.js:201`),
  `.chip-t` (`create.js` / `review.js`), `.src` (`create.js:353`, `aria-pressed`).
  `.posecard` est un conteneur (seul `.del` clique, déjà `<button>`).

### 6 · `#idMenu` — disclosure tenu, semantique menu

Choix documenté : **pas de passage `<dialog>`** (un menu de navigation n'est pas
modal). `character.js` :

- `index.html` `#idMenu` : `role="menu"` + `aria-label`, `#idSwitch`
  `role="none"`, `.sep` `role="separator"`, les 2 `<a>` statiques
  `role="menuitem" tabindex="-1"` ; `fillSwitcher` ajoute `role="menuitem"
  tabindex="-1"` aux entrées injectées.
- `openIdMenu` : focus sur la 1re entrée à l'ouverture. `closeIdMenu` : focus
  rendu à `#btnId` si on était dans le menu.
- Roving `ArrowDown/ArrowUp/Home/End/Escape` sur `#idMenu`.
- `#btnId` garde `aria-haspopup="true"` + `aria-expanded`. Les entrées restent
  des `<a href="?character=…">` — **rechargement complet**, jamais de nav client
  (isolation par personnage, voir plus bas).

### 7 · `prefers-reduced-motion` (CIBLE A.4) — aucun patch

**Déjà couvert** par `base.css:13-17` : `@media (prefers-reduced-motion:reduce)`
global, `*,*::before,*::after`, `!important` (durées ≈ .01ms — préserve les
events `transitionend`, préférable à `animation:none`). + `screens.css` pour le
spinner wizard. Le CONSTAT du brief (« absent ») était périmé. **Non ajouté à
`tokens.css`** : ce fichier est la seule couche redéfinie intégralement par
chaque univers (DESIGN.md) — une règle de comportement y serait recopiée ou
oubliée par chaque peau. `base.css` (structure, commune) est le bon foyer.

## Isolation par personnage (point soulevé en session)

Modèle **inchangé**, plan **neutre** vis-à-vis de lui :

- `api.js` colle `?character=<id>` à **chaque** `/api/*` → Revue / Banque /
  Produire / Réglages ne voient que le personnage courant.
- Changer de personnage = `<a href="?character=<id>">` → **rechargement
  complet** (`#idMenu`, cartes du registre, wizard). Aucun état mémoire ne
  survit ; on ne consulte jamais un autre personnage, on ne fait que **partir**.
- Seule lecture inter-personnages : la **liste** du switcher (`/api/characters`,
  noms/ids/types) — read-only, agir dessus recharge.
- Fumigation : entrer dans le mode éditeur conserve `?character=lena` et le
  chrome (assertion ajoutée au test).

## Fichiers touchés

| Fichier | Changement |
|---|---|
| `AUTOMATION/web/static/ui-dialog.js` | **neuf** — primitive `<dialog>` |
| `AUTOMATION/web/static/index.html` | `#armBox`/`#declineBox` → `<dialog>` ; `#editorBox` → `<section class="screen">` dans `<main>` ; `#idMenu` rôles ARIA |
| `AUTOMATION/web/static/components.css` | règles `<dialog>` + `::backdrop` ; `body.editing .intbar` ; reset `.sc` / `.thumb` + `:focus-visible` ; `.idmenu a:focus-visible` |
| `AUTOMATION/web/static/screens.css` | `#editorBox` overlay → layout d'écran (`.edWrap{height:100%}`) |
| `AUTOMATION/web/static/modal.js` | `confirmer()` sur la primitive |
| `AUTOMATION/web/static/review.js` | armement/déclinaison sur la primitive ; keydown allégé (`.open`) ; `syncTriageUi` nit ; vignette `<button class="thumb">` ; import `fermerEditeur` retiré |
| `AUTOMATION/web/static/editor.js` | mode `body.editing` + retour à l'écran d'origine ; Échap local |
| `AUTOMATION/web/static/nav.js` | `remove('editing')` dans `go()` ; surlignage `galerie` → `trier` |
| `AUTOMATION/web/static/character.js` | `#idMenu` rôles + roving focus + focus move/restore ; `role="menuitem"` sur entrées injectées |
| `AUTOMATION/web/static/create.js` | `.sc` (cartes + « + créer ») → `<button type="button">` + `aria-pressed` |
| `AUTOMATION/tests/test_application_suppression_editeur.js` | `#armBox.on` → `#armBox[open]` ; `[6]` : chrome visible + `body.editing` + `?character=` conservé + retour Revue |

Aucune suite de test ajoutée (consigne).

## Vérification

- `node --check` OK sur les 8 modules touchés + le test adapté.
- **Fumigations navigateur — 5/5 vertes, 0 erreur JS** (`run_browser_tests.py
  --only test_ecran_registre,test_ecran_creer,test_apercu_prompt,
  test_pose_scene_card,test_application_suppression_editeur`, interpréteur
  Anaconda — `aiohttp`/`PIL`/`numpy` présents) :
  - `test_ecran_registre`, `test_ecran_creer`, `test_apercu_prompt` — nav,
    parcours Créer, aperçu de prompt intacts.
  - `test_pose_scene_card` — `.sc` en `<button>` : aller-retour scenes.json
    « octet pour octet » vert ; `test_apercu_prompt` clique `#sceneGrid .sc`.
  - `test_application_suppression_editeur` — `[3]`/`[4]` confirmations `<dialog>`
    (annuler), `[7]` suppression `confirmer()` `<dialog>` (confirmer), `[6]`
    éditeur en mode : ouverture, `.tabs` visible, `body.editing`, `?character=`
    conservé, canvas dimensionné, recadrage/rotation/curseurs, Enregistrer →
    retour Revue + `body.editing` retiré + copie créée.
- À repasser à la main (non couvert par les fumigations) :
  - focus rendu au déclencheur à la fermeture d'un `<dialog>` (Tab piégé,
    Échap/backdrop) ;
  - `#idMenu` au clavier : ouverture → 1re entrée, ↑↓/Home/End circulent, Échap
    ferme + focus sur `#btnId` ;
  - `.sc` / `.thumb` : Tab les atteint, Enter/Espace agit ;
  - `#galerie` (hash) → onglet Revue allumé ; bascule bucket OK/A_REVOIR sur
    `#trier` → Revue reste allumé.

## Ce qui reste ouvert

- **Look tokens** : palette / typo / espacement, hauteur de header (56 px
  monoligne), repli mobile des 5 onglets, largeur de l'éditeur sur petit écran
  (`.edSide` 280 px fixe). Hors session (« pour faire joli »).
- **File GPU riche** = vague 2 **backend** : `/api/state` n'expose qu'un batch
  courant, pas de file de jobs en attente. Zone SANTÉ honnête, non mockée.
- **`/img` non partitionné par personnage** : les octets d'image ne portent pas
  `?character=` (`api.js:5-8` renvoie ça à « J4 : partition `PROD/` par
  personnage »). `PROD/LENA/` est le seul arbre aujourd'hui. Backend, non touché.
- **Monolithes** `create.js` / `review.js` / `advanced.js` : non refactorés.
- **`character.js` : `PARAMS.get('character') || 'lena'`** — littéral
  pré-existant, neutralisé pour la nav par `body.no-character`, pas retiré.
- **`nav.go()` ne nettoie pas `ED_ITEM`/`ED_IMG`** quand on quitte l'éditeur par
  un onglet du chrome (au lieu de Fermer/Échap) : refs inertes derrière un écran
  `display:none`, écrasées au prochain `ouvrirEditeur`. Bénin.

Un 3ᵉ personnage emprunte le même chemin — aucun `if` sur l'id introduit.
