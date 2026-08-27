# J4 — Registre univers + registre personnage (terminé)

Commits : `50def47` (étape 1), `31c0e85` (étape 2), `bda7911` (étape 3),
`f269e7a` (étape 4), + cet handoff/ROADMAP (étape 5). Plan de référence :
`wild-riding-crayon`. Trois décisions actées avec l'utilisateur avant
d'écrire (AskUserQuestion) :

1. **Fichiers par entité, découverte par scan** — pas de fichier registre
   central. Univers versionné (`UNIVERS/`), personnage git-ignoré
   (`CHARACTERS/`).
2. **L'interrupteur NSFW on/off passe dans `character.json`** (`CLAUDE.md` §7).
3. **`rpg-personnage` = entrée de registre seule** en J4 — pas d'`identity/`
   (J5), pas d'Abyssiaelle (J6).

## État atteint

Le repo avait des fichiers de données par personnage
(`CHARACTERS/<id>/{config,scenes,creative}.json`) mais aucune notion
d'univers et aucun registre — `character_id` n'était qu'une chaîne valant
`"lena"` partout. J4 ajoute les deux registres exigés par `CLAUDE.md`
§3–§5, §7, et déclare un vrai second univers pour prouver que ça
généralise.

### Étape 1 — Registre univers (`UNIVERS/`, versionné) — `50def47`

- `UNIVERS/<id>/universe.json` : `id`, `label`, `model_family`, `identity`,
  `posing`, `output_styles`. `model_family`/`identity`/`posing` sont des
  **chaînes déclaratives** en J4 — câblées à `AUTOMATION/identity/` en J5.
- `UNIVERS/<id>/tools.json` : panel d'outils (`scope` `global`|`universe`).
  On n'y liste que ce qui existe (l'éditeur d'image). Pas de rendu à
  l'écran tant qu'aucun outil dédié n'existe.
- Deux univers : `instagram-influenceur` (flux + pulid_flux, ← Léna telle
  quelle), `rpg-personnage` (sdxl + lora_sdxl, alt ipadapter_faceid).
- `AUTOMATION/universe.py` : `list_universes()` (scan), `load_universe`,
  `load_tools`, `exists`. Id inconnu → `UnknownUniverseError(ValueError)`
  lisible, jamais un chemin nu.
- `DOCS/adr/0010-registres-univers-personnage.md`.
- `AUTOMATION/tests/test_universe_registry.py`.

### Étape 2 — Registre personnage (`CHARACTERS/<id>/character.json`) — `31c0e85`

- `character.json` : `id`, `name`, `universe`, `content_types`
  (`image` actif, `video`/`voice`/`staging` déclarés inactifs — ADR-0004),
  `nsfw`. Git-ignoré, même régime que `config/scenes/creative.json`.
- `AUTOMATION/runner/prompt.py` : `character_json_path`, `load_character`
  (erreur explicite si absent), `character_universe`, `content_type_active`.
  Ré-exportés par `runner/__init__.py` (`from .prompt import *`).
- `AUTOMATION/web/shared_state.py` `character(request)` durci : le dossier
  doit contenir un `character.json` lisible dont `universe` existe dans
  `UNIVERS/` — sinon `bad_request` (400 JSON). Ajoute `import universe`.
- `AUTOMATION/tests/test_character_registry.py` (§11) : `lena` et un `probe`
  jetable dans l'**autre** univers se résolvent indépendamment ;
  `character.json` manquant ou univers inconnu → 400 explicite. Utilise un
  `FakeReq` (seul `request.query.get('character', …)` est lu) — pas de
  serveur.
- `AUTOMATION/tests/test_character_param.py` : la fixture `probe` gagne un
  `character.json`.

### Étape 3 — L'interrupteur NSFW dans le registre — `bda7911`

- `CHARACTERS/lena/config.json` : `nsfw.enabled` retiré (les réglages
  `workflow`/`steps`/`cfg`/`face_denoise`/`max_pixels`/`chainer_si` restent).
- `AUTOMATION/nsfw_batch.py` : `is_armed(character_id="lena")` /
  `check_armed(character_id="lena")` lisent `load_character(cid)["nsfw"]`.
  `NsfwRunner.__init__`, `editer`, `run` gagnent `character_id="lena"`
  (défaut, jamais un `if`), enfilé jusqu'à `check_armed`.
- Appelants web : `banque.py` / `etat.py` `/api/nsfw/state` / `production.py`
  (`guard_intensity`, route `/api/decline` dry, `chainage_nsfw`,
  `edition_blocking` ← `demarrer_edition`) passent l'id.
- `production.py` `api_nsfw_arm` : écrit `character.json` (`.bak` d'abord,
  motif de `api_config_save`) au lieu de `config.json`. Rituel « recopier
  ARMER » inchangé, réponse `{ok, armed}` inchangée → **aucun changement
  frontend nécessaire**.
- `test_character_registry.py` [4] : `is_armed` suit `character.json`,
  `probe` désarmé pendant que `lena` reste armé (§11). Vérif serveur réel :
  disarm → re-arm « ARMER » round-trip, `/api/nsfw/state` suit.

### Étape 4 — En-tête piloté par le registre — `f269e7a`

- `AUTOMATION/web/routes/etat.py` : `GET /api/character` →
  `{id, name, universe:{id,label,model_family,output_styles}, content_types,
  nsfw}` ; `GET /api/universe/tools` → `tools.json` de l'univers du
  personnage (exposé maintenant, consommé quand les outils arrivent — §8.7).
- `AUTOMATION/web/static/character.js` `reflectCharacter()` : `fetch
  /api/character`, `.brand` = `Production <nom> <tag univers>`,
  `document.title` = `<nom> — production`. Repli immédiat sur l'id brut,
  ne jette jamais (`fetch` direct, pas `api()`, pour éviter un cycle
  d'import). **Clôt le report F2 de J3.**
- `AUTOMATION/web/static/base.css` : `.brand-uni` (petit tag, tokens seuls).
- `AUTOMATION/tests/test_ecran_creer.js` [1b] : l'en-tête porte « Léna » +
  « Instagram / influenceur », titre d'onglet suit.

## Invariants `CLAUDE.md` vérifiés

- §3–§4 : univers = axe distinct du personnage ; `universe` fixé dans
  `character.json`, non modifiable par une route.
- §7 : registre explicite (id, nom, univers, content_types, indicateur NSFW
  off par défaut, chemin `CHARACTERS/<id>/`) ; une seule base, `character_id`
  en clé — inchangé.
- §8.7 : aucun `if character == "lena"` introduit — seuls des **défauts**
  `"lena"` aux frontières ; le panel d'outils a une source de données
  (`/api/universe/tools`).
- §11 : `test_universe_registry.py` + `test_character_registry.py` auraient
  attrapé un mélange d'univers entre deux personnages ; frontend : `.brand` /
  `#panneBar` intacts (`test_ecran_creer` [1] et [11]).

## Vérification

- Suites Python (embedded) vertes : `test_universe_registry`,
  `test_character_registry`, `test_character_param`, `test_cross_character`,
  `test_build_jobs`, `test_coherence_base`, `test_valider_banque`,
  `test_tri_export`, `test_suppression_edition`, `test_serveur_http`.
- Node-stub verts : `test_panneau_reglages.js`, `test_scenes_aller_retour.js`.
- Fumigations navigateur vertes, **zéro erreur JS** : `test_ecran_creer`
  (dont [1b] en-tête registre et [11] panne serveur), `test_apercu_prompt`,
  `test_pose_scene_card`. Playwright réinstallé hors du repo (scratchpad de
  session + Chromium dans le cache utilisateur).
- `wf_check.py` : `--roles` vert sur `WORKFLOWS/content/lena_master_prod_ui.json`,
  `--groupes "N1…N5"` vert sur `WORKFLOWS/nsfw/lena_nsfw_branch_ui.json` (le
  check correct pour ce graphe — cf. `.githooks/pre-commit` ; `--roles` sur
  la branche NSFW est un faux positif attendu, elle a son propre jeu de
  rôles validé par `nsfw_batch.NsfwRunner`). Aucun fichier `WORKFLOWS/`
  touché par J4.
- Serveur réel (`app.py --no-comfy`) : `/api/character?character=lena|probe`,
  `/api/universe/tools`, `/api/nsfw/arm` round-trip.

## Ce qui reste ouvert

- **Disposition disque par personnage** (repris de J2/J3) : `PROD/<X>/`,
  `journal_batch.csv`, vignettes, export, `/api/gallery`, `/api/journal`,
  `/img` restent sur le personnage unique. L'axe SFW/NSFW `space` (valeur
  SFW aussi nommée `"lena"`, axe **différent** du personnage) inchangé.
  `UNDO` global non scopé.
- **`mcp_server.py`** : toujours `"lena"` en dur (lecture seule). Un MCP
  conscient du registre est V3 (`CLAUDE.md` §10), pas un manque de J4.
- **`config.json` `qc.threshold_high` = 0.74** (provisoire, mesuré) — noté
  depuis J1, à recalibrer avec plus de données, sans urgence.
- En-tête : le tag univers est brut (`Instagram / influenceur`) — un vrai
  travail de branding/densité est pour la session look dédiée (couche
  Univers), comme noté en clôture de J3.

## Prochaine étape attendue

`ROADMAP.md` : **J5 — Style figé + verrou d'identité par univers**
(`AUTOMATION/identity/` avec `pulid_flux.py` et `lora_sdxl.py`, style de
sortie figé à la création). Ne pas démarrer sans feu vert explicite.
