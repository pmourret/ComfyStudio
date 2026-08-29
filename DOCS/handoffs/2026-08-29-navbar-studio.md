# Handoff — Navbar latérale, mode studio, nom de l'application

**Date** : 29/08/2026 · **Base** : `f8803d6` (infobulles, fin de la session UX de parcours)
**Statut** : clos. 8 fumigations vertes, 4 sondes vertes (dont 3 rejouées des
sessions précédentes, en non-régression).

Trois demandes qui tombaient toutes dans le même chrome, donc une seule passe.
Trois arbitrages ont été pris **avec** l'utilisateur avant d'écrire une ligne :
navbar rétractable en icônes (le rail reste), « mode studio » = entrée épurée
**et** mode focus, bandeau haut conservé mais allégé.

## Ce qui bouge, et ce qui ne bouge surtout pas

Les cinq destinations quittent le bandeau pour une **colonne à gauche**.
**`.tabs` reste la classe du conteneur**, et c'est délibéré :
`.tabs button[data-s=…]` est le **contrat** de navigation — `nav.js` (×3),
`review.js`, et quatre fumigations. Le bandeau n'était qu'un emplacement ; le
déplacer ne doit rien casser de ce qui *désigne* une destination. Même
discipline que le renommage « Réglages » → « Application » : le libellé et la
place changent, le contrat ne bouge pas.

Le bouton de repli vit **hors** de `.tabs` : une fumigation lit
`$$('.tabs button')` en attendant exactement cinq `data-s`.

## Deux colonnes, deux natures

```
[ navbar 208 ] [ rail 200 ] [ composeur ] [ inspecteur ]
     où aller      quoi faire
```

La navbar dit **où aller dans l'application**, le rail dit **quoi faire sur
l'écran courant**. Les fondre aurait mélangé une carte et un établi. Elles ne
se comportent d'ailleurs pas pareil :

| | navbar | rail |
|---|---|---|
| sas (`body.no-character`) | absente | absente |
| mode éditeur (`body.editing`) | **présente** | absente |
| sous 1100 px | présente, en icônes | absente |
| écrans-listes (Revue, Application…) | présente | absente |

**La ligne du mode éditeur est celle qui compte.** J'avais recopié la condition
du rail — `:not(.editing)` — sans y penser, et
`test_application_suppression_editeur [6]` l'a rattrapé : « la nav du chrome
reste visible pendant l'édition ». Le rail porte des **outils**, qui n'ont rien
à faire pendant une retouche ; la navbar est la **sortie** du mode (cliquer une
destination retire `body.editing`). La masquer enfermait l'utilisateur dans un
mode dont le seul autre échappement est Échap.

## Une collision de noms, pas une bataille de cascade

Premier rendu : navbar large de 42 px, superposée au rail. Cause mesurée, pas
devinée — **`.nav` était déjà pris** par les flèches précédent/suivant de la
Revue (`screens.css`, `position:absolute`), et `screens.css` charge **après**
`components.css`. Ma navbar héritait de leur positionnement absolu.

Renommée `.sidenav`. Rien à arbitrer dans la cascade : c'était un nom occupé.

## Mode studio — deux réglages indépendants

`studio.js`. Les garder séparés est tout l'intérêt du module :

- **« Réduire »** — une *préférence durable* (`body.nav-mince`, localStorage).
  On peut vouloir les icônes en permanence sans être en train de travailler.
- **« Mode focus »** — un *mode de travail* (`body.focus`) : masque le bandeau
  et impose les icônes **le temps qu'il dure**, sans écraser la préférence.

Les mélanger aurait fait qu'entrer puis sortir du focus déplierait une navbar
qu'on avait volontairement réduite. Vérifié dans les deux sens.

Le focus **n'est pas persisté**, délibérément : retrouver au chargement suivant
une application dont le bandeau a disparu, sans se souvenir de l'avoir demandé,
se lit comme une panne, pas comme un réglage.

Ce que le focus **garde** : la barre d'intensité, le rail, la barre de
lancement. On enlève ce qui dit « où suis-je », pas ce qui sert à faire.

Raccourci **`f`**, avec la garde de `review.js` (pas dans un champ de saisie,
pas en mode éditeur, pas sous un `<dialog>` ouvert). **Pas Échap** : il ferme
déjà le menu d'identité, la loupe et l'éditeur — un quatrième sens rendrait
imprévisible la touche la plus utilisée du chrome. La sortie est aussi un
bouton nommé, au pied de la navbar, qui ne disparaît jamais.

`localStorage` est lu et écrit sous `try/catch` : un réglage de confort perdu
(fenêtre privée, données effacées) doit rendre le chrome **normal**, jamais un
studio bloqué en focus. C'est le premier usage de `localStorage` du projet.

## L'entrée en studio

Sans `?character=`, **la navbar n'existe pas**. Il n'y a pas d'atelier à
naviguer : le registre occupe l'écran, et choisir un personnage *fait* entrer.
C'est le pendant de `body.no-character` sur le reste du chrome, en plus net —
avant, quatre onglets sur cinq étaient masqués et le cinquième restait, ce qui
laissait une barre de navigation à une seule entrée.

## Accessibilité

En mode icônes les libellés sont retirés **visuellement** (`clip-path`), jamais
par `display:none` : ils restent le **nom accessible** du bouton. Un
`display:none` aurait donné cinq boutons anonymes à un lecteur d'écran, l'icône
étant `aria-hidden`.

`studio.js` y pose alors une **infobulle portant ce libellé**. C'est une
exception assumée à la liste fermée d'UX-6, qui excluait les onglets — et pour
la raison inverse de celle qui la motivait : là le libellé était écrit à côté,
ici l'icône est seule. La bulle est retirée dès que le libellé revient.

## Le nom de l'application

Il **disparaissait dès qu'un personnage était chargé** : `paintNeutral()`
écrivait « Studio » sur le sas, puis `paint()` remplaçait tout `.brand` par la
carte du personnage. On ne savait plus dans quel outil on était, seulement chez
qui.

> **ComfyStudio · L** *Léna* `lena` [instagram-influenceur] [Slow life]

L'application d'abord, le personnage ensuite. Sous 820 px le nom de
l'application cède **avant** celui du personnage : savoir chez QUI on est prime
alors sur savoir dans quel outil, la navbar restant à l'écran pour le dire.

## Fichiers touchés

| Fichier | Quoi |
|---|---|
| `studio.js` | **neuf** — repli, focus, persistance, raccourci `f` |
| `index.html` | navbar dans `.shell`, header allégé, titre `ComfyStudio` |
| `components.css` | `.sidenav`, mode icônes, mode focus, `--nav` ; `.launch` franchit les deux colonnes |
| `base.css` | `.tabs` en colonne, `.brand-app` |
| `character.js` | `ComfyStudio` dans les deux états |
| `screens.css` | repli du header réécrit (les onglets n'y sont plus) |
| `main.js` | import de `studio.js` |
| `DESIGN.md` | section navbar, header, inventaire des classes |

## Vérifié

**8 fumigations vertes, aucune modifiée.** C'est la mesure qui compte pour une
refonte de chrome : le contrat `data-s` a tenu.

**Sonde navbar**, 28 assertions vertes : sas sans navbar, navbar à `x=0`, le
rail commence où la navbar finit (208), `.launch` franchit les deux colonnes
(408), repli à 58 px, nom accessible survivant au clip, bulle donnant le
libellé en icônes, préférence survivant au rechargement, focus dans les deux
sens, `f` ne volant pas une frappe à un champ.

**Sonde largeurs / personnages**, 11 assertions vertes : Léna et Abyssiaelle
identiques ; 1500 / 1050 / 760 px sans débordement ni du document ni du header ;
icônes imposées sous 1100 px ; navigation répondant à toutes les largeurs.

**Non-régression des sessions UX 1 à 6** : les sondes `intbar` (barre bornée à
Produire), `role` (ligne de rôle de l'inspecteur) et `hints` (infobulles) ont
été rejouées — vertes.

## Les trois points ouverts, vérifiés

Passe de vérification menée avant de boucler. **Elle a trouvé deux vrais
défauts** — aucun des deux n'était le risque que j'avais anticipé.

### 1 · Les icônes — et le défaut qu'elles ont révélé

Mesuré : les cinq font 20×20, 1 à 4 tracés chacune, toutes `aria-hidden` et
`focusable="false"` (le nom accessible vient du libellé). Elles suivent
`currentColor`, donc l'état du bouton. Rien hors d'`index.html` ne connaît leur
dessin : les remplacer reste bien un bloc à échanger.

**Mais la capture a montré deux entrées surlignées à la fois.** Mesure :

| | fond | couleur | graisse |
|---|---|---|---|
| survolé | `rgb(35,40,49)` | `rgb(230,232,238)` | 400 |
| écran courant | `rgb(35,40,49)` | `rgb(230,232,238)` | **600** |

**Survol et destination courante étaient identiques à la graisse près.** Sur une
rangée d'onglets on ne s'attardait pas dessus ; dans une colonne on promène le
pointeur le long de la liste, et « où suis-je » devenait ambigu dès qu'il s'y
posait. Le défaut préexistait — la navbar l'a rendu visible.

Corrigé : l'écran courant porte une **barre d'accent à gauche**, que le survol ne
pose jamais. Une forme et une position, pas seulement une teinte — « statut
jamais par la couleur seule » (`frontend.md`).

### 2 · Le raccourci `f`

Confirmé annoncé nulle part (le bouton dit seulement « Mode focus »). Conflits
passés en revue, un par un :

| Contexte | Attendu | Mesuré |
|---|---|---|
| panneau ⚙ ouvert | entre en focus, le panneau survit | ✔ (il sert au travail) |
| écran Revue (`v/r/x/a/d/c/i/u` pris) | entre en focus, ne trie rien | ✔ |
| `<textarea>` de la banque | ne fait rien, le `f` va dans le champ | ✔ |
| **menu d'identité ouvert** | ne fait rien | **✘ — il entrait en focus** |

**Le défaut** : le menu d'identité vit *dans* le header. Entrer en focus le
faisait disparaître au milieu d'une interaction, en le laissant ouvert dans le
DOM. Le focus était sur un `<a>` du menu, donc la garde `input|textarea|select`
ne mordait pas, et le menu n'est pas un `<dialog>`.

Corrigé : `f` est ignoré tant que `#idMenu` est ouvert — et tant que la loupe
l'est, pour la même raison (basculer le chrome derrière un voile n'a aucun sens
visible). Échap ferme d'abord, puis `f` retrouve son sens. Vérifié dans cet
ordre.

### 3 · `localStorage`

Le seul point qui est ressorti **intact**.

| Scénario | Résultat |
|---|---|
| accesseur qui lève (fenêtre privée, cookies bloqués) | chrome **normal** (208 px), 0 erreur JS ; le repli marche toujours, il n'est simplement pas retenu |
| valeur corrompue (`{oops`) | retombe sur le chrome normal, 0 erreur JS |
| clés écrites après repli + deux `f` | `["studio.nav-mince"]` — une seule, et le focus n'est pas retenu |

Le contrat visé est tenu : un réglage de confort perdu rend le chrome normal,
**jamais un studio bloqué en focus**.

## Vérifié (après corrections)

8 fumigations vertes, aucune modifiée. Sonde de vérification : 24 assertions
vertes. Sondes `nav`, `nav2`, et celles des sessions UX 1 à 6 (`intbar`, `role`,
`hints`) rejouées : vertes.

## Reste ouvert

- **Aucun endroit ne liste les raccourcis globaux.** `f` reste découvrable par
  le bouton du pied, qui nomme l'action. Le jour où un deuxième raccourci global
  arrive, il faudra un endroit qui les liste — pas avant, sous peine d'inventer
  un écran d'aide pour une seule touche.
- **Les icônes sont faites maison** et volontairement sobres. Si un jeu cohérent
  arrive, il se pose ici — cinq `<svg>` dans `index.html`.
- **`localStorage` n'a qu'une clé.** Si d'autres préférences de chrome suivent,
  elles mériteront un petit module dédié plutôt qu'une clé par fichier.
