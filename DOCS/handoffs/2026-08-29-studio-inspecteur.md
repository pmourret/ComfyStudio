# Handoff — Studio inspecteur (écran Créer en deux colonnes)

**Date** : 29/08/2026 · **Base** : `39c3e39` (Chambre noire + isolation C1–C6)
**Statut** : clos. Fumigations `test_ecran_creer` et `test_apercu_prompt` vertes.

## Ce qui a changé

L'écran Créer passe en deux colonnes (`#creer .wrap.split`) :

- **gauche** (`.cr-main`) — `#runPanel` puis les crans inchangés (intention /
  ton / scènes au SFW, sources + instruction au cran NSFW). `#launchBar` et
  `#gearPanel` restent des surfaces fixes du chrome, hors grille.
- **droite** (`.cr-side`) — l'inspecteur, collant : la dernière image **du
  personnage courant**, sa provenance, sa fiche.

Sous 1100 px la colonne repasse **sous** le composeur, en flux normal — jamais
une surcouche. Même palier que le repli du tag « monde » dans le header : c'est
la même mesure de largeur qui les déclenche.

Fichiers : `static/inspector.js` (neuf), `index.html`, `create.js`, `nav.js`,
`character.js`, `base.css`, `screens.css`, `static/DESIGN.md`.

## Source `recent` vs `gallery` — l'ordre retenu

Trois sources, du plus petit diff au plus coûteux. Elles ne se mélangent pas :
`recent` gagne toujours, `gallery` n'est qu'un repli.

| # | Source | Quand | Coût |
|---|---|---|---|
| 1 | `STATE.recent` de `/api/state` | à chaque tick, via `renderRun()` | **zéro appel** — la réponse est déjà là |
| 2 | dernier item `bucket=OK&space=sfw` de `/api/gallery` | une fois, au passage sur `#creer` | 1 appel, déjà borné au personnage |
| 3 | `/api/character` (style, monde, pack) | une fois | 1 appel |

`updateInspector(s)` est appelée depuis `renderRun()` **avant** son retour
anticipé (le panneau se masque quand rien ne tourne) : sinon l'inspecteur ne
vivrait que pendant un batch, ce qui est précisément le défaut qu'il corrige.

**Garde d'isolation.** `STATE.character` est le personnage du *batch en cours*,
pas celui de l'URL. Une entrée de `recent` n'est retenue que si les deux
coïncident (`pickFromState`) ; sinon on retombe sur la banque, elle-même déjà
scopée. Vérifié : batch de Léna injecté pendant qu'on regarde Abyssiaelle →
aucune image peinte, aucune ligne de fiche empruntée, `« rien encore pour
Abyssiaelle »` maintenu, et `#runPanel` continue d'afficher le batch réel.

La provenance est **écrite à l'écran** (`#insSrc`) : « dernier batch » ou
« banque · validées ». Un inspecteur qui montre une image de la semaine
dernière sans le dire pendant qu'on règle une intensité serait un compteur qui
ment.

## `#runPanel` : gardé, pas fusionné

Choix retenu — **`#runPanel` reste au-dessus de la colonne gauche**, avec sa
bande et son bouton d'arrêt. Il n'y a pas deux grosses previews : `.strip` est
une bande de vignettes de 104 px (le déroulé du batch), l'inspecteur est la
**seule** grande image de l'écran. Les fusionner aurait coûté une réécriture de
`renderRun` — et fait perdre le déroulé — pour un gain nul.

Conséquence assumée : pendant un batch, la dernière vignette de la bande et
l'image de l'inspecteur sont le même fichier. La seconde le montre en grand
avec sa fiche ; la première le situe dans la série.

## Avatar : **reporté**

Pastille d'initiale (`.brand-av`, 32 px, première lettre du nom du registre) —
**pas** le portrait de base gelée.

> **Route `/img/base` absente, reporté.** `config.json` / `base_gelee` nomme un
> fichier qui vit hors de `PROD/`, côté entrées ComfyUI. Aucune route ne sert
> ses octets : `/img` ne lit que `bucket_dir(bucket, space, cid)` et `/img/pose`
> que `INPUTS/POSE/`. En ajouter une qui lise `ComfyUI/input/` **sans borne
> `character_id`** rouvrirait exactement la fuite que l'isolation du 29/08 vient
> de fermer. À faire proprement : une route qui résout `base_gelee` *par*
> `character(request)` et refuse tout chemin hors de la fiche du personnage.

La pastille ne change pas les assertions existantes : `.brand` porte toujours le
nom lisible, `.brand-id` l'identifiant, `.brand-tag` le type et le monde.

## Mouvement

- fondu croisé de l'image d'inspecteur : **280 ms**, deux calques `.ins-layer`
  superposés ; la sortante reste opaque **sous** l'entrante, on ne voit jamais
  le fond au travers. Vérifié : A peinte, puis B sur le calque du dessus et A
  descendue sur celui du dessous.
- `.run .bar > div` : `transition:width .5s` — **existait déjà**, rien ajouté.
- rien d'autre. Pas d'avatar animé, pas de stagger, pas de parallax, pas de
  nouvel emoji, pas de grain. Le bloc `prefers-reduced-motion` de `base.css`
  écrase les deux transitions ci-dessus.

## Erreurs — ce que l'inspecteur dit

- banque vide → « rien encore pour *\<nom du registre\>* », fiche réduite au
  chrome (Style / Monde / Pack), qui reste vrai sans image.
- image qui ne charge pas → « image indisponible pour le moment ». **Sans en
  nommer la cause** : un `onerror` d'`<img>` ne distingue pas un 404 (fichier
  trié entre deux ticks) d'un 500. Une seule requête échouée, pas une par tick :
  la signature de peinture ne rejoue pas tant que rien n'a bougé.
- `/api/character` ou `/api/gallery` en échec → l'inspecteur se tait plutôt que
  d'inventer un pack ; le repli banque redevient rejouable au passage suivant.

Le nom du `.json` de workflow n'apparaît **jamais** dans la fiche : c'est de la
mécanique de pack, pas une caractéristique d'image.

## Tests

| Test | Résultat |
|---|---|
| `test_ecran_creer` | **vert** (12 s) |
| `test_apercu_prompt` | **vert** (10 s) |

Sélecteurs de fumigation intacts : `#intentGrid .it`, `#sceneGrid .sc`,
`#btnRun`, `#btnApercu`, `#btnGear`, `#runPanel`, `.tabs button[data-s=…]`.

Sondes jetables (hors repo, non versionnées) sur les comportements qu'aucun test
n'couvre : vide honnête, garde d'isolation, priorité `recent`, fondu croisé,
bascule sticky ↔ sous-le-composeur à 1100 px. Toutes vertes.

**ComfyUI était hors ligne** (`app.py --no-comfy`) : la sonde est restée rouge,
aucun batch réel n'a tourné. La source `recent` a donc été vérifiée sur
`/api/state` instrumenté, pas sur une production réelle — à re-regarder d'un œil
au premier vrai batch.

**Pillow absent de l'interpréteur de test** (`/d/SDKs/Pyhton310-6`, et non le
`python_embeded` de ComfyUI) : `/img?thumb=1` rend 500 quand la vignette n'est
pas déjà en cache. C'est un défaut d'environnement, pas du code — mais c'est ce
qui a fait corriger le message d'erreur, qui annonçait à tort « triée ou
supprimée » sur un 500.

## Ouvert

- **Rail** — la colonne de gauche perd ~130 px (778 px au lieu de 908) : quatre
  cartes de scène par ligne au lieu de cinq. Acceptable, mais si un rail
  d'outils arrive un jour à gauche, les trois zones ne tiendront plus à 1180 px
  de `--maxw`. À trancher à ce moment-là, pas avant.
- **Banque à deux sous-vues Scènes | Poses** — prochaine session. Pose et
  ControlNet n'ont pas bougé : ils restent dans `#scenes`, jamais un cran du
  composeur.
- **J7** — pas de bouton « Générer en NSFW » sous l'inspecteur. Le cran
  d'intensité et `stepSource` suffisent ; rien n'a été anticipé.
- **File GPU** — l'inspecteur montre *une* dernière image. Une file d'attente
  visible (plusieurs batchs empilés) reste à concevoir ; rien n'a été mocké.

## Note de convention

Les commentaires de `inspector.js` sont en **français**, comme les 30 autres
modules de `static/`. `CLAUDE.md` §2 demande des commentaires en anglais ; la
divergence est antérieure à cette session et uniforme sur tout le frontend.
Signalé plutôt que corrigé en douce sur un seul fichier neuf (§11) — c'est
`CLAUDE.md` ou le frontend entier qu'il faut aligner, en une passe dédiée.

---

# Plein écran + aperçu (2ᵉ passe, 29/08)

**Base** : `5f92e25` (l'inspecteur ci-dessus) · **Statut** : clos. CSS seulement,
aucun JS touché. 7 fumigations navigateur + 2 fumigations à DOM simulé, vertes.

## Ce que la 1ʳᵉ passe laissait faux

L'inspecteur était collé au bord droit du **wrap**, pas de l'**écran** : Créer
restait une page centrée à `--maxw` (1180 px), avec ~200 px de gouttière de
chaque côté sur un écran large. Et l'aperçu du prompt débordait
horizontalement — on lisait « 5 % TENUE », « 10 % TON », et rien du texte.

## Créer change de modèle de largeur

Créer n'est plus un article centré, c'est un poste de travail. `--maxw` n'a
**pas** été monté : monter la valeur aurait gardé le modèle en le distendant. La
contrainte est retirée, pour ce seul écran.

```
#creer .wrap.split  max-width:none; width:100%; margin:0
                    grid-template-columns: minmax(0,1fr) clamp(280px,22vw,420px)
```

Les autres écrans (registre, banque, revue, réglages, wizard) gardent `--maxw` :
ce sont des listes, pas un plan de travail. Le padding latéral n'est **pas**
redéclaré — `.wrap` le porte déjà (20 px, 13 px sous 820 px), et une règle à `#id`
aurait écrasé le palier mobile.

Les deux surfaces de chrome qui bordent l'écran suivent la même largeur, sinon
elles restent des rubans de 1180 px centrés au-dessus et au-dessous d'un contenu
qui va d'un bord à l'autre :

| Surface | Sélecteur | Pourquoi celui-là |
|---|---|---|
| barre de lancement | `#creer .launch .inner` | elle est **dans** `#creer` — la portée suffit, les autres barres (wizard, banque) gardent leur largeur d'article |
| barre d'intensité | `body:has(#creer.on) .intbar .inner` | elle vit **hors** des écrans (chrome global) — pas d'ancêtre `#creer` à qui s'accrocher |

`:has()` est le seul recours sans toucher au JS (aucune classe d'écran n'est
posée sur `<body>`). Dégradation si un navigateur l'ignorait : la barre reste
centrée. Un désalignement, rien de cassé.

**`clamp(280px, 22vw, 420px)`** pour la colonne de droite, et non `22vw` nu. La
borne haute n'est pas décorative : la vignette servie fait 420 px de large, au
delà la colonne afficherait un fichier remonté au-dessus de sa résolution réelle
— l'invariant que les 340 px fixes de la 1ʳᵉ passe protégeaient déjà. La borne
basse tient la fiche lisible entre 1100 et 1273 px, où `22vw` passerait dessous.

Mesuré (sonde jetable, 5 largeurs) : composeur à 20 px du bord gauche,
inspecteur à 20 px du bord droit du viewport, aucun défilement horizontal de
page. Colonne : 420 px à 2560 et 1920, 317 à 1440, 280 à 1200. Sous 1100 px,
une colonne — inchangé.

## L'aperçu du prompt : le vrai défaut était une collision de noms

`min-width:0` manquait bien sur `.fr .tx`, mais ce n'était pas la cause. Le
texte n'était pas *rétréci*, il était à **0 px de large et hors du panneau** :
l'étiquette de provenance prenait 1842 px sur une ligne de 1880.

`src` nomme trois choses. La règle de **carte** était écrite `.src{…}`, sans
portée — elle atteignait donc aussi les deux étiquettes et leur posait
`width:100%`, une bordure de 2 px et un curseur main :

| Classe | La carte | Les étiquettes qui portaient le même nom |
|---|---|---|
| `src` | `.srcgrid .src` (vignette de source NSFW) | `.fr .src` (provenance d'un fragment), `#declineBox .src` (sous-titre de Décliner) |
| `sc` | `.scenes .sc` (carte de scène) | `.fr.sc` (ligne « scène » de l'aperçu), `.bib .sc` (pastille de score) |

Corrigé en scopant les règles de **bloc** à leur grille. Les descendantes
(`.sc .ph`, `.src .tick`…) restent non scopées : elles ne trouvent rien à mordre
ailleurs, et les scoper aurait grossi le diff sans rien corriger.

Renommer la classe des étiquettes aurait été plus propre, mais touchait le JS
**et** le sélecteur `.fr .src` sur lequel `test_apercu_prompt` s'appuie. Scoper
coûte un sélecteur ; c'est le choix retenu.

Effets de bord repérés au passage, non demandés mais corrigés par la même
règle : la ligne « scène » de l'aperçu et la pastille de score de la
bibliothèque d'instructions ne se déguisent plus en carte cliquable (bordure
2 px + `cursor:pointer` sur du texte non cliquable).

`#apercuPanel` prend maintenant la largeur de la barre de lancement, dont il est
le prolongement. `overflow-x:hidden` reste, en ceinture : un fragment sans espace
(un chemin, une graine) pourrait encore pousser la ligne, et une barre de
défilement horizontale sous la barre de lancement se lit comme un artefact. Le
défilement vertical, lui, reste — le prompt complet dépasse souvent 52vh.

## Tests

| Suite | Résultat |
|---|---|
| `run_browser_tests.py` — les 7 fumigations navigateur | **7 vertes**, 0 ignorée, 0 échec |
| `test_panneau_reglages`, `test_scenes_aller_retour` (DOM simulé, hors liste) | **2 vertes** |

`test_ecran_creer` et `test_apercu_prompt` verts avant **et** après le scopage
de `.sc` / `.src` — c'est ce qui prouve que les cartes sont restées des cartes.
Sélecteurs de fumigation intacts, aucun renommé.

Sonde jetable (hors repo) sur ce qu'aucun test ne couvre : géométrie aux cinq
largeurs, débordement du panneau d'aperçu, texte de chaque fragment entièrement
dans le cadre, carte de scène toujours bordée et cliquable, ligne `.fr.sc`
redevenue du texte. Toutes vertes.

Non vérifié : **ComfyUI toujours hors ligne** (`--no-comfy`) — comme la 1ʳᵉ
passe. Rien dans ce diff n'en dépend (CSS pur), mais l'inspecteur en cours de
batch réel reste à regarder au premier vrai lancement.

## Ce qui n'a pas été fait, et pourquoi

- **Rail d'outils à gauche** — phase 2, hors session. La question ouverte de la
  1ʳᵉ passe (« les trois zones ne tiendront plus à 1180 px ») **tombe d'elle
  même** : il n'y a plus de 1180 px. Un rail se logera dans la largeur gagnée.
- **`/img/base`, Banque Scènes\|Poses, J7** — inchangés, toujours ouverts.
- **Renommage des classes en collision** — laissé. Voir plus haut : le gain est
  cosmétique, le coût touche le JS et un sélecteur de fumigation.
