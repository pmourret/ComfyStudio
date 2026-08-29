# SHELL STUDIO — le cockpit Léna devient app-shell (terminé, en attente vérif nav)

Session « SHELL STUDIO ». Plan validé par l'utilisateur avant patch. Rien
touché au runner, aux workflows, à `CHARACTERS/`, ni à la logique de
`create.js` / `review.js` / `editor.js` / `wizard.js`. Stack inchangée : JS
vanilla, modules ES, zéro build.

Référence produit : `DOCS/cadrage/2026-08-28-flux-usage-studio.md` (« Avancé
n'est pas un écran cible » ; chrome = identité · type/monde · Comfy · file).

## Ce qui change

Le chrome n'avait pas la bonne IA : header `Créer / Galerie / Revue` + un
menu `⚙ Avancé` fourre-tout (Personnages, Nouveau, Banque, Journal, Appli),
aucun sélecteur de perso une fois chargé, `#spaceSel` figé sur « Léna ».

Nouveau chrome permanent, en une rangée :

- **zone IDENTITÉ** — `.brand` (nom + `id` + tags type/monde, peints par
  `character.js`, inchangé) + bouton `#btnId ▾` ouvrant `#idMenu` :
  liste des **autres** personnages (`/api/characters`, chargée au 1ᵉʳ clic)
  → `?character=<id>` ; lien **Registre des personnages** (`#registre`) ;
  action **+ Nouveau personnage** (`#wizard`).
- **nav STUDIO** à plat, plus de `⚙ Avancé` :
  `Personnages` → `#registre` · `Produire` → `#creer` · `Revue` → `#trier`
  (bucket `A_REVOIR` ; `#galerie` = bucket `OK`, hash conservé) ·
  `Banque` → `#scenes` · `Réglages` → `#appli`.
- **zone SANTÉ** — `#dot` (Comfy up/down) + `#stTxt` (progression du batch
  `index/total · ETA`), tels quels depuis `/api/state` via `poller.js`,
  précédés d'un label `Comfy`.

Autres :

- **`#spaceSel`** : libellé « Léna » → **« SFW »**. L'attribut
  `data-sp="lena"` **ne bouge pas** — c'est la clé de fil (`/api/gallery`,
  `/img?space=…`, lue par `review.js`), pas un nom de personnage.
- **Wizard** = action du menu identité + carte du registre. Jamais un
  onglet du chrome.
- **Sas** (`?character=` absent) : `body.no-character` réduit le chrome à
  `Studio` + onglet `Personnages`. Onglets studio, `#btnId` et `.intbar`
  masqués tant qu'aucun perso n'est chargé — sans ça, `Produire` depuis le
  sas chargeait Léna en silence (`character.js` : `… || 'lena'`).
- **Registre vide** : la carte `+ Nouveau personnage` est désormais rendue
  **aussi** quand `CHARACTERS/` est vide (machine neuve, cas prévu
  ADR-0005) — avant, cul-de-sac sans chemin vers le wizard.
- **Journal** (`#journal`, historique des batchs) : sous-écran de
  `Réglages`, atteint par un lien dans `#appli`. L'onglet `Réglages` reste
  allumé quand on y est. Le `<pre>` de logs serveur de `#appli` est
  renommé « Journal du serveur » pour lever l'ambiguïté.

Aucun `if character == "lena"` introduit. Un 3ᵉ personnage passe par le même
chrome : identité via `/api/character`, switcher via `/api/characters`, nav
statique par `data-s`.

## Fichiers touchés

| Fichier | Changement |
|---|---|
| `AUTOMATION/web/static/index.html` | header réécrit (3 zones, plus de `.advwrap`/`.advmenu`) ; `#spaceSel` « Léna »→« SFW » ; `#appli` : lien vers `#journal` + titres désambiguïsés |
| `AUTOMATION/web/static/components.css` | `#btnAdv.on`/`.advwrap`/`.advmenu` → `.idwrap`/`.idmenu`/`#btnId` ; `.status-lab` ; `body.no-character` (masque onglets studio, `#btnId`, `.intbar`) |
| `AUTOMATION/web/static/nav.js` | `#advMenu`→`closeIdMenu()` ; suppression du toggle `#btnAdv.on` ; `#journal` garde l'onglet `Réglages` allumé ; câblage `.advmenu` retiré ; outside-click `.advwrap`→`.idwrap` ; Échap ferme `#idMenu` |
| `AUTOMATION/web/static/character.js` | `wireIdMenu()` / `closeIdMenu()` (export) / `fillSwitcher()` — le module possède la zone identité |
| `AUTOMATION/web/static/registre.js` | carte `+ Nouveau` factorisée, rendue aussi sur registre vide (`.empty` en `grid-column:1/-1`) |
| `AUTOMATION/web/static/poller.js` | `#nGal` gardé (`if (nGal)`) — plus d'onglet Galerie |
| `AUTOMATION/web/static/main.js` | `body.classList.toggle('no-character', !characterIsExplicit())` |
| `AUTOMATION/web/static/DESIGN.md` | inventaire : section « Chrome » (`.idwrap`/`.idmenu`/`.tabs`/`.status`/`body.no-character`) |
| `AUTOMATION/tests/test_ecran_creer.js` | `[8]` `.advmenu button`→`.tabs button` ; `[9]` `#btnAdv`+`.advmenu …`→`.tabs button[data-s="scenes"]` |
| `AUTOMATION/tests/test_application_suppression_editeur.js` | `[1]`/`[2]` `#btnAdv`+`.advmenu …`→`.tabs button[data-s="scenes"/"appli"]` |
| `AUTOMATION/tests/test_pose_extraction.js` | idem → `.tabs button[data-s="scenes"]` |
| `AUTOMATION/tests/test_pose_scene_card.js` | idem (×2) → `.tabs button[data-s="scenes"]` |

Aucune suite de test ajoutée (consigne).

## Vérification

- `node --check` OK sur les 5 modules touchés + les 4 tests navigateur
  adaptés.
- **Fumigations navigateur — 7/7 vertes**, 0 erreur JS
  (`run_browser_tests.py --only …`, interpréteur `python_embeded` de
  ComfyUI — le Python système n'a pas `aiohttp`) :
  - `test_ecran_registre` — sas → `#registre`, en-tête neutre « Studio »,
    `?character=abyssiaelle` court-circuite, carte `+ Nouveau` → `#wizard`.
  - `test_ecran_wizard` — parcours complet depuis `#charGrid .char-card--new`.
  - `test_ecran_creer` — `[1b]` en-tête = nom/id/tags du registre (identité
    peinte intacte) ; `[8]` « nav studio : registre, creer, trier, scenes,
    appli » ; `[9]` Banque via `.tabs` ; `[10]` Produire via `.tabs` ;
    `[11]` bandeau de panne OK.
  - `test_apercu_prompt`, `test_pose_scene_card`, `test_pose_extraction`,
    `test_application_suppression_editeur` (éditeur photo + suppression
    définitive + cycle vie appli : chrome refait ne perturbe ni `#editorBox`
    ni `#armBox` ni le tri ; tous les artefacts de test nettoyés).
- Graphe de nav à repasser à la main :
  - sans `?character=` → `#registre`, seul l'onglet `Personnages` visible,
    `.intbar` et `#btnId` masqués ;
  - carte perso → `?character=<id>` → `#creer`, nav complète, identité
    peinte, `.intbar` visible ;
  - `#wizard` depuis la carte du registre **et** depuis `#idMenu` ;
  - `Revue` → `#trier` `A_REVOIR` ; `#galerie` → bucket `OK` (inchangé) ;
  - `Banque` et `Réglages` sans passer par `⚙ Avancé` ; `⚙ Avancé` disparu ;
  - `#idMenu` : switch vers un autre perso → `?character=` rechargé,
    banque/buckets isolés ;
  - `#spaceSel` dit « SFW » pour `lena` **et** `abyssiaelle`.

## Ce qui reste ouvert

- **File GPU riche** = vague 2 **backend**. `/api/state` (`shared_state.STATE`)
  n'expose qu'un batch courant (`running`, `index`, `total`, `eta`) — aucune
  file de jobs en attente. La zone SANTÉ montre honnêtement Comfy + la
  progression du batch ; une vraie file demande une structure dans
  `shared_state` + `routes/production`. **Non mockée.**
- **Mode Éditeur plein écran** (cadrage §4 : « on ouvre un objet ») — pas
  abordé. L'éditeur (`#editorBox`) reste une modale ; le retour ne ramène
  pas à un « mode Studio » explicite.
- **Primitives `button`/`dialog`** — `#idMenu` reprend le pattern
  div-menu de l'ancien `.advmenu` (pas un `<dialog>` natif, pas de piège de
  focus ; Échap et clic-hors le ferment). Migrer `#idMenu` / `#armBox` /
  `#editorBox` vers `<dialog>` = chantier a11y séparé.
- **Look** : palette/typo/espacement, hauteur de header (toujours 56 px
  monoligne), repli mobile des 5 onglets (`@media(max-width:820px)` réduit
  juste le padding — 5 labels FR peuvent serrer sous ~1000 px).
- **`review.js:51`** (`syncTriageUi`) vise encore `.tabs button[data-s="galerie"]`,
  retiré du chrome : sur le bucket `Validées`/`#galerie`, **aucun onglet
  n'est surligné**. Bénin (pas d'erreur, pas de cul-de-sac). `review.js`
  hors périmètre de cette session — à nettoyer quand on y retouchera.
- **`character.js` : `PARAMS.get('character') || 'lena'`** — littéral
  pré-existant. Neutralisé pour la nav par `body.no-character`, mais pas
  retiré ; un vrai « pas de perso par défaut » est un fix plus profond.
- **Monolithes** `create.js` / `review.js` / `advanced.js` : non refactorés
  (constat de session).
