# J7 — NSFW généralisé comme outil, pas comme branche (terminé)

Session J7, sur `bffa667`. Quatre commits : `60d7380`, `7f85abd`, `a02d96a`,
puis le filet et cette doc. Inventaire `fichier:ligne` produit et arbitré avant
tout patch. Stack inchangée : JS vanilla, modules ES, zéro build, zéro
dépendance. Isolation disque, UX 1–6 et navbar : hors scope, non touchés.

Références : `CLAUDE.md` §5–§6 / §7 / §8.7 / §8.11, ADR-0003 (le NSFW est une
composition d'outils), ADR-0010 (l'interrupteur vit dans le registre
personnage), ADR-0012 (résolution du pack), `ROADMAP.md` J7,
`DOCS/handoffs/2026-08-29-isolation-look.md` — c'est lui qui ferme l'isolation
disque sur laquelle cette session s'appuie.

---

## Ce que J7 devait faire

Le flux était déjà le bon et déjà branché pour Léna : générer → **l'utilisateur
choisit** une image validée → reprise NSFW par l'outil de modification live par
IA → retouche par l'éditeur photo. ADR-0003 avait tranché le fond dès le 26/08.

Ce qui manquait n'était donc pas le flux, c'était son **indépendance du
personnage** et sa **fermeture par défaut**. L'inventaire a montré trois
attaches à Léna, et une quatrième que le brief n'anticipait pas.

---

## Les quatre attaches, et ce qui les remplace

### 1. Le graphe d'édition était un chemin en dur

`nsfw_batch.WORKFLOW = "WORKFLOWS/nsfw/lena_nsfw_branch_ui.json"`, surchargeable
par `config.nsfw.workflow` — c'est-à-dire par une clé de personnage, ce que
`CLAUDE.md` §8.11 interdit précisément.

**Le graphe appartient au pack.** `universe.json` gagne `edit_workflow`,
nullable. Le runner le résout depuis le pack du personnage
(`universe.require_edit_workflow`) ; un pack qui n'en déclare aucun lève
`EditToolUnavailableError` au lieu d'emprunter le graphe d'une autre famille de
modèle. La clé `workflow` a été retirée du `config.json` de Léna.

Pourquoi c'est un actif de pack et non un outil unique : les étages N1–N3b
(édition Qwen, refiner SDXL) sont agnostiques, mais **N4 « identité restaurée »
est PuLID Flux + FaceDetailer**. Pour un pack SDXL/LoRA il n'y a pas
d'équivalent — c'est un graphe neuf plus une mesure par personnage.

- `instagram-influenceur` → le graphe actuel
- `rpg-personnage` → `null`, **assumé et visible**

### 2. Les défauts `character_id="lena"`

`is_armed`, `check_armed`, `editer`, `run`, `guard_intensity` et tout le chemin
d'édition de `production.py` retombaient sur Léna quand l'appelant oubliait le
personnage — exactement la forme du bug d'isolation du 29/08. Tous supprimés ;
sur `editer` et `run`, `character_id` est **en mot-clé obligatoire**, pour qu'un
oubli lève au lieu d'être pris pour un autre argument positionnel.

### 3. Les chemins de travail partagés

- `SRC_PREFIX = "_LENA_NSFW_SRC_"` : la copie temporaire dans `ComfyUI/input`.
  Deux personnages portant le même nom de fichier se marchaient dessus.
  Maintenant `_<CID>_NSFW_SRC_`.
- `filename_prefix = "OFM/PROD/_NSFW/_BATCH/…"` : le dossier de transit côté
  ComfyUI, global à tous les personnages. Maintenant sous `PROD/<CID>/_NSFW/`.
- Le ménage de fin de lot visait `PROD/<CID>/_NSFW/_BATCH/`, **que rien ne
  crée** : il ne ramassait rien et le transit s'accumulait côté ComfyUI. Il vise
  maintenant le dossier réellement écrit.

### 4. Le palier d'édition était écrit à la main dans un seul `character.json`

Le cran NSFW n'existait que parce que quelqu'un l'avait tapé dans
`lena/creative.json`. Il est désormais **stampé par le `creative_seed` du pack**
qui a un graphe : tout futur personnage `instagram-influenceur` en hérite sans
édition manuelle, et sa destination suit son pipeline.

---

## Le cran : absent, pas grisé

`/api/creative` **n'émet plus** un palier `requires: "armed"` quand l'outil n'est
pas disponible. Conséquences :

- le curseur est reconstruit depuis cette liste, il **ne filtre rien** — et
  surtout pas par nom de personnage (`CLAUDE.md` §8.7) ;
- l'échelle d'un personnage désarmé ne fuit même pas jusqu'au navigateur ;
- `p.locked`, la branche `if (p.locked) setLevel` et la règle CSS `.locked` sont
  morts et supprimés ;
- `guard_intensity` reste le verrou serveur. **Le masquage ne remplace pas la
  garde** — il évite d'inviter, il n'autorise rien.

Soft et Suggestif ne bougent pas : ce n'est pas le cran d'un outil.

Un détail qui n'était pas au brief : la couleur du cran était indexée sur son
**rang** (`.lv3`). Un pack dont l'édition tombe au niveau 1 aurait pris la teinte
de « Soft ». Elle suit maintenant ce que le cran **fait** (`.lvedit`).

---

## Disponible = armé **ET** graphe déclaré

`nsfw_batch.edit_tool_state(cid)` est la réponse unique, avec sa raison quand
l'une des deux conditions manque. Deux conditions, jamais une seule :

| | armé | pack avec graphe | cran |
|---|---|---|---|
| Léna | oui | oui | **présent** |
| Abyssiaelle | non | non | absent, raison de pack |
| un personnage neuf (wizard) | **non** (défaut) | oui | absent |
| Abyssiaelle si on l'armait | oui | non | **absent**, raison de pack |

La dernière ligne est celle qui compte : **armer un personnage dont le pack n'a
pas l'outil est permis et ne fait apparaître aucun cran.** Sans elle,
`available` pourrait ne suivre que l'armement, et personne ne s'en apercevrait
avant un lancement raté. Elle est verrouillée par un test.

---

## Le geste d'armement : un seul endroit

Il vivait à **deux** endroits, tous deux au milieu d'un geste de production : le
cran verrouillé du curseur, et un bouton dans la modale Décliner. Plus un
bouton « désarmer la branche » sur le bloc Image source — soit trois portes vers
la même décision.

Il vit maintenant dans **une** section « Contenu adulte — *nom* » sur l'écran
Application (`AUTOMATION/web/static/nsfw-arm.js`), activation **et**
désactivation. Le rituel du mot ARMER et le `#armBox` existant sont repris tels
quels ; la copy est corrigée :

- `PROD/<CID>/_NSFW/`, jamais `PROD/_NSFW/` (ce chemin n'existe plus depuis le
  29/08) ;
- « part de l'image validée que tu choisis », plus « part du niveau **Soft** » —
  qui décrivait le `base_level: 1` de Léna et n'aurait rien voulu dire ailleurs ;
- désactiver dit explicitement que **rien n'est supprimé**.

**Pas d'interrupteur global.** La ROADMAP disait « paramétrage de l'app » et
`CLAUDE.md` §6 « un personnage nouvellement créé n'a jamais le NSFW actif » : ce
n'est pas contradictoire une fois qu'on sépare *où le geste se fait* (l'écran
Application) de *ce qu'il écrit* (le registre du personnage courant, ADR-0010).
Un interrupteur qui vaudrait pour tous les personnages à la fois n'aurait aucun
sens.

La pastille NSFW du registre reste un **indicateur**, pas un bouton : les cartes
sont des liens de navigation, y greffer un rituel de confirmation aurait été un
piège de clic.

Décliner ne propose plus d'armer — elle **nomme l'endroit**, en phrase inerte :
« *Pour l'activer : Application → Contenu adulte* ». Effet de bord bienvenu : le
cycle d'import `review ↔ create` disparaît avec.

---

## La retouche, quatrième étape enfin nommée

Le flux d'ADR-0003 a quatre étapes ; les trois premières se suivaient à l'écran,
la quatrième n'était nommée nulle part. Un lot d'édition se terminait sur
« Trier les résultats », comme un lot SFW.

`STATE` porte maintenant `edition`, et le résumé de fin de lot d'édition ajoute
la phrase — *« Retouche : Revue, espace NSFW → l'image → Éditer »* — plus un lien
qui ouvre la Revue **directement dans cet espace**. Aucune route neuve :
`setTriageEntry` accepte un espace, `'sfw'` par défaut comme avant, pour que les
onglets du chrome n'y entrent jamais tout seuls.

Un saut direct vers l'éditeur photo aurait demandé une route neuve
(`ouvrirEditeur` exige un item de la Revue) : écarté, conformément à l'arbitrage.

---

## Deux défauts trouvés en chemin, hors brief

### La branche d'édition n'écrivait jamais en base

`test_coherence_base` est passé au rouge en cours de session, sur un lot NSFW
réel lancé à 23:48. Diagnostic : `nsfw_batch.journal()` écrivait le CSV et
s'arrêtait là. **Les sorties d'édition n'entraient en base que par une migration
lancée à la main** (`migrer_base.py`, `migrer_prod_par_personnage.py`).

La base étant la source de vérité (`CLAUDE.md` §7), chaque lot laissait donc la
vérité en retard sur le disque. Corrigé : `runner.sortie.ecrire_nsfw_en_base`,
appelée depuis `nsfw_batch.journal()` — le point de passage **unique** des deux
chemins qui produisent des lignes (le lot d'édition et l'enchaînement « générer
avant d'éditer »). La brancher chez les appelants, c'était s'assurer qu'un des
deux l'oublie ; il l'avait d'ailleurs oubliée entièrement.

La ligne orpheline du lot réel a été rattrapée **par ce même chemin** — ce qui le
valide contre une vraie sortie GPU.

`intensite` reste nul, là où la migration figeait `3` : le niveau du palier qui
édite dépend du pack, et 3 ne valait que pour Léna.

### La destination affichée pouvait nommer le dossier d'un autre

Le test d'isolation étendu a attrapé ceci : `destination` est une chaîne
**stockée** dans `creative.json`, montrée à l'utilisateur dans la confirmation de
palier. Un personnage dont le `creative.json` est repris d'un autre annonçait
donc `PROD/LENA/_NSFW` tout en écrivant chez lui.

`/api/creative` la **calcule** désormais depuis le personnage courant au lieu de
croire la donnée. Le `create_character` du wizard la pose correctement à la
création (commit 1), mais une valeur stockée peut toujours dériver — la lire est
plus sûr que la maintenir.

---

## Tests

| Test | Ce qu'il verrouille |
|---|---|
| `test_nsfw_isolation.py` **(neuf)** | sources, résolution d'un nom homonyme, sortie, journal, transit, préfixe ComfyUI ; signatures sans défaut ; graphe résolu depuis le pack ; les deux conditions, dont « armé mais pack sans graphe ». Sans GPU. |
| `test_isolation_disque.py` §8 **(neuf)** | par les ROUTES : palier non émis si désarmé, armement qui ne touche que son registre, sources jamais celles d'un autre, refus d'éditer l'image d'un autre, refus sans sélection, aucun fichier écrit nulle part. |
| `test_contenu_adulte.js` **(neuf)** | cran présent chez Léna, absent chez Abyssiaelle, aucun cran grisé, aucune porte d'armement sur Produire, raison du pack sur Application, dossier de sortie nommé avec le personnage. |
| `test_ecran_creer.js` | non-régression : Léna armée garde son cran, ses sources, sa pastille métier. |

**22/22 tests Python verts. 8/8 fumigations navigateur vertes.**

### Sur le GPU

Aucun lot NSFW n'a été lancé *par la session* : les fumigations tournent en
`--no-comfy`, et l'armement comme le masquage n'en ont pas besoin. **UI et routes
vérifiées, graphe non relancé par la session.**

Un lot réel a cependant tourné pendant la session (23:46–23:48, 1 image, score
0.766, `OK`) : il a produit sa sortie dans `PROD/LENA/_NSFW/OK/` et sa ligne de
journal **avec le code de cette session** — donc graphe résolu depuis le pack,
préfixe et transit namespacés. C'est ce lot qui a révélé le trou d'écriture en
base.

---

## Ce qui reste

- **Le graphe d'édition SDXL pour `rpg-personnage`** — reporté, et c'est la seule
  chose qui manque pour qu'Abyssiaelle ait l'outil. Demande un graphe neuf
  (étage « identité restaurée » sans équivalent PuLID côté SDXL/LoRA), sa
  validation `wf_check`, et une mesure par personnage. Sa déclaration est déjà
  prête : `edit_workflow` dans `UNIVERS/rpg-personnage/universe.json`.
- **Un lot NSFW réel de bout en bout piloté par la session**, sur GPU, pour
  mesurer le chemin complet plutôt que le déduire.
- **`"flux+edit"` en dur** — 17 occurrences (`.py` et `.js`) où une famille de
  modèle sert à dire « ce palier édite ». Sans effet aujourd'hui (le seul pack
  qui édite est flux) ; un `sdxl+edit` demandera un `estPalierEdition` /
  `palier_edition` partout. Le helper existe déjà des deux côtés, il reste à
  généraliser les comparaisons. Non fait ici : hors arbitrage, et à faire d'un
  seul geste plutôt qu'à moitié.
- **`espace = 'lena'`** dans le schéma de base désigne le SFW, pour raison
  historique (`base.py`, `shared_state._ALIAS_ESPACE`). Vocabulaire, pas
  isolation — les lignes portent `character_id` à part.
