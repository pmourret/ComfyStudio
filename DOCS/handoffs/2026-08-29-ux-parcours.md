# Handoff — UX de parcours (fichier à chaîner)

**Date** : 29/08/2026 · **Base** : `2dec842` (rail d'outils + poses)
**Statut** : points 1 à 4 clos. Fichier ouvert — les points suivants de la
session UX viennent s'ajouter ici, sous leur propre section.

Ce fichier ne traite pas d'une surface (le rail, l'inspecteur, la banque) mais
d'un **parcours** : ce que le chrome promet, et si l'écran courant tient la
promesse. Isolation, rail et inspecteur sont clos ailleurs et ne sont pas
retouchés.

---

## 1 · Intensité bornée à Produire

### Le constat

`.intbar` était du **chrome global** : peinte sur Banque et Réglages, où elle ne
pilote rien. Pire que du bruit — changer de cran depuis ces écrans basculait
quand même le métier de Produire (génération ↔ édition NSFW) **sans que l'écran
courant le montre**. Un mensonge de parcours, pas un manque de place.

Elle était déjà masquée sur `body.no-character` et `body.editing` : deux
exceptions écrites en négatif, qui laissaient tout le reste par défaut visible.

### Le patch — une condition positive, pas une exception de plus

Le masquage devient le **défaut**, comme pour le rail :

```css
/* base.css */        .intbar{display:none; …}
/* components.css */  body:not(.no-character):not(.editing):has(#creer.on) .intbar{display:block}
```

Les deux règles `body.no-character .intbar` / `body.editing .intbar` sont
**supprimées** : elles sont maintenant portées par les deux `:not` de la
condition unique. `nav.js` n'a **aucune classe à poser** — `:has(#creer.on)` est
le même levier que celui qui donne déjà à `.intbar .inner` sa pleine largeur
(screens.css) et que celui du rail. Un levier, trois usages, pas trois
mécanismes.

**Hors media query, volontairement** : sous 1100 px la barre reste celle de
Produire — pas de repli différent, pas de crans grisés. Un cran désactivé
resterait la promesse d'un réglage sur un écran qui n'en a pas.

| Écran | `.intbar` |
|---|---|
| **Produire** (`#creer.on`), personnage chargé, hors éditeur | **affichée** |
| Banque, Revue, Réglages, Registre, Journal, Wizard | `display:none` |
| sas d'entrée (`body.no-character`) | `display:none` |
| éditeur photo (`body.editing`) | `display:none` |
| < 1100 px | **même règle**, pas un repli |

### L'état n'est pas perdu pour autant

`LEVEL` vit dans `create.js` et **n'est réinitialisé nulle part par `go()`** —
vérifié, aucune ligne à changer. Quitter Produire et y revenir rend le même
cran et les mêmes scènes filtrées. Retirer la barre là où elle n'agit pas ne
coûte donc rien à l'utilisateur : c'est un masquage, pas un reset.

### La pastille métier (`#intMode`)

Les crans nommaient une **intensité**, jamais le **métier** derrière. Au dernier
cran, « Générer » ne génère pas : il reprend une image déjà validée. Le curseur
ne le disait nulle part.

> **Édition — n'engendre rien, reprend une image validée**

- **Où** : dans `.intbar .inner`, à droite de `#intHint`, qui reste inchangé
  (« exportable · N scènes »). Une pastille, pas un modal, pas un emoji neuf.
- **Quand** : peinte par `majPastilleMode()`, appelée depuis **`syncEtapes()`** —
  la même source que les blocs de l'écran, appelée aussi bien par `setLevel()`
  que par le panneau de réglages.
- **Sur quoi** : `estEdition()`, **pas** `pipeline === 'flux+edit'`. Avec
  « générer avant d'éditer » coché, le cran qui édite **engendre d'abord** — la
  pastille dirait alors le contraire de ce que le lancement fait.
- **Absente en génération** : le cas par défaut n'a rien à annoncer, et une
  pastille permanente redeviendrait du décor.
- **Copy** : aucun nom de dossier (`PROD`, `_NSFW`) — le libellé dit le métier,
  pas le disque. Une assertion le garde.
- Tokens existants `--warn-bg / --warn-line / --warn-txt`, déjà la paire de
  `.alerte` et de `.ech .e`. Statut porté par le **texte**, pas par la couleur
  seule.

### Fichiers touchés

| Fichier | Quoi |
|---|---|
| `base.css` | `.intbar` masquée par défaut |
| `components.css` | condition positive unique + `.int-mode` |
| `screens.css` | commentaire réaligné : le `:has` de `.inner` n'est plus qu'un garde-fou de largeur |
| `index.html` | `<span class="int-mode" id="intMode" hidden>` + commentaire de bloc |
| `create.js` | `majPastilleMode()`, appelée en fin de `syncEtapes()` |
| `tests/test_ecran_creer.js` | section `[8b]` + assertions de pastille en `[1]`, `[3]`, `[7]` |

### Vérifié

`test_ecran_creer.js` **vert** (55 assertions), dont la section neuve `[8b]` :

```
[8b] l'intensite ne vit que sur Produire (29/08/2026)
  ok  #scenes : .intbar display = none
  ok  #appli  : .intbar display = none
  ok  #scenes / #appli : aucun cran cliquable
  ok  la barre revient sur Produire
  ok  le cran survit a l'aller-retour : 2 -> 2
  ok  les scenes restent filtrees par ce cran (1)
```

`getComputedStyle().display` et pas `isVisible()` : on veut le **motif** du
masquage — une règle CSS — pas seulement le fait qu'il ait eu lieu.

Verts aussi, inchangés : `test_panneau_reglages`, `test_apercu_prompt`,
`test_ecran_registre`, `test_ecran_wizard`, `test_pose_scene_card`,
`test_pose_extraction`, `test_scenes_aller_retour`,
`test_application_suppression_editeur`.

**Sonde jetable** (non commitée), 16 assertions vertes, sur les quatre cas que
la fumigation ne couvre pas :

- sas d'entrée sans `?character=` → `none`
- éditeur photo, et `body.editing` seul avec `#creer` encore allumé → `none`
- **Abyssiaelle (`rpg-personnage`) : comportement identique à Léna** — aucun
  `if character ==`, aucun `if universe ==`
- **900 px** : Produire `block`, les trois autres `none` — même règle

ComfyUI hors ligne (`--no-comfy`), comme les passes précédentes.

### Pas fait, volontairement

- **`#intSel` caché dans `#creer`** — non : c'est la barre entière qui part, pas
  ses crans.
- **`.intbar` déplacée dans `#creer`** — non : elle reste hors de `<main>` pour
  ne pas défiler.
- **Barre d'intensité recréée sur Banque / Revue** — non, jamais.
- **Crans désactivés au lieu de la barre masquée** — non (voir plus haut).
- `#gearPanel`, rail, inspecteur, hints : **non touchés**.
- Renommage d'onglet, `hints.js`, J7 métier, `/img/base` : hors scope.

### Ouvert

- L'apparition de la pastille n'est pas annoncée à un lecteur d'écran
  (`aria-live`). Le changement suit un clic sur le contrôle voisin, donc le
  contexte est là — à trancher si un point suivant touche l'annonce d'état.

---

## 2 · Onglet Application

### Le constat

Deux objets s'appelaient **Réglages**, et l'onglet nommait le mauvais :

| Ce qui s'appelait « Réglages » | Ce que ça règle |
|---|---|
| l'onglet du chrome → `#appli` | arrêt du serveur local, ComfyUI, journaux |
| ⚙ de la barre + ⚙ du rail → `#gearPanel` | une **génération** (guidance, refiner, grain…) |

L'écran `#appli` s'intitulait déjà « Tableau de bord » : le chrome et l'écran ne
disaient pas la même chose, et aucun des deux ne disait ce que l'écran fait.

### Le patch — un libellé, pas un contrat

```html
<button data-s="appli">Application</button>
```

**Intangibles, et vérifiés comme tels** : `data-s="appli"`, l'id `#appli`, le
hash `#appli`, `go('appli')`, `ROUTES`, et la ligne de `nav.js` qui garde
l'onglet allumé depuis `#journal` (`$('.tabs button[data-s="appli"]')`). Rien de
ce qui navigue ne passe par le texte.

**Gardent leur mot, parce que c'est le bon là** : `#railGear`
(« ⚙ Réglages de génération »), `#gearPanel h3` (« Réglages »), et le `title`
de `#btnGear` — les infobulles sont le point 6, pas celui-ci. Le menu identité
ne parlait déjà pas de Réglages.

### L'écran prend le nom de son onglet

Option retenue : **aligner** (« Application ») **+ la ligne** — pas deux titres
différents sans phrase.

```html
<h2>Application</h2>
<p class="tiny">Serveur local et ComfyUI. Les réglages d'une génération sont
  l'engrenage, sur Produire.</p>
```

**Un `<h2>` a été ajouté**, et c'est le seul écart au patch minimal. « Tableau
de bord » ne titrait pas l'écran : il titrait la **section des deux boutons du
serveur web**, ComfyUI ayant sa propre paire juste après. Le titre d'écran
prenant « Application », ces deux boutons se retrouvaient sous lui — et
« Arrêter » se serait lu comme « arrêter l'application », l'inverse de ce qu'il
fait. D'où :

```
Application            ← titre d'écran + la ligne
Serveur web local      ← les deux boutons qui arrêtent le SERVEUR (neuf)
ComfyUI                ← inchangé
Journal des productions / Journal du serveur  ← inchangés
```

### Fichiers touchés

| Fichier | Quoi |
|---|---|
| `index.html` | libellé de l'onglet, titre d'écran + ligne, `<h2>Serveur web local</h2>` |
| `nav.js`, `rail.js`, `components.css` | commentaires qui nommaient l'onglet par un libellé devenu faux |
| `DESIGN.md` | tableau du rail : « Réglages **de l'app** » → « Application » (le clarificateur n'a plus lieu d'être) |
| `tests/test_ecran_creer.js` | section `[8c]` |

Les identifiants de code `renderReglages()` / `resetReglages()` ne sont **pas**
renommés : ils désignent le panneau de génération, qui garde son nom.

### Vérifié

Aucune fumigation n'assertait le **texte** d'un onglet — toutes passent par
`data-s`. Il n'y avait donc rien à adapter, seulement à ajouter. Section `[8c]`,
11 assertions vertes :

```
ok  l'onglet dit « Application »
ok  plus aucun onglet ne dit « Réglages » : Personnages | Produire | Revue 1 | Banque | Application
ok  les data-s n'ont pas bouge : registre, creer, trier, scenes, appli
ok  il ouvre toujours l'ecran #appli          ok  le hash reste #appli
ok  l'ecran porte le meme nom que son onglet : « Application »
ok  l'ecran dit ou sont les AUTRES reglages
ok  sections : Application | Serveur web local | ComfyUI | Journal… | Journal…
ok  depuis #journal, l'onglet Application reste allume
ok  le panneau de generation dit toujours « Réglages »
ok  le rail dit toujours « Réglages de génération »
```

Le test dit le contrat **dans les deux sens** : ce qui devient « Application »,
et ce qui ne doit surtout pas suivre.

**Sonde jetable** (non commitée), 10 assertions vertes : Léna et Abyssiaelle
rendent le même libellé, `?character=<id>#appli` ouvre l'écran et allume
l'onglet dans les deux cas ; sur le sas d'entrée le libellé est déjà le bon dans
le DOM, l'onglet restant masqué par `body.no-character`.

Verts, inchangés : `test_panneau_reglages`, `test_apercu_prompt`,
`test_ecran_wizard`, `test_pose_scene_card`, `test_pose_extraction`,
`test_scenes_aller_retour`, `test_application_suppression_editeur`.

### Un rouge d'environnement, antérieur aux deux patches

`test_ecran_creer [1]` et `test_ecran_registre [5]` signalent chacun **une**
erreur JS : un `500` sur `/img?…&thumb=1`. Le serveur dit lui-même pourquoi —

```
{"ok": false, "erreur": "ModuleNotFoundError : No module named 'PIL'"}
```

`_faire_vignette()` (`shared_state.py`) importe Pillow, absent de ce Python (comme
numpy et pytest). L'image pleine taille se sert en `200` ; seule la vignette
non encore en cache échoue. **Reproduit à l'identique sur `2dec842` nu**, sans
UX-1 ni UX-2 : rien à voir avec ces patches, et rien à corriger dans le code —
c'est un `pip install Pillow` à faire dans l'environnement de test. À noter au
passage : l'erreur remonte en clair jusqu'à l'UI plutôt que d'échouer en
silence, ce que `frontend.md` demande.

### Pas fait

`appli.js`, l'écran, le hash : pas renommés. Infobulles (point 6), intensité
(point 1, clos), J7, `hints.js`, `/img/base` : hors scope.

---

## 3 · Copy vue Poses

### Le constat

Deux phrases de la sous-vue **Poses** ne disaient pas la vérité de l'écran.

**L'intro citait un chemin de repo** — « ControlNet, cran SFW uniquement — voir
`DOCS/lena-pose-controlnet.md` ». Ce fichier ne s'ouvre pas depuis l'écran et ne
veut rien dire pour qui utilise le studio.

**La barre `.launch` disait « scenes.json »** sur une vue de squelettes. Le
fichier est pourtant le bon : les poses y sont référencées, les PNG vivent dans
`INPUTS/POSE/`. **Le mensonge était le contexte, pas la cible disque** — « ce
bouton enregistre les squelettes » est ce que la barre laissait comprendre,
alors qu'ils sont déjà écrits sur le disque au moment où la grille les montre.

### Le patch

**A — l'intro**, deux phrases, sans chemin :

> Un squelette OpenPose extrait d'une photo, imposable à une scène (ControlNet,
> cran SFW seulement). **La photo source ne reste jamais sur le disque** : seul
> le squelette est gardé.

Le rappel « Pour **imposer** un de ces squelettes à une scène, c'est sur la carte
de la scène — sous-vue **Scènes** » reste, **une seule fois** (assertion
dédiée). Ce que la doc porte reste dans le code, pas à l'écran : le commentaire
de `screens.css` continue de pointer `DOCS/lena-pose-controlnet.md`, et c'est sa
place.

**B — la barre suit la sous-vue.** Un bouton, un handler, un `scenes.json` :
seul le libellé change. `<b>` gagne un id (`#scTitre`), et `setBankView()` appelle
`majBarreBanque()` :

```js
const BARRE_BANQUE = {
  scenes: ['scenes.json',
           'une sauvegarde .bak est faite à chaque enregistrement'],
  poses:  ['Scènes + attributions de pose',
           'Enregistre scenes.json — pas les squelettes (déjà sur le disque). Une .bak à chaque fois.'],
};
```

Une **table de deux entrées**, pas un `if` : une troisième sous-vue ajoutera une
ligne. Pas de second bouton, et la barre n'est pas cachée sur Poses — une
édition de scène laissée en attente doit garder son bouton (raison déjà écrite
dans `setBankView`).

À noter : `#scMsg` sert **aussi** de ligne d'état à `enregistrerScenes()`
(« enregistré · sauvegarde .bak faite »). C'est voulu — le statut est
transitoire, le texte de vue est l'état de repos, et seul un changement de vue
le repose. Le test vérifie donc la bascule **dans les deux sens**, pas seulement
l'arrivée sur Poses.

**C — grep.** Zéro occurrence de `DOCS/lena` ou `lena-pose-controlnet` dans
`static/*.html` et `static/*.js`. Reste la seule ligne légitime :
`screens.css:316`, un commentaire de code qui pointe une doc réelle.

### Fichiers touchés

| Fichier | Quoi |
|---|---|
| `index.html` | intro de `#bankPoses`, `id="scTitre"` sur le titre de la barre |
| `advanced.js` | `BARRE_BANQUE` + `majBarreBanque()`, appelée depuis `setBankView()` |
| `tests/test_pose_scene_card.js` | section `[5]` |

### Vérifié

Aucune fumigation n'assertait l'ancien chemin `DOCS/` — rien à adapter, seulement
à ajouter. La section `[5]` est allée dans **`test_pose_scene_card`** et non dans
`test_pose_extraction` : ce dernier saute proprement quand ComfyUI est absent, et
une assertion de copy qui ne s'exécute qu'avec un GPU en ligne ne garde rien.

`test_pose_scene_card` **vert**, section `[5]` comprise :

```
ok  l'intro ne cite plus aucun chemin de repo
ok  elle garde la garantie sur la photo source
ok  le rappel « sous-vue Scènes » est la, une seule fois (1)
ok  barre, titre : « Scènes + attributions de pose »
ok  barre, sous-titre : « Enregistre scenes.json — pas les squelettes (déjà sur le disque). Une .bak à chaque fois. »
ok  le bouton Enregistrer reste sur la vue Poses
ok  de retour sur Scenes, la barre redit « scenes.json »   ok  et son sous-titre d'origine
```

`test_pose_extraction` **vert par le chemin réel** : ComfyUI était en ligne cette
fois, une extraction GPU est réellement partie (2 → 3 squelettes) et le test a
nettoyé derrière lui (retour à 2). La carte de scène est inchangée — sections
`[1]` à `[4]` vertes, banque revenue à son état initial **octet pour octet**.

Verts, inchangés : `test_panneau_reglages`, `test_apercu_prompt`,
`test_ecran_wizard`, `test_scenes_aller_retour`,
`test_application_suppression_editeur`.

Toujours les **deux mêmes rouges d'environnement**, identiques à la section 2 et
antérieurs à ces patches : `test_ecran_creer [1]` et `test_ecran_registre [5]`,
un `500` sur `/img?…&thumb=1` faute de Pillow. Rien de neuf.

### Pas fait

L'attribution de pose n'a pas bougé (elle reste sur la carte de scène, sous-vue
Scènes). Pas de plein écran sur `#scenes` — autre chantier. La barre
d'enregistrement n'est pas cachée sur Poses. `INPUTS/POSE/` et l'API
d'extraction ne sont pas renommés. J7, `hints.js`, `/img/base` : hors scope.

---

## 4 · Artefact bas du sas

### Le coupable : `screens.css:23` — le toast au repos

Inventaire fait avant le patch, par sonde Playwright sur l'URL **sans**
`?character=`, hash `#registre` : pour chaque élément du document, boîte +
styles calculés, filtre sur les 48 px bas du viewport (1400×900).

```
boites dans les 48 px bas :
  div.app                    static  1400x900     ← porte l'écran
  div.shell                  static  1400x844     ← porte l'écran
  main                       relative 1400x844    ← porte l'écran
  div#registre.screen.on     static  1400x844     ← l'écran lui-même
  div#toast   position:fixed  z=40   x683 y879 34x24   ← L'INTRUS
```

**`#toast`**, `visibility:visible`, `pointer-events:auto`, boîte 34×24 à
`y=879` sur un viewport de 900 : **21 px d'une capsule grise sans libellé,
centrée, collée au bord** — et cliquable.

L'arithmétique : `bottom:26px` + `transform:translateY(120%)`. 120 % d'un toast
**vide** font 29 px, alors qu'il faut franchir sa propre hauteur (24 px) **puis**
les 26 px de `bottom`, soit 50. Il manquait 21 px. Le sas est le seul écran sans
`.launch` pour noyer le reste — d'où la capture, mais l'artefact était partout.

**Tous les autres suspects sont blancs**, mesurés et non déduits : `.launch` des
trois écrans (boîte 0×0 — le `display:none` du `.screen` parent suffit, aucune
fuite d'enfant `fixed` sur ce moteur), `.intbar` (`display:none`, UX-1 tient),
`#gearPanel`, `#lightbox`, `#dirtyBar`, `#panneBar`, `.rail` : tous
`display:none`. **Aucune scrollbar** : `main` a `overflow-y:auto` mais
`scrollHeight === clientHeight` (844 = 844), et le document ne défile pas non
plus (900 = 900). Pas d'`<input type=range>` orphelin.

### Le patch

```css
#toast{ … transform:translateX(-50%) translateY(calc(100% + 40px));
        visibility:hidden; pointer-events:none;
        transition:transform .22s, visibility 0s .22s}
#toast.on{ transform:translateX(-50%) translateY(0);
           visibility:visible; pointer-events:auto;
           transition:transform .22s, visibility 0s}
```

**Deux gardes indépendantes**, plutôt qu'une arithmétique juste :

1. `calc(100% + 40px)` sort la boîte en entier **quelle que soit sa hauteur** —
   un toast à deux lignes ne réintroduira pas le bug ;
2. `visibility:hidden` + `pointer-events:none` le retirent de l'arbre visible et
   de la cible des clics.

La première couvre la fenêtre où la seconde n'a pas encore pris : sous
`prefers-reduced-motion`, `base.css` écrase la **durée** des transitions, pas
leur **délai** — `visibility` reste donc 220 ms à `visible` après la sortie.

`transition:visibility 0s .22s` : le basculement attend la fin du glissement,
sinon le toast disparaîtrait d'un coup au lieu de sortir par le bas.

### Vérifié

**Sonde de bande** (rejouée après patch) : plus que `.app`, `.shell`, `main`,
`#registre` — les conteneurs qui *portent* l'écran. `#toast` est à `y=914`,
entièrement sous le viewport, `visibility=hidden`, `pointer-events=none`.

**Le toast SERT toujours** — c'était le vrai risque du patch. Sonde sur le chemin
réel (« Appliquer le JSON » de la banque) :

```
ok  au repos     : {vis:hidden,  pe:none, y:914, dansEcran:false, ck:false}
ok  toast leve   : {vis:visible, pe:auto, y:828, dansEcran:true,  ck:true}
ok  il porte un libelle : « JSON appliqué — pense à enregistrer »
ok  retombe et redevient inerte : {vis:hidden, pe:none, y:914, ck:false}
```

Piège rencontré en écrivant la sonde, noté pour la suite :
**`checkVisibility()` ignore `visibility` par défaut** — il faut
`checkVisibility({visibilityProperty: true})`, sans quoi un élément
`visibility:hidden` est rapporté visible.

**Les écrans AVEC `.launch` gardent leur barre** — on n'a pas « caché tout le
bas ». Sonde : Produire 1200×116 collée au bord, Banque 1200×116, Wizard h=116.

**Assertion permanente** : `test_ecran_registre`, section `[3b]`. Elle vérifie la
**bande**, pas le seul coupable connu — n'importe quelle surface `fixed` qui
percerait demain y tomberait :

```
ok  aucun element visible dans les 48 px bas
ok  au bas du viewport, le curseur touche : div#registre
ok  #toast au repos : visibility=hidden pointer-events=none
```

La deuxième ligne est le « clic dans cette zone = rien » du cadrage, testé par
`elementFromPoint` plutôt que déduit.

### Toute la suite est verte

`test_panneau_reglages`, `test_ecran_creer`, `test_ecran_registre`,
`test_apercu_prompt`, `test_ecran_wizard`, `test_pose_scene_card`,
`test_scenes_aller_retour`, `test_application_suppression_editeur`.

**Y compris les deux rouges des sections 2 et 3 — et ce n'est pas ce patch qui
les a réglés.** Le `500` sur `/img?…&thumb=1` venait de Pillow absent ; la seule
vignette dont l'inspecteur a besoin est désormais **en cache**
(`PROD/.thumbs/lena/sfw/OK/lifestyle_cafe_terrasse_20260828_01.jpg`, écrite
aujourd'hui à 20:16), donc la route sert un `200` sans jamais appeler PIL.
**Le manque est intact** : `python -c "import PIL"` échoue toujours, et toute
vignette non encore en cache rend `500` — vérifié sur trois autres images de
`PROD/LENA/OK/`. Un vert de cache chaud, pas un vert de correction : il
redeviendra rouge sur une image neuve tant que Pillow n'est pas installé.

### Pas fait

Le registre n'est pas redessiné (cartes, `--maxw` inchangés) — ce n'est pas le
chantier avatar. Aucune `.launch` cachée. `/img/base`, avatars, plein écran
`#registre` : hors scope.
