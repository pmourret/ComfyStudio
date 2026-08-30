# Handoff — Revue ≠ Galerie, et ouvrir une image par son nom

**Date** : 30/08/2026 · **Base** : `f588503` (sondes du bandeau)
**Portée** : F1.1 (deux destinations) + F1.3 (focus par nom). F1.2 (fiche
personnage), F2–F5 et Wan : hors session.
**Statut** : clos. 12 fumigations navigateur vertes (dont une neuve,
`test_galerie`, et deux amendées).

## Les trois décisions, en tête comme demandé

**Métier choisi : un écran, deux métiers.** `#galerie` et `#trier` gardent
`screen: 'trier'` et sont séparés par un attribut, `#trier[data-metier]`, écrit
par `review.js` depuis la route. L'alternative — un écran `#galerie` mince
réutilisant `review.js` — aurait demandé de sortir la grille de `renderTriage`
pour la partager ; le risque de finir avec deux rendus qui divergent était réel,
et la règle de session était explicite : **jamais deux copies de `loadItems`**.
Il y a donc un chargeur, un rendu de grille, une vue plein cadre, et trois
règles CSS accrochées à `data-metier`.

**`data-s`.** Revue **garde** `data-s="trier"` — c'est le contrat de la pastille
`#nTri`, du poller et de trois fumigations. La nouvelle entrée est
`data-s="galerie"`, sixième de la navbar, entre Revue et Banque. Les `data-s`
sont donc désormais : `registre, creer, trier, galerie, scenes, appli`
(`test_ecran_creer [8c]` l'asserte à l'identique).

**Forme du hash.** Une seule, même famille que `scenes/poses` :

```
#trier               Revue    — file à juger (A_REVOIR)
#galerie             Galerie  — validées (OK)
#trier/<nomfichier>  Revue,   focus sur ce fichier
#galerie/<nomfichier> Galerie, focus sur ce fichier
```

Le nom ne peut pas être une clé en dur — il y en a autant que de fichiers. La
**forme** reste déclarée dans `ROUTES` (`nomme: true`) et résolue par
`routeFor()`, dans `constants.js` : aucun `#` n'est assemblé ailleurs. Les
appelants passent par `hashPourImage(item)`, qui choisit la destination **depuis
le bucket** de l'image — une validée se lit en Galerie, tout le reste se juge en
Revue.

## Ce que chaque métier laisse faire

| | Revue (`data-metier="revue"`) | Galerie (`="galerie"`) |
|---|---|---|
| dossier d'entrée | `A_REVOIR` | `OK` |
| sélecteur de dossier | présent, **sans** « Validées » | absent (l'onglet le dit) |
| sous la vignette | ♥ ⟳ ✕ ▣ + jugement + 🗑 | ✎ Éditer, ⤓ Télécharger, jugement, 🗑 |
| plein cadre | Valider / Décliner / Rejeter / Archiver | Télécharger, Instagram (inerte), Suivante |
| clavier | V R X A D U | bloqués ; flèches, Entrée, C/I restent |
| pastille navbar | `counts.A_REVOIR`, s'efface à 0 | **aucune** |

Rien n'est **grisé** : en Galerie les gestes de tri n'existent pas, ils ne sont
pas indisponibles. Deux exceptions assumées, qui ne sont pas du tri :
le **jugement de réalisme** (◉/◌) — il mesure, il ne range pas, et il alimente
les bandes d'étalonnage — et la **suppression définitive**, qui n'a jamais été
un bucket de plus.

Pas de badge sur Galerie : un compteur annonce du travail **en attente**, et une
image validée n'en attend aucun. `#nGal` (mort depuis la refonte du shell) est
retiré du poller.

**Téléchargement** : un `<a download href="/img?…">`, pas d'API neuve. `/img`
sert déjà ces octets, `FileResponse` en même origine, et l'URL porte le
personnage (`imgUrl`, isolation du 29/08).

**Instagram** : bouton `disabled` qui **dit pourquoi** (« pas encore branché »,
en `title` et sous le libellé). Aucune route, aucun `fetch`. Un bouton absent
laisserait croire que la question n'est pas posée ; un bouton actif mentirait.

## F1.3 — le focus, et ce qu'il fait quand il échoue

`setTriageFocus(nom)` est posé par `nav.go()` **avant** le chargement, et
consommé par `loadItems()` (`viserFocus`) : la liste n'existe pas encore au
moment où la navigation se décide. Trouvé → `SFILTER='tout'` (un nom demandé ne
doit pas rester derrière un filtre de score), curseur posé, vue **Revue** en
métier revue, **grille** en galerie.

Absent → un bandeau `.empty.avis` **au-dessus** de la grille, qui nomme le
fichier et dit ce qui a pu se passer (trié ailleurs, supprimé, autre
personnage). Jamais un `throw`, jamais une autre image à la place. Le dossier
courant reste affiché dessous : c'est la *demande* qui a échoué, pas le
chargement.

**Isolation** : `/api/gallery` ne rend que l'arbre du personnage chargé, et le
focus ne cherche que dans ce qu'il a rendu — un nom d'un autre `cid` tombe donc
dans la branche « introuvable » sans que ses octets soient jamais demandés.
`test_galerie [6b]` le joue avec un **vrai** fichier d'Abyssiaelle, ouvert
depuis le studio de Léna.

### Les deux liens qui nomment une image

- **Inspecteur** (`#insVoir`, « voir cette image ») : `hashPourImage` de l'item
  peint. Il **émet** `nav:go` sur le bus au lieu d'importer `nav.js` — qui
  l'importe déjà (`inspectorEnter`) : l'import retour aurait fermé un cycle.
- **Fin de lot d'édition** : il nomme le fichier **et** l'espace NSFW. Sa
  destination suit le verdict du lot (`recent[…].bucket`), donc Galerie pour une
  sortie validée, Revue pour une sortie à revoir — la phrase à l'écran le dit
  (« Retouche : *Galerie*, espace NSFW → l'image → Éditer »). C'est le **seul**
  geste de navigation qui entre en NSFW, parce qu'il le nomme (J7).

## Deux bugs trouvés en route, corrigés ici

1. **Le renvoi NSFW de fin de lot ne marchait pas.** `create.js` faisait
   `setTriageEntry('OK','nsfw')` puis `go('trier')` — et `go()` **repose**
   l'entrée depuis la route, écrasant l'espace demandé : le lien atterrissait en
   SFW `A_REVOIR`. L'espace passe maintenant par `go(name, skipHash, {space})`,
   qui le tient de l'appelant. Un onglet, lui, n'en passe jamais : le défaut
   reste `sfw` (contrat J7 inchangé).
2. **Toute navigation était jouée deux fois.** `go()` écrit `location.hash`, le
   navigateur répond par un `hashchange`, et le gestionnaire rappelait `go()` —
   sans les options de l'appelant, ce qui perdait précisément l'espace ci-dessus.
   `nav.js` retient le hash qu'il vient d'écrire et ignore *ce* `hashchange` ;
   une vraie navigation par l'URL (lien collé, bouton retour) ne correspond
   jamais à cette valeur et passe.

## Fichiers touchés

| Fichier | Ce qui change |
|---|---|
| `constants.js` | `ROUTES` gagne `metier` + `nomme` ; `routeFor()`, `hashPourImage()` |
| `nav.js` | `routeFor`, `opts.space`, focus, garde anti-double-navigation, `on('nav:go')` |
| `review.js` | `METIER` / `FOCUS` / `INTROUVABLE`, `setTriageFocus`, `viserFocus`, `avisFocus`, `tuileActs`, `actionsGalerie`, clavier borné, `syncTriageUi` (métier + vue + onglet) |
| `index.html` | 6ᵉ entrée navbar (icône grille de vignettes), `#trier[data-metier]` |
| `components.css` | 3 règles `data-metier`, `a.btn` / `.tacts a.dl`, `.empty.avis` |
| `inspector.js` | ligne « voir cette image », via le bus |
| `create.js` | fin de lot : destination et espace nommés |
| `poller.js` | `#nGal` retiré, commentaires remis d'équerre |

## Tests

`test_galerie.js` (neuf, dans `run_browser_tests.py`) : onglet et métier, dossier
d'entrée, absence de tout geste de tri (boutons **et** clavier), Éditer +
Télécharger (`<a download>` sur `/img` porteur du personnage), Instagram inerte
qui dit pourquoi, `#galerie/<nom>` qui vise, nom inconnu qui se dit, isolation
inter-personnage, retour en Revue avec ses gestes.

Amendées : `test_ecran_creer` (six `data-s` ; `[1e]` neuf — le lien de
l'inspecteur mène au bon métier selon le bucket) et `test_compte_rendu`
(`[6]` neuf — le renvoi de fin d'édition ouvre *cette* image en NSFW ; les 404
du lot fabriqué sont exclus du comptage d'erreurs, et c'est dit).

**12/12 vertes**, aucune ignorée.

## Checklist de session — état

**F1.1** — ✅ deux destinations · ✅ Revue = `A_REVOIR` · ✅ Galerie = `OK` ·
✅ gestes Revue V/X/A + clavier · ✅ gestes Galerie voir/éditer/télécharger ·
✅ Instagram inerte + raison · ✅ pastille sur Revue seule, effacée à 0 ·
✅ aucun onglet n'entre seul en NSFW · ✅ même split en NSFW, espaces isolés ·
✅ `#galerie` et `#trier` ne partagent plus le métier · ✅ contrat `data-s`
documenté ci-dessus.

**F1.3** — ✅ `loadItems` accepte un nom · ✅ lien inspecteur selon le bucket ·
✅ fin de lot NSFW sur *cette* image · ✅ une seule forme de hash ·
✅ isolation vérifiée avec un fichier d'un autre `cid`.

## Ce qui reste ouvert

- **ARCHIVE** reste dans le sélecteur de la Revue (comme REJET) : c'est un
  résultat de tri, pas une image gardée. La checklist le prévoyait « plus tard »
  côté Galerie — rien n'a été fait dans ce sens.
- La Galerie n'a **pas** de tri d'affichage propre (par date, par scène) : elle
  hérite de l'ordre de `/api/gallery` et du filtre par bande de score.
- « Poster sur Instagram » attend une décision produit, pas du code : rien n'est
  amorcé côté serveur.
- Prochaine session prévue : **F1.2**, fiche personnage ≠ registre.
