# Handoff — Rail d'outils + Banque en deux sous-vues

**Date** : 29/08/2026 · **Base** : `d7086a2` (plein écran Créer + aperçu prompt)
**Statut** : clos. 7 fumigations navigateur vertes, `test_universe_registry` vert.

Passe 2 de la session studio. La question laissée ouverte par la passe 1 — « si
un rail arrive un jour, les trois zones ne tiendront plus à 1180 px » — est
sans objet : le 1180 est mort, le rail prend la largeur gagnée.

## Le rail n'est pas une seconde navigation

Les **cinq onglets du header restent le chrome**. Le rail porte les **outils du
pack** et les raccourcis d'atelier qui ne sont pas des destinations primaires.

```
[ rail 200px ] [ composeur ] [ inspecteur clamp(280,22vw,420) ]
```

Rendu réel, identique pour les deux personnages :

| Groupe | Entrée | Destination | État |
|---|---|---|---|
| Outils | **Poses** | `scenes/poses` | actif |
| Outils | **Éditeur d'image** | — | **inerte**, title « depuis une image de la Revue » |
| Atelier | **Scènes** | `scenes` | actif |
| (bas) | **⚙ Réglages de génération** | toggle `#gearPanel` | actif sur Produire, inerte ailleurs |

Absents, et vérifié par une sonde : Personnages, Produire, Revue, Réglages de
l'app, n° de version, « Créateur d'intention / de ton », Générer en NSFW, ETA.

## Rien dans le rail ne sait qui est le personnage

`posing` est déclaré dans les `tools.json` des **deux** packs
(`instagram-influenceur` **et** `rpg-personnage`), en `scope: "global"` — la pose
est un outil global (CLAUDE.md §5), seul le modèle ControlNet dépend de la
famille technique du pack, pas le panel.

`rail.js` ne lit **que** le champ `surface` et cherche ce qu'il ouvre dans une
table de données :

```js
const SURFACES = {
  'bank-poses':      {aller: 'scenes/poses'},
  'bank-scenes':     {aller: 'scenes'},
  'review-lightbox': {inerte: 'depuis une image de la Revue'},
};
```

Surface absente de la table → bouton **inerte qui dit pourquoi**, jamais une
destination inventée. C'est le cas d'`image-editor` : l'éditeur s'ouvre depuis
une image de la Revue, il n'a pas de point d'entrée propre — le rail le montre
quand même, sinon on croirait que le pack ne l'a pas.

**Vérifié** (sonde jetable, deux personnages) : Léna
(`instagram-influenceur`) et Abyssiaelle (`rpg-personnage`) rendent un rail
**identique au caractère près**. Aucun `if character == …`, aucun `if universe == …`.

Les `_notes` des deux `tools.json` ont été reprises : elles annonçaient « le
rendu à l'écran arrive avec le premier outil dédié (J5+) » et « n'est encore
rendu nulle part ». C'est faux depuis cette session — le contrat `surface` y est
maintenant écrit.

## Où le rail s'affiche

| Condition | Rail |
|---|---|
| écran **Produire** ou **Banque**, ≥ 1101 px, personnage chargé, hors éditeur | **affiché** |
| Registre, Revue, Réglages, Journal, Wizard | masqué |
| < 1100 px | masqué — les onglets suffisent |
| sas d'entrée (`body.no-character`) | masqué |
| mode éditeur (`body.editing`) | masqué |

Sous 1100 px : **pas de hamburger, aucune destination repliée, Banque jamais
recachée**. La condition est écrite en `@media(min-width:1101px)` avec
`:not(.no-character):not(.editing):has(#creer.on)` — le masquage est donc le
défaut, et les cas limites n'ont pas à être re-listés en négatif.

Le rail est **hors de `<main>`** (dans un `.shell` neuf) : un seul élément
partagé par les deux écrans plutôt qu'un bloc recopié dans chacun, il ne défile
pas avec le contenu, et il tient toute la hauteur sous le header et la barre
d'intensité. `#creer .wrap.split` garde donc ses **deux** colonnes — le rail
n'est pas une piste de la grille.

### Le piège de `.launch`

`.launch` est `position:fixed;left:0` : ancrée au viewport, aveugle à la grille.
Sans correction elle passait **sous** le rail. D'où `--rail` (0 ou 200 px) et
`left:var(--rail)`. La variable porte **exactement** la même condition que
l'affichage du rail : une condition écrite deux fois, jamais deux conditions qui
pourraient diverger.

## Largeurs mesurées

Sonde jetable, écran Produire :

| Viewport | Rail | `<main>` commence | Composeur | Inspecteur (bord droit) | Colonne inspecteur | Scroll X |
|---|---|---|---|---|---|---|
| 1920 | 200 | 200 | 220 | 20 | **420** (plafond) | **0** |
| 1440 | 200 | 200 | 220 | 20 | 317 | **0** |
| 1200 | 200 | 200 | 220 | 20 | 280 (plancher) | **0** |
| 1000 | masqué | 0 | 20 | 20 | une colonne | **0** |

L'inspecteur n'a **pas** bougé du chant droit du viewport — le rail mange à
gauche, pas à droite. La barre de lancement est décalée à 200 px sur les trois
premiers paliers, à 0 sur le dernier.

Écran Banque (liste, `--maxw`) : le wrap reste **≤ 1180 px et centré dans
`<main>`** à toutes les largeurs (gouttières 270/270 à 1920, 30/30 à 1440,
0/0 à 1200), aucun défilement horizontal. Le rail ne casse donc pas le modèle
article — c'est ce qui a permis de le garder sur Banque, comme préféré.

## Banque : Scènes | Poses

Un `.seg` en tête de `#scenes`, deux enveloppes (`#bankScenes` / `#bankPoses`)
que `setBankView()` montre ou masque. **Aucune n'est repeinte** à la bascule :
`renderSceneCards()` et `renderPoses()` gardent leurs déclencheurs, changer de
vue ne coûte ni aller-retour serveur ni saisie en cours.

- **Scènes** — composeur, note de direction, ancre d'identité, `#sceneCards`,
  JSON brut.
- **Poses** — `#poseGrid`, upload, texte ControlNet SFW, « la photo source ne
  reste jamais sur le disque ».

L'**attribution** d'une pose à une scène reste sur la carte de scène, côté
Scènes : c'est une propriété de la scène, pas du squelette. Une ligne le dit
dans la vue Poses, pour que le lien entre les deux ne se perde pas.

Hash partageable : `#scenes` et `#scenes/poses`, résolus par `ROUTES`
(`constants.js`), qui allume l'onglet **Banque** dans les deux cas. Un
rechargement direct sur `#scenes/poses` rouvre bien la sous-vue Poses.
L'onglet Banque, lui, rouvre **toujours** sur Scènes : la sous-vue laissée au
passage précédent n'est écrite nulle part dans l'URL, la restaurer serait un
état invisible.

La barre « Enregistrer scenes.json » reste visible sur les **deux** vues, et
c'est un choix : elle enregistre le document de l'écran, et une édition de scène
laissée en attente doit garder son bouton pendant que `#dirtyBar` avertit.

## Un bug trouvé en chemin : `#scenes/poses` faisait lever `nav.js`

`go()` faisait `$('#' + screen)`, c'est-à-dire `querySelector('#scenes/poses')`.
**Ce n'est pas un sélecteur CSS valide** : `querySelector` lève une
`DOMException` — avant d'atteindre le repli sur Créer. N'importe quel hash à
slash cassait la navigation, pas seulement le nôtre.

Corrigé en `document.getElementById(screen)`, qui prend un identifiant littéral
et ne lève jamais. Couvert par une sonde : `#pas/une/route` retombe sur Produire
sans erreur JS.

Deux autres gardes ont dû suivre, parce que `ROUTES` ne veut plus dire « entrée
de tri » : `setTriageEntry` / `loadItems` sont désormais conditionnés à
`route.bucket` et non à `route`, sinon ouvrir `#scenes/poses` remettait l'entrée
de tri à `undefined` et rechargeait la file.

## Tests

| Suite | Résultat |
|---|---|
| `run_browser_tests.py` (7 fumigations navigateur) | **7 vertes**, 0 ignorée, 0 échec |
| `test_universe_registry.py` | **vert** (les `tools.json` restent bien formés) |

**Deux** tests adaptés, aucune suite nouvelle — un clic de plus sur le même
chemin d'entrée :

| Test | Ce qui a changé |
|---|---|
| `test_pose_extraction` | après `.tabs [data-s=scenes]`, un clic sur `#bankView [data-vue=poses]` ; + 2 assertions sur la bascule |
| `test_application_suppression_editeur` | idem dans sa section `[1] banque de poses` |

`test_pose_scene_card` n'a **pas** bougé : il ne touche que `#sceneCards`, qui
est dans la sous-vue par défaut. Il a été le témoin utile — c'est lui qui prouve
que l'attribution de pose est restée là où elle était.

Sélecteurs de fumigation intacts : `#intentGrid .it`, `#sceneGrid .sc`,
`#btnRun`, `#btnApercu`, `.tabs button[data-s=scenes]`.

Sondes jetables (hors repo) : géométrie aux 4 largeurs, `--maxw` de la Banque
préservé, contenu et dédoublonnage du rail, hash partageable et rechargement
direct, engrenage actif/inerte, hash inconnu à slash, sas d'entrée, et le rail
identique entre les deux packs. Toutes vertes.

**ComfyUI hors ligne** (`--no-comfy`), comme les deux passes précédentes.
`test_pose_extraction` s'est donc exécuté sans extraction GPU réelle — le
chemin d'entrée adapté est vérifié, le job ne l'est pas.

## Ce qui n'a pas été fait

- **Rail sur Revue / Registre / Réglages** — mesuré comme inoffensif pour
  `--maxw`, mais aucune de ses entrées n'y serait active : il ne ferait que
  rogner la largeur d'une liste. Préférence du cadrage suivie : Produire + Banque.
- **Compteur de squelettes sur l'onglet Poses** — `#nPoses` reste dans la vue.
  Un badge sur le `.seg` demanderait de le tenir à jour depuis `renderPoses()`
  pour un gain faible.
- **Wardrobe, J7, `/img/base`** — hors scope, inchangés.

## Ouvert

- **File GPU** — toujours à concevoir, rien n'a été mocké.
- **`/img/base`** — la route manque toujours ; l'avatar reste une pastille
  d'initiale (voir le handoff du même jour, section inspecteur).
- **Un 4ᵉ outil** — le jour où un outil arrive avec une surface neuve, il suffit
  d'une entrée dans `SURFACES` et d'une ligne dans les `tools.json` concernés.
  Si la surface est propre à un monde, c'est `scope: "universe"` qu'il faut, et
  le rail ne le filtre **pas encore** : il affiche tout ce que `/api/universe/tools`
  rend. À trancher au premier outil non global — pas avant.
