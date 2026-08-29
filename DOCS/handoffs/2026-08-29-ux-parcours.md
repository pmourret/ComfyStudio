# Handoff — UX de parcours (fichier à chaîner)

**Date** : 29/08/2026 · **Base** : `2dec842` (rail d'outils + poses)
**Statut** : point 1 clos. Fichier ouvert — les points suivants de la session
UX viennent s'ajouter ici, sous leur propre section.

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
