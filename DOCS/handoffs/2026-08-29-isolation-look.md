# ISOLATION DISQUE (vague 1, terminée) + LOOK « Chambre noire » (vague 2, à faire)

Session « STUDIO LOOK + ISOLATION DISQUE ». Plan validé avant patch (inventaire
`fichier:ligne` + plan de migration, puis STOP). **Vague 1 livrée et verte** ;
la vague 2 (look) est reportée à la session suivante, sa spec est en bas de ce
fichier. Stack inchangée : JS vanilla, modules ES, zéro build, zéro dépendance.
Métier NSFW (J7) et nav shell hors scope, non touchés.

Références : `CLAUDE.md` §8.7 / §11, `.claude/rules/backend.md`,
`AUTOMATION/web/static/DESIGN.md`, `DOCS/handoffs/2026-08-29-vague2-primitives-editeur.md`
(« `/img` non partitionné » — c'est ce point qui ouvre cette session).

---

## Le bug

Le runner range déjà par personnage depuis J2 (`PROD/<CID.upper()>/`), et
Abyssiaelle avait 5 images sur le disque. **Aucune route web ne savait les
lire** : `bucket_dir()` rendait `PROD/LENA/` quel que soit le personnage, et
`/img` n'avait même pas de paramètre `character`. La Revue d'Abyssiaelle
affichait donc la galerie de Léna.

Trois fuites de plus, trouvées à l'inventaire et non listées au brief :

- `nsfw_batch.sources_disponibles/resoudre_source` lisaient `PROD/LENA/` en dur :
  l'édition NSFW d'un autre personnage aurait repris **les images de Léna** ;
- `scene_previews()` illustrait les cartes de scène de l'écran **Créer** avec
  les images de Léna, pour tout le monde ;
- `noter_bucket()` appelait `enregistrer_image` / `renommer` **sans
  `character_id`** → défaut `'lena'` : trier une image d'Abyssiaelle depuis la
  Revue aurait écrit une ligne `character_id='lena'` dans la seule base. La base
  était restée propre uniquement parce que personne n'avait encore trié un autre
  personnage depuis l'interface.

Et une quatrième, côté publication : `tri.exporter` écrivait
`PROD/EXPORT/<catégorie>/` (sans personnage) alors que `runner/sortie.py` écrit
`PROD/EXPORT/<cid>/<catégorie>/` — deux dispositions dans le même arbre, et
`retirer_export()` faisait un `rglob` sur **tout** `PROD/EXPORT/` : rejeter une
image pouvait supprimer l'export homonyme d'un autre personnage.

---

## Ce qui change — vague 1

### Disposition disque (cible atteinte)

```
PROD/<CID.upper()>/<bucket>/          SFW          LENA inchangé, à l'octet près
PROD/<CID.upper()>/_NSFW/<bucket>/    NSFW         ← PROD/_NSFW/ global déplacé
PROD/.thumbs/<cid>/<space>/<bucket>/  vignettes    ← .thumbs/<space>/<bucket>/
PROD/EXPORT/<cid>/<catégorie>/        export       une seule disposition
PROD/journal_batch.csv                + colonne `character`
```

### C1 · `shared_state.py` — le foyer

- `bucket_dir(bucket, space, character_id)` : **les trois obligatoires, aucun
  défaut**. Un appelant qui oublie le personnage lève, il ne retombe plus en
  silence sur l'arbre de Léna — c'était exactement le bug.
- Deux axes explicitement séparés : `space_id()` (valeur canonique de l'axe
  SFW/NSFW) et `espace_db()` (valeur écrite dans `image.espace`).
  **`space=lena` reste accepté en entrée comme alias SFW documenté** ; la valeur
  canonique rendue et écrite est `sfw`. La colonne `image.espace` **garde** son
  vocabulaire historique (`'lena'` = SFW, filtrée par 3 requêtes de `base.py`) :
  la conversion vit au seul point de contact, pas de migration de base (décision
  A de la session — **C7 DB écarté**).
- `character(request, requis=False)` : nouveau mode strict, pour les routes qui
  servent des octets.
- `journal_path()` (fonction, pas constante : les tests réassignent `ss.OFM`),
  `journal_index(character_id)`, `avg_duration(character_id)`,
  `ligne_character(row)` (repli `lena` pour un journal non migré).
- `oublier_vignette(nom, bucket, space, character_id)`, `purger_vignettes()` en
  profondeur 4, racines lues depuis `lb.list_characters()`.
- `export_dir(character_id)`, `undo_disponible(character_id)`.

### C2 · `/img` — `character=` obligatoire

`ss.character(request, requis=True)` : absent → **400**, pas le défaut `lena`.
Chemin = `bucket_dir(…, cid)`, **404** si le fichier n'est pas dans cet arbre —
aucune retombée sur un autre. Vignettes sous `.thumbs/<cid>/<space>/<bucket>/`.

### C3 · `routes/tri.py`

Les 7 handlers résolvent `cid` avant tout accès disque. `noter_bucket` et
`renommer` reçoivent `character_id`. `exporter` écrit `EXPORT/<cid>/<cat>`,
`retirer_export(nom, cid)` ne balaie que cet arbre. Les entrées `UNDO` portent
`character` ; `api_undo` dépile **la dernière action du personnage courant**
(sinon 400) — plus d'annulation trans-personnage.

### C4 · `etat.py` / `banque.py` / `production.py` / `nsfw_batch.py`

`/api/state` et `/api/nsfw/state` comptent l'arbre du personnage demandé ;
`/api/journal` et `scene_previews(cid)` sont filtrés ; `duree_unitaire()` prend
la durée réelle **du personnage du batch** (un pack SDXL et un pack Flux ne vont
pas à la même vitesse). `nsfw_batch` : `OUT_ROOT`/`JOURNAL` (constantes) →
`out_root(cid)` / `journal_path(cid)` ; `bucket_dir`, `sources_disponibles`,
`resoudre_source`, `journal` prennent le personnage.

### C5 · Journal + migration

Colonne `character` ajoutée à `JOURNAL_COLS` (`runner/sortie.py`) et remplie à
l'écriture. `AUTOMATION/tests/migrer_prod_par_personnage.py`, **idempotent**,
4 étapes, ne perd jamais un fichier (collision → arrêt bruyant, rien d'écrasé) :

1. `PROD/_NSFW/` → `PROD/LENA/_NSFW/` ;
2. catégories héritées de `PROD/EXPORT/` → `PROD/EXPORT/lena/` (est « héritée »
   tout dossier de 1er niveau qui n'est pas un personnage du registre) ;
3. colonne `character` sur le journal, **oracle = la base** (`image.character_id`),
   `.csv.bak` avant réécriture — stamper `lena` en aveugle aurait été faux, 5
   lignes d'Abyssiaelle étaient déjà dans le CSV ;
4. vignettes : **rien à migrer**. `.thumbs` est un cache que `purger_vignettes()`
   jette dès que sa profondeur change. Ça évite en prime l'ambiguïté
   `.thumbs/lena` (espace) vs `.thumbs/lena` (personnage).

**Exécutée sur le disque réel** : NSFW déplacé, 7 catégories d'export
regroupées (14 entrées), 59 lignes de journal attribuées (lena 54,
abyssiaelle 5). Second passage : no-op sur les 4 étapes.

### C6 · Front — un seul constructeur d'URL

`imgUrl({bucket, space, name, thumb})` dans `api.js` (seul module qui connaît
`currentCharacter()`). Les 6 sites d'appel passent par lui : `review.js` (grille,
vue Revue, lightbox), `editor.js`, `create.js` (aperçu de scène, grille de
sources NSFW, bande en direct). Les deux premiers de `create.js` n'envoyaient
même pas `space`. `review.js` : `SPACE = 'sfw'` ; `index.html` : `data-sp="sfw"`.
Plus une seule URL `/img` assemblée à la main hors `api.js:19`.

---

## Fichiers touchés

| Fichier | Changement |
|---|---|
| `AUTOMATION/web/shared_state.py` | `bucket_dir` à 3 args obligatoires ; `space_id`/`espace_db` ; `character(requis=)` ; `journal_path`/`journal_index(cid)`/`avg_duration(cid)`/`ligne_character` ; `export_dir`/`undo_disponible` ; vignettes profondeur 4 |
| `AUTOMATION/web/routes/vignettes.py` | `/img` : `character=` obligatoire, 404 hors arbre, thumbs par personnage |
| `AUTOMATION/web/routes/tri.py` | 7 handlers scopés ; export namespacé ; base écrite avec `character_id` ; UNDO scopé à la lecture |
| `AUTOMATION/web/routes/etat.py` | `/api/state`, `/api/journal`, `/api/nsfw/state`, `duree_unitaire` |
| `AUTOMATION/web/routes/banque.py` | `scene_previews(cid)`, stats de repli, `avg_duration(cid)`, sources NSFW |
| `AUTOMATION/web/routes/production.py` | sources/résolution NSFW par personnage, `historique_instructions(cid)`, `recent.space = "sfw"` |
| `AUTOMATION/nsfw_batch.py` | `out_root(cid)` / `journal_path(cid)` ; `bucket_dir`, sources, journal par personnage |
| `AUTOMATION/runner/sortie.py` | colonne `character` dans `JOURNAL_COLS` + à l'écriture |
| `AUTOMATION/web/static/api.js` | **`imgUrl()`** |
| `AUTOMATION/web/static/{review,editor,create}.js`, `index.html` | passage par `imgUrl` ; axe SFW nommé `sfw` |
| `AUTOMATION/tests/migrer_prod_par_personnage.py` | **neuf** — migration idempotente |
| `AUTOMATION/tests/test_isolation_disque.py` | **neuf** — 7 blocs, l'isolation des IMAGES |
| `AUTOMATION/tests/{test_tri_export,test_suppression_edition,test_serveur_http,test_coherence_base}.py` | adaptés à la nouvelle disposition |
| `AUTOMATION/mcp_server.py` | outil `etat` : comptes par `<cid>/<space>` (lecture seule, ADR-0007 intacte) — Abyssiaelle y était invisible |
| `AUTOMATION/tests/{backfill_embeddings,reparer_collisions}.py` | racines lues depuis `lb.list_characters()` au lieu de `PROD/LENA` + `PROD/_NSFW` |
| `AUTOMATION/tests/migrer_base.py` | **en-tête d'avertissement** : script J1, antérieur à l'isolation, ne plus lancer tel quel (il écrirait `character_id='lena'` partout) ; le message d'échec de `test_coherence_base` ne le recommande plus |

---

## Vérification

- **21/21 tests Python verts**, dont `test_isolation_disque.py` (neuf) :
  galerie limitée à l'arbre du personnage · alias `space=lena` · `/img` sans
  `character=` → 400 · nom d'un autre personnage → 404 dans les deux sens ·
  vignette sous `.thumbs/probe/sfw/OK/` · compteurs `/api/state` par personnage ·
  `/api/action` sur un fichier de Léna depuis `probe` → 404 **et le fichier de
  Léna n'a pas bougé** · `/api/undo` ne rend pas l'action d'un autre · journal
  filtré. La fixture (`CHARACTERS/probe`, `PROD/PROBE/`, vignettes, lignes de
  base) est supprimée en `finally`.
- `test_coherence_base.py` : **repassé de 2 échecs à tout vert**, et il voit
  maintenant 83 PNG au lieu de 54 (il était aveugle à une partie de l'arbre).
  Son assertion `[0]` « un seul personnage existe ici : lena » était **périmée
  depuis J6** — remplacée par « tout `character_id` est un personnage du
  registre, aucun NULL ».
- **7/7 fumigations navigateur vertes**, 0 erreur JS (`run_browser_tests.py`,
  ComfyUI en ligne — `test_pose_extraction` a réellement tourné).
- **Vérification manuelle, personnages réels** :
  `?character=abyssiaelle` → ses 4 images OK avec ses scènes (`camp_soir`,
  `portrait_etude`) ; `?character=lena` → ses 33, aucun nom d'Abyssiaelle ;
  `/img` croisé → 404 dans les deux sens ; sans `character=` → 400 ;
  compteurs `lena {OK 33 … NSFW 21}` vs `abyssiaelle {OK 4 … NSFW 0}`.

---

## Résidus connus, assumés

- **`PROD/mesures.json` reste global**, indexé par nom de fichier nu (décision C
  de la session). La base porte déjà les mêmes scores par personnage, et aucune
  collision de nom n'existe aujourd'hui (vérifié sur le disque). Mais
  `lb.nom_libre` ne garantit l'unicité qu'à l'intérieur d'un arbre `PROD/<CID>/` :
  **déclencheur de reprise = la première collision de nom entre deux
  personnages** (même id de scène, même jour). Concerne `/api/gallery`
  (nettete/texture/fond/flag, `sans_mesure`), `/api/flag`, `/api/mesurer`.
- **`image.espace` garde `'lena'` comme valeur SFW** en base (3 requêtes de
  `base.py`). Pur vocabulaire, sans effet visible ; `espace_db()` isole la
  conversion. Une ADR serait le bon endroit si on veut la migrer un jour.
- `nsfw_batch.SRC_PREFIX = "_LENA_NSFW_SRC_"` : préfixe d'une copie temporaire
  dans `ComfyUI/input`, effacée après usage. Littéral cosmétique, aucun impact.
- Le dossier de transit ComfyUI (`filename_prefix`, `OFM/PROD/…/_BATCH/`) vit
  côté ComfyUI (`H:`), pas dans le repo : il n'est pas partitionné et n'a pas à
  l'être — la sortie n'y reste pas. Le nettoyage de dossiers vides côté repo
  (`sortie.py`, `nsfw_batch.run`) est vestigial depuis le fork J1.
- `character.js` : `PARAMS.get('character') || 'lena'` — littéral préexistant,
  inchangé.
- `tests/migrer_base.py` reste mono-personnage. Il n'est plus un remède : la
  base **est** la source de vérité et porte `character_id` depuis J2. Averti
  dans son en-tête plutôt que réécrit — le réécrire serait un chantier à part,
  sans besoin réel aujourd'hui.

---

## Vague 2 — LOOK « Chambre noire » (session suivante)

**Non commencée.** Spec validée en session, à appliquer telle quelle. Uniquement
tokens + CSS qui consommaient des hex. Identité visuelle **commune** (chrome
studio), pas une peau Léna.

Remplacer `:root` dans `tokens.css` :

```css
--bg:#121418; --panel:#1a1d23; --panel2:#232831;
--line:#2e3440; --line2:#434b5a;
--txt:#e6e8ee; --dim:#9aa3b2; --dim2:#6d7584;
--acc:#c4a36a; --acc-d:#9a7d4a; --on-acc:#141208;
--ok:#7d9a7e; --warn:#c4a04a; --bad:#c46b66; --high:#5aa86a;
--none:var(--dim2);
```
Adapter `--warn-bg` / `--danger-bg` / `--mes-bg` pour rester lisibles sur ce
fond (pas de néon). Ajouter et brancher les jetons laissés bruts par
`DESIGN.md` : `--elev`, `--scrim`, `--focus` — plus aucun `#000x` / `#000c`
orphelin dans `components.css` / `screens.css` pour les overlays (il en reste au
moins un : `::backdrop` des `<dialog>`, posé à la vague 2 des primitives).

Contraintes : densité studio (Lightroom), pas landing · header, les 5 onglets
lisibles ≥ 1100 px, sous 1100 labels plus courts ou wrap contrôlé — **ne pas
cacher Banque dans un menu** · `body.no-character` et `body.editing` inchangés
fonctionnellement · `:focus-visible` sur `--focus` · pas d'emoji nouveaux, pas
de gradient hero, pas de card marketing · garder `system-ui` ; `--font` un peu
plus compact (14px/1.45) seulement si le header coince — **le mesurer**.

Hors look : rewrite `create.js`, wizard métier, file GPU, React.

---

## Ce qui reste ouvert (hors les deux vagues)

- **File GPU riche** (vague 2 backend) : `/api/state` n'expose qu'un batch
  courant, pas de file d'attente. Zone SANTÉ honnête, non mockée.
- **Monolithes** `create.js` / `review.js` / `advanced.js` : non refactorés.
- `nav.go()` ne nettoie pas `ED_ITEM`/`ED_IMG` quand on quitte l'éditeur par un
  onglet du chrome. Bénin, inchangé.

Un 3ᵉ personnage emprunte le même chemin — aucun `if` sur l'id introduit.
