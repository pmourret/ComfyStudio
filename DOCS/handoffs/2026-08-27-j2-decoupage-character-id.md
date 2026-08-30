# J2 — Découpage des monolithes + character_id (terminé)

Commits : `1aa635c` (étape 1), `84be34f` (étape 2 + renommage), `c9d6abf`
(étape 3), `c73479b` (étape 4). Plan de référence exécuté intégralement :
`bubbly-watching-elephant` (4 étapes, une pause validée après chacune).

## État atteint

Les deux monolithes visés par `ROADMAP.md`/J2 sont découpés, et
`character_id` est un paramètre réellement enfilé de bout en bout (jamais
une colonne décorative) : de la base SQLite jusqu'au rangement disque et à
l'assemblage de prompt. Un seul personnage existe encore (`lena`), mais plus
aucune fonction généralisée ne suppose qu'un seul personnage peut exister.

### Étape 1 — `base.py` : schéma + `character_id`
- `SCHEMA` : `character_id` sur `batch`/`image`/`reference_set`, index
  unique `(character_id, fichier)` (remplace l'ancien `UNIQUE(fichier)`).
- Fonctions de lecture généralisées avec `character_id` **obligatoire**
  (pas de défaut caché) : `stats_par_scene`, `mesures_par_fichier`,
  `derive_par_scene`, `construire_jeu` (bug trouvé et corrigé au passage :
  désactivait les jeux de référence de TOUS les personnages, pas seulement
  celui en cours), `jeu_actif`, `rescorer`.
- Nouveau test `test_cross_character.py` : deux personnages fictifs avec
  mêmes noms de scène/fichier, vérifie zéro fuite de données dans les 6
  fonctions généralisées (exigence explicite CLAUDE.md §11).
- Base régénérée via `migrer_base.py` (85 images, 343 scores, 11 jugements
  — identique à avant).

### Étape 2 — `CHARACTERS/lena/{config,scenes,creative}.json`
- Déplacés hors de `AUTOMATION/`. `.gitignore` → `/CHARACTERS/`.
- `character_dir`/`config_path`/`scenes_path`/`load_config`/`load_scenes`/
  `load_creative` paramétrés par `character_id`, plus de chemin fixe.
- Fait dans le même commit qu'une **passe de renommage complète** (demande
  explicite de l'utilisateur, hors plan initial) : `lena_batch.py` →
  `runner.py`, `mcp_lena.py` → `mcp_server.py`, fonctions MCP
  `lena_etat`/`lena_scenes`/`lena_plan`/`lena_mesures` → `etat`/`scenes`/
  `plan`/`mesures`, `PROD/lena.db` → `PROD/soulglade.db`, serveur MCP
  `"lena"` → `"soulglade"` (choix validés par l'utilisateur via
  AskUserQuestion). Volontairement **non renommé** : la valeur de donnée
  `character_id="lena"`, les fichiers `WORKFLOWS/*/lena_*.json` (risque
  ComfyUI), les préfixes de namespace `_LENA_EXPR_`/`_LENA_NSFW_SRC_`/
  `_LENA_POSE`, les ADR `0007`/`0008`/`0009` (frozen, jamais réécrits après
  coup).

### Étape 3 — `runner.py` → paquet `AUTOMATION/runner/`
- `runner/{__init__,prompt,comfy,sortie,cli}.py`. `__init__.py` réexporte
  tout (`from .prompt import *` etc.) : les 16 sites `import runner as lb`
  existants n'ont pas bougé.
- `build_jobs(..., character_id="lena", ...)` stampe `job["character_id"]`
  sur chaque job. `execute_jobs` (colonne vertébrale unique, §8.2) et
  `sort_and_export`/`ecrire_en_base` enfilent `character_id` jusqu'au
  disque (`PROD/<character_id.upper()>/`, aucun `if character == "lena"`
  en dur, §8.7) et jusqu'à la base. Export namespacé :
  `PROD/EXPORT/<character_id>/<catégorie>`.
- Nouveau lanceur plat `AUTOMATION/run_batch.py` : un module à l'intérieur
  d'un paquet ne peut pas s'exécuter en `__main__` avec des imports
  relatifs — `run_batch.py` fait le `sys.path.insert` puis
  `from runner.cli import main`.
- 2 bugs trouvés par audit croisé avant qu'ils ne cassent en prod :
  `jobs_declinaison` était appelé avec `creative` **positionnel** dans
  `/api/decline` — le nouveau paramètre `character_id` aurait décalé
  silencieusement l'argument. Corrigé en keyword aux deux sites d'appel.
- Vérifié en réel : batch complet via ComfyUI, image dans `PROD/LENA/OK/`,
  `character_id='lena'` confirmé en base par requête directe. **Effet de
  bord non nettoyé** : `lifestyle_cafe_terrasse_20260827_01.png` reste dans
  `PROD/LENA/OK/`, jamais notée/triée — proposé à l'utilisateur, pas encore
  tranché à la fin de cette session.

### Étape 4 — `web/app.py` → `web/routes/` + `web/shared_state.py`
- `app.py` (2031 lignes) réduit à l'assemblage (~90 lignes) : middlewares,
  `app.add_routes(...)` par module, argparse, démarrage serveur.
- `web/shared_state.py` : STATE/UNDO/CHECKER+verrou, `cfg()`/
  `scenes_data()`, `bucket_dir()`, vignettes (`VIGNETTES`, purge), sonde
  ComfyUI, middlewares `garde_origine`/`garde_erreurs`.
- `web/routes/{etat,banque,vignettes,production,tri}.py` : 31 routes via
  `aiohttp.web.RouteTableDef()`, chemins d'URL strictement inchangés.
- Règle suivie partout : l'état partagé est référencé via l'objet module
  (`ss.OFM`, `ss.UNDO`, jamais un `from shared_state import OFM`) — sinon
  le monkey-patching que font les tests (`ss.OFM = racine_jetable`) cesse
  de fonctionner silencieusement et les tests retomberaient sur la vraie
  `PROD/`.
- 2 bugs mineurs : `import json` manquant dans `production.py`
  (`api_nsfw_arm`), imports `asyncio`/`shutil` redondants en corps de
  fonction consolidés en tête de module.
- `test_valider_banque.py`/`test_tri_export.py`/`test_suppression_edition.py`
  mis à jour vers les nouveaux emplacements ; `test_serveur_http.py` inchangé
  (sous-processus HTTP, aucun couplage direct).
- Vérifié : suite complète verte + lancement réel du serveur restructuré,
  `/api/state` répondant en HTTP avec les vrais compteurs de production.

## Invariants CLAUDE.md vérifiés à chaque étape

§8.2 (un seul `execute_jobs`), §8.3 (test byte-exact du prompt inchangé),
§8.7 (aucun `if character == "lena"` en dur — `character_id.upper()` fait
le travail), §7 (une seule base SQLite, `character_id` en colonne), §11
(chaque fonction généralisée a un test de non-fuite entre personnages).

## Ce qui reste ouvert

- Image de test non triée dans `PROD/LENA/OK/` (voir étape 3 ci-dessus) —
  décision utilisateur en attente.
- `UNDO` reste global, non scopé par personnage (risque noté dans le plan,
  sans conséquence tant qu'un seul personnage tourne à la fois — à
  revisiter si J3+ permet un changement de personnage en cours de session).
- `PROD/_NSFW/` non paramétré par personnage (décision de portée assumée en
  J2, un seul personnage a le NSFW actif aujourd'hui).
- `character_id="lena"` reste la seule valeur en dur aux points d'entrée
  (CLI `--character` par défaut, web toujours `"lena"`) — un vrai registre
  multi-personnage est J4, pas J2.

## Prochaine étape attendue

`ROADMAP.md` : **J3 — Frontend** (modules ES, design system minimal,
sélecteur de personnage `?character=` en simple rechargement). Ne pas
démarrer sans feu vert explicite de l'utilisateur — même logique de pause
entre étapes que pour J2.
