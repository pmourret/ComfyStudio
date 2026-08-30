# Handoff — F3 : l'éditeur photo optique

**Date** : 30/08/2026 · **Base** : `217f46b` (F1.2, fiche du personnage)
**Portée** : F3.1 (ouverture), F3.2 (optique), F3.3 (versions). Inpaint, F2,
Wan, `/img/base` : hors session.
**Statut** : clos. 12 fumigations navigateur vertes, 6 sondes Python vertes
(dont le filet d'isolation, étendu à la route touchée).

## Inventaire d'abord — ce qui existait déjà

L'éditeur n'a **pas** été reconstruit : l'essentiel de F3.2 était là depuis le
26/08, et la session s'est arrêtée à ce constat avant d'écrire une ligne.

| | avant cette session |
|---|---|
| contenant | `<dialog id="editorBox">`, `body.editing`, cadre dans `.edCanvasWrap` |
| recadrage | 5 formats (libre, 1:1, 4:5, 2:3, 9:16), glisser + 4 poignées, clamp |
| rotation | 90° ↺ / ↻ · **redressement** −15°…+15° par pas de 0,5° |
| couleur | luminosité, contraste, saturation, température, grain manuel |
| export | rendu hors-écran à la résolution **originale**, jamais les pixels d'écran |
| versions | `/api/edit/save` → dérivé `<nom>_edit`, `nom_libre`, borné au `cid` |

**Manquaient** : le recadrage s'ouvrait allumé (le voile de 2000 px assombrissait
l'image dès l'entrée), il n'y avait pas de miroir, et aucun chemin pour écraser
la source. Trois ajouts, donc, plus deux corrections trouvées en route.

## F3.1 — l'éditeur s'ouvre sans recadrage

`ED_CROP === null` **est** l'état « pas de recadrage » — c'est déjà ce que
lisaient `positionnerCropBox`, `clampCrop` et l'export. Aucun second drapeau à
tenir synchronisé : allumer, c'est se donner un cadre ; éteindre, c'est le
reprendre.

- ouverture → aucun `#edCropBox`, aucun voile ;
- « Recadrer » l'allume ; choisir un **format** l'allume aussi (c'est un geste
  de recadrage : sinon le clic ne ferait rien de visible) ;
- « annuler le recadrage » l'éteint **sans rien enregistrer**, et remet le
  format sur *Libre* — laisser « 1:1 » allumé sur un recadrage éteint
  annoncerait une contrainte qui ne s'applique plus ;
- « Réinitialiser » rend l'état d'**ouverture**, recadrage éteint compris ;
- tourner de 90° ne rallume pas le recadrage : tourner n'est pas recadrer.

L'affichage suit un seul attribut, `#edCropSec[data-on]`, écrit par
`editor.js` — même levier que `#trier[data-metier]` en F1.1. Rien n'est grisé :
le recadrage n'est pas indisponible, il n'est simplement pas en cours.

## F3.2 — optique

**Ajouté** : le **miroir** horizontal (`⇄ Miroir`), un interrupteur qui se voit
enfoncé (`aria-pressed`), appliqué **après** la rotation — inverser avant ferait
basculer le sens du retournement une fois sur deux.

**Redressement : fait, pas reporté.** Il existait ; le coût était de le rendre
correct maintenant que le recadrage peut être éteint. Une image inclinée laisse
des **coins transparents**, et sans cadre l'export prenait tout le canvas :
redresser sans recadrer aurait enregistré un PNG à coins vides. `rectDecoupe()`
retombe donc sur le rectangle inset de `margeSecurite` — la marge écrite pour
ça, nulle à angle nul, donc à plat le rectangle reste l'image entière au pixel
près. Vérifié de bout en bout : 7° sur une 1080×1350 → dérivé 913×1183, **les
quatre coins opaques**.

L'écran, lui, montre l'image inclinée avec ses coins vides. Plutôt que de
laisser découvrir l'écart sur le fichier, une ligne apparaît sous le curseur —
et seulement quand elle est vraie (angle ≠ 0 **et** pas de cadre) :
« Les coins laissés vides par l'inclinaison seront rognés à l'enregistrement. »

Pas de HSL 12 bandes, pas de pinceau, pas de masque, pas d'inpaint.

## F3.3 — versions

Le geste **primaire** reste « Enregistrer une copie » : dérivé `<nom>_edit`,
même bucket, source intacte. Inchangé.

**« Écraser la source… »** est nouveau : second rang, séparé par un filet,
volontairement plus étroit (deux boutons pleine largeur l'un sous l'autre se
cliquent dans la lancée, et celui-là ne se rattrape pas), et sous confirmation
qui dit ce qu'elle coûte plutôt qu'« êtes-vous sûr ? ».

Côté serveur, `remplacer: true` traite les trois conséquences — sans quoi
l'interface mentirait sur un fichier qui a changé sous elle :

| conséquence | traitement |
|---|---|
| les **mesures** portaient sur les anciens pixels | `mes.demesurer()` : nettete / texture / bruit / identité effacées, l'image redevient « non mesurée » et rentre dans `Mesurer (n)`. Le **jugement humain** ◉/◌ est gardé — il porte sur ce que l'image donne à voir, et l'effacer détruirait une saisie |
| l'**export publiable** (OK/sfw) montrait l'image d'avant | refait depuis les nouveaux octets |
| la **vignette** | oubliée (son horodatage suffirait, mais on ne parie pas sur la finesse de l'horloge du disque) |

La **ligne de journal** de la génération n'est pas touchée : elle dit ce que le
pipeline a produit, ce qui reste vrai — le fichier ne l'illustre simplement plus
exactement. La confirmation le dit à l'utilisateur, mot pour mot.

**Isolation** : la destination vient toujours de `bucket_dir(…, cid)`, jamais du
nom reçu. Un nom d'un autre personnage sort en 404 — copie **et** écrasement.
Vérifié dans le filet de routes, avec un vrai fichier de Léna visé depuis
`probe` : 404 les deux fois, et son image intacte à l'octet près.

## Deux corrections trouvées en route

1. **L'action principale était sous le pli.** Mesure : le panneau de réglages
   fait 1089 px de contenu pour 872 px de haut — « Enregistrer une copie »
   vivait ~180 px sous le pli, et il fallait faire défiler pour sauver. Le pied
   (`.edActions`) est désormais **collant** en bas du panneau ; les réglages
   défilent dessous. Le défaut préexistait ; mes deux ajouts l'aggravaient de
   88 px, ce qui l'a rendu visible.
2. **Un nom de fichier ne suffisait plus à identifier une image.** Dès lors
   qu'on peut écraser une source, la même URL `/img?…&name=X` désigne deux
   images successives, et le navigateur resservait sa copie en cache : l'écran
   aurait montré l'image d'avant. `/api/gallery` rend maintenant un jeton `v`
   (mtime) par item, et `imgUrl` l'ajoute à l'URL — un seul champ, un seul
   constructeur, et le cache reste utile puisque l'URL ne change que quand les
   octets changent.

## Fichiers touchés

| Fichier | Ce qui change |
|---|---|
| `editor.js` | recadrage on/off, miroir, `rectDecoupe`, note de redressement, `enregistrer(remplacer)`, confirmation d'écrasement |
| `index.html` | section Recadrage (`data-on`), `⇄ Miroir`, note, pied `.edActions`, `Écraser la source…` |
| `screens.css` | règles `data-on`, miroir enfoncé, second rang de boutons, pied collant |
| `routes/tri.py` | `/api/edit/save` : `remplacer`, mesures/export/vignette ; `v` par item de galerie |
| `mesures.py` | `demesurer()` — efface les mesures, garde le jugement |
| `api.js` | `imgUrl` passe `v` quand l'item en porte un |

## Tests

`test_application_suppression_editeur.js` — la ligne « le cadre de recadrage est
affiché » a **changé de sens** à l'ouverture (c'est le comportement qui a
changé, pas le reste du test) et trois sections neuves :

- **[6]** crop OFF à l'ouverture (cadre absent, `data-on="0"`, formats non
  montrés) + « Enregistrer une copie » visible **sans défiler** ;
- **[6b]** « Recadrer » allume le cadre, qui est bien **dans** le canvas
  (l'exigence du handoff précédent tient) ;
- **[6c]** miroir : relâché, enfoncé, relâché ;
- **[6d]** copie = **deux** noms, la source toujours listée (1 → 2 fichiers) ;
- **[6e]** écrasement : bouton non primaire, confirmation qui dit le coût, refus
  qui n'écrit rien, puis même nom / aucun fichier de plus / jeton `v` présent.

`test_isolation_disque.py` **[5b]** (neuf) : `/api/edit/save` en copie et en
écrasement, depuis `probe` vers Léna → 404 les deux fois, octets de Léna
intacts ; puis `probe` édite et écrase la sienne, sous le même nom, avec les
bons octets sur le disque.

**12/12 fumigations vertes.** Python : `test_serveur_http`,
`test_isolation_disque`, `test_tri_export`, `test_valider_banque`,
`test_nsfw_isolation`, `test_suppression_edition` — verts.

## Checklist F3 — état

**F3.1** — ✅ ouverture recadrage éteint · ✅ aucun `#edCropBox` visible ·
✅ aucun voile · ✅ « Recadrer » l'allume (5 formats déjà là) · ✅ « annuler le
recadrage » l'éteint sans sauver.

**F3.2** — ✅ recadrer · ✅ rotation 90° · ✅ **miroir** · ✅ quatre curseurs
(luminosité, contraste, saturation, température) · ✅ **redressement : fait**,
un angle, coins rognés à l'export · ✅ pas de HSL 12 bandes, pas d'inpaint.

**F3.3** — ✅ dérivé nommé `_edit` (convention déjà en place) dans le bucket et
le `cid` courants · ✅ source intacte par défaut · ✅ « Écraser la source » sous
confirmation explicite, jamais le bouton primaire · ✅ isolation testée.

**Porte** : inchangée. Galerie et Revue ouvrent l'éditeur comme avant,
Télécharger reste en Galerie.

## Ce qui reste ouvert

- Les `input[type=range]` sont **natifs** (bleu système) : c'est le dernier
  endroit où la peinture du studio s'arrête, comme les barres de défilement
  avant le 30/08. Hors finding de cette session — pas touché.
- L'écrasement ne re-mesure pas : il **efface** les mesures et laisse
  `Mesurer (n)` faire le travail au moment choisi. Mesurer d'office dans la
  requête l'aurait allongée de ~190 ms par image, sans que personne l'ait
  demandé.
- La température reste un survol `overlay`, pas une vraie balance des blancs —
  inchangé depuis le 26/08, et suffisant pour une retouche à la volée.
- Pas d'aperçu avant/après (comparer se fait en gardant la copie et en ouvrant
  les deux en Galerie).
