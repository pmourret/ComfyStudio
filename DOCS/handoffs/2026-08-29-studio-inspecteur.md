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
