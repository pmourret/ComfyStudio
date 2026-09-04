# ROADMAP — Plateforme multi-personnage

Document vivant, pas figé. Méthode : jalons courts, chaque jalon livrable et
testé seul — pas de big-bang (cf. `CLAUDE.md`, §10).

## V1 — Fondations : généraliser sans perdre l'existant

Objectif : le repo Léna devient la plateforme, avec **deux univers réels** qui
prouvent la généralisation — pas juste Léna renommée.

**J0 — Stabiliser avant de forker** ✅ *(terminé 2026-08-26)*
- Commit du travail en cours (bloquant, déjà identifié)
- Migration base = source de vérité + test de cohérence disque ↔ base
- Résultat : 10 commits thématiques, base migrée (66→86 images, 1→11
  jugements), test de cohérence vérifié contre l'état pré-migration — a
  trouvé un 3ᵉ écart non vu en revue (tri désynchronisé sur 22 fichiers,
  faussait les badges de comptage). 8 suites de tests vertes hors GPU.
- **Question de modèle de données fermée** ✅ *(2026-08-27)* : la clé
  `(image_id, genre)` ne porte pas deux mesures concurrentes — c'était déjà
  résolu dans le code (`runner.ranger_mesures`) par deux `genre`
  distincts (`identite` neutre, seul à décider du bucket ; `identite_apres_
  expression`, jamais lu par le tri), juste pas formalisé. Décision écrite
  dans `DOCS/adr/0009-score-identite-genres-distincts.md`, vérifiée par
  `test_coherence_base.py` (23/23 sur les deux `genre`)
- Opérationnel pour `J1` : `PROD/soulglade.db` est git-ignoré, ne voyage pas
  avec le repo — un fork doit régénérer la base via `migrer_base.py`,
  pas copier le fichier

**J1 — Nouveau repo** ✅ *(terminé 2026-08-26)*
- Fork vers le nouveau repo depuis l'état stabilisé de J0
- Séparation données personnelles (`CHARACTERS/*`, réglages NSFW, assets
  d'identité) / code versionné — prépare le futur passage en public
- Résultat : 6 commits thématiques, 90 fichiers suivis, aucune donnée
  personnelle dans l'historique (vérifié `--all`). Base régénérée via
  `migrer_base.py`, `test_coherence_base.py` vert. Repo Léna intact
  (copie, pas déplacement).
- **Point structurel de J1 traité** ✅ *(2026-08-27)* : chemin ComfyUI en
  configuration explicite (`.env` + `AUTOMATION/env_config.py`, point de
  lecture unique, distinct de `config.json`). 9 emplacements Python
  corrigés + 2 trouvés hors de la liste de départ (`run_web.bat`/
  `run_batch.bat` cassés par la même maladie ; `WORKFLOWS/utils/
  pose_extract_ui.json` avait un préfixe en dur qui faisait vraiment
  échouer l'extraction de pose, pas juste un nom cosmétique). **Vérification
  réelle confirmée** *(2026-08-27)* : `--essai` sur `pose_extract_ui.json`
  accepté par ComfyUI, puis extraction de pose réelle de bout en bout
  (`pose_tools.extraire()`) — fichier retrouvé dans `INPUTS/POSE/` via le
  préfixe `_LENA_POSE/` et la relecture du `subfolder`, move confirmé (pas
  une copie), photo temporaire bien effacée de `ComfyUI/input/`. `DOCS/adr/
  0008-chemin-comfyui-configuration-explicite.md` écrit. 6/6 tests hors
  GPU verts, 1 échec pré-existant confirmé non lié (`test_serveur_http`
  E5, latence, reproduit à l'identique sur le code d'avant fix)
- **Dette de fork nettoyée** ✅ *(2026-08-27)* : 6 commentaires (`base.py`,
  `runner.py`, `expression.py`, `qc_realisme.py`,
  `tests/backfill_embeddings.py`) citaient `DOCS/lena-parcours-creatif.md`
  par numéro de section — un doc de 1665 lignes qui n'existe que dans
  l'ancien repo Léna, jamais porté ici. Références mortes retirées, le
  raisonnement inline de chaque commentaire suffisait déjà ; pas de doc
  historique importé dans ce repo neuf (cohérent avec `CLAUDE.md`, « ne
  répète pas ce qui est déjà bien écrit là-bas »)
- **Passage lena→générique des noms de code** ✅ *(2026-08-27, avant J2
  étape 3)* : fait plus tôt que prévu, à la demande explicite d'une revue
  avant de poursuivre J2. `lena_batch.py` → `runner.py`, `mcp_lena.py` →
  `mcp_server.py`, outils MCP `lena_etat/lena_scenes/lena_plan/lena_mesures`
  → `etat/scenes/plan/mesures`, serveur MCP et base SQLite renommés
  `soulglade` (`.mcp.json`, `PROD/soulglade.db`). Restent nommés
  d'après Léna, volontairement : la valeur `character_id="lena"` elle-même
  (c'est le bon identifiant, pas un nom à généraliser), les fichiers de
  workflow ComfyUI (`WORKFLOWS/*/lena_*.json` — renommage risqué et propre
  à J4/J6 quand la structure univers/personnage sera tranchée), et les
  préfixes de namespace `_LENA_EXPR_`/`_LENA_NSFW_SRC_` (évitent une
  collision, pas des noms de code)
- Embeddings/centroïde non régénérés ici (`backfill_embeddings.py`
  demande le GPU) — à lancer une fois qu'une génération réelle démarre
  dans ce repo
- Audit des skills Léna vs Soulglade fait, puis porté : `workflow-comfyui`
  enrichi (141 lignes + 2 références écrites contre `ui_to_api.py` réel,
  pas contre la doc — a trouvé 3 faits non documentés même côté Léna),
  `comfyui-custom-nodes` et `image-realism-check` créés et vérifiés contre
  l'environnement réel, pas juste copiés
- Mineur, noté pour mémoire : `qc.threshold_high` = 0.74 (mesuré,
  provisoire, config.json) retenu contre 0.78 (doc Léna, non sourcé dans
  ce repo) — lecture seule, sans urgence, à recalibrer avec plus de
  données plutôt qu'à trancher maintenant

**J2 — Découpage + généralisation du cœur**
- Découpage des deux monolithes (`web/app.py`, `runner.py`) avec
  `character_id` introduit dans le même mouvement
- Base unique, schéma commun, colonne `character_id`
- Étape 1 ✅ *(2026-08-27)* : `character_id` dans le schéma (`base.py`),
  testé par `test_cross_character.py`
- Étape 2 ✅ *(2026-08-27)* : `config.json`/`scenes.json`/`creative.json`
  déplacés vers `CHARACTERS/lena/`, chargement paramétré par `character_id`
- Étape 3 ✅ *(2026-08-27)* : `runner.py` découpé en paquet
  `AUTOMATION/runner/{prompt,comfy,sortie,cli}.py` — `execute_jobs` reste
  la colonne vertébrale unique (§8.2), déplacée dans `sortie.py`.
  `character_id` enfilé jusqu'au rangement (`sort_and_export` :
  `PROD/<character_id.upper()>/`, `character_id="lena"` reproduit
  exactement `PROD/LENA/` — aucune donnée déplacée, aucun `if character ==
  "lena"` en dur, §8.7) et jusqu'à la base (`ecrire_en_base`,
  `ranger_mesures`). Export namespacé par personnage
  (`PROD/EXPORT/<character_id>/<catégorie>`, évite qu'un futur second
  personnage mélange ses publications). CLI : `--character` réellement
  fonctionnel (défaut `lena`), nouveau lanceur `AUTOMATION/run_batch.py`
  (un fichier à l'intérieur d'un paquet ne peut pas s'exécuter directement,
  imports relatifs). 2 appels non couverts par les tests automatisés
  trouvés et corrigés à la main (`jobs_declinaison` dans `/api/decline` —
  argument `creative` positionnel décalé silencieusement par le nouveau
  paramètre `character_id`, aurait cassé au premier clic sur "décliner").
  Vérification réelle : batch complet d'une image via ComfyUI, fichier
  atterri dans `PROD/LENA/OK/`, ligne base avec `character_id='lena'`
  confirmée par requête directe. Suite de tests complète verte.
- Étape 4 ✅ *(2026-08-27)* : `web/app.py` (2031 lignes) découpé en
  `web/shared_state.py` (STATE/UNDO/CHECKER, `cfg()`/`scenes_data()`,
  middlewares, `bucket_dir()`, vignettes, sonde ComfyUI — importé par tous
  les modules de routes, jamais dupliqué) et
  `web/routes/{etat,banque,vignettes,production,tri}.py` (31 routes,
  `aiohttp.web.RouteTableDef()` par module, chemins d'URL inchangés).
  `app.py` ne fait plus que l'assemblage (~90 lignes). État partagé
  toujours référencé via l'objet module (`ss.OFM`, `ss.UNDO`, jamais un
  import statique de la valeur) pour que le monkey-patching des tests
  continue de fonctionner. 2 bugs mineurs trouvés et corrigés en cours de
  découpage (`import json` manquant dans `production.py` pour
  `api_nsfw_arm` ; imports `asyncio`/`shutil` redondants en corps de
  fonction, consolidés en tête de module). 3 fichiers de test mis à jour
  vers les nouveaux emplacements (`test_valider_banque.py`,
  `test_tri_export.py`, `test_suppression_edition.py` — monkey-patchent
  `shared_state.OFM`/`THUMBS`/`UNDO`) ; `test_serveur_http.py` inchangé
  (lance `app.py` en sous-processus HTTP, aucun couplage direct). Suite de
  tests complète verte, plus vérification serveur réel : lancement direct,
  `/api/state` répondant en HTTP avec les vrais compteurs de production.
- **J2 terminé.**

**J3 — Frontend** ✅ *(terminé 2026-08-27)*
- Passage en modules ES, plus de globales partagées entre fichiers
- Design system minimal commun
- Sélecteur de personnage (rechargement simple `?character=`)
- Résultat : 4 commits thématiques (`ffcae6d` modules ES + `store.js`
  transitoire, `bb5d79b` encapsulation + bus + `store.js`/`core.js`
  supprimés, `67cae3b` `app.css` → `tokens/base/components/screens.css` +
  `DESIGN.md`, `4f5de9a` `?character=` bout en bout). 20 modules ES, aucune
  globale partagée ; découpage CSS contigu (cascade identique, vérifiée par
  reconstruction) ; `?character=` validé contre `CHARACTERS/<id>/` avant tout
  accès disque, `test_character_param.py` prouve l'isolation lecture+écriture.
  Playwright installé hors du repo pour les 4 fumigations navigateur (zéro
  erreur JS à chaque étape). Détail : `DOCS/handoffs/2026-08-27-j3-frontend.md`.
- Hors périmètre, assumé pour J4 : disposition disque par personnage
  (`PROD/<X>/`, journal, vignettes, export, `/img`), axe SFW/NSFW `space`,
  `UNDO` non scopé, branding de l'en-tête. → **levé le 2026-08-29**, voir
  « Isolation disque par personnage » plus bas.

**J4 — Registre univers + registre personnage** ✅ *(terminé 2026-08-27)*
- Registre univers : id, famille de modèle / mécanisme d'identité, panel
  d'outils
- Univers `instagram-influenceur` (Flux + PuLID) ← Léna, portée telle quelle
- Univers `rpg-personnage` (SDXL/Pony + LoRA/IPAdapter) ← entrée de registre
  seule en J4 (prouve que le registre généralise — famille de modèle
  distincte) ; l'implémentation d'identité est J5, l'onboarding d'Abyssiaelle
  est J6
- Registre personnage : univers associé, type(s) de contenu actifs
  (registre de création), NSFW on/off (off par défaut)
- Le registre de création liste les types de contenu (image, vidéo, voix,
  mise en scène à plusieurs) comme des types **communs à tout univers** —
  pas propres à un univers en particulier. En V1, seul `image` est actif ;
  `vidéo` et `voix` existent comme types déclarés mais inactifs, pour les
  deux univers (influenceur et RPG-personnage), afin de ne pas avoir à
  retoucher ce registre quand ils s'activeront en V2
- Résultat : 5 commits thématiques. `UNIVERS/<id>/{universe,tools}.json`
  versionnés + `AUTOMATION/universe.py` (scan) ; `CHARACTERS/<id>/
  character.json` git-ignoré + `runner/prompt.py` (`load_character`,
  `character_universe`, `content_type_active`) ; `shared_state.character()`
  refuse en 400 un personnage sans registre ou pointant vers un univers
  inconnu. Interrupteur NSFW déplacé de `config.json` vers `character.json`
  (`is_armed(character_id)`, enfilé dans `NsfwRunner`/`editer`/`run`).
  `/api/character` + `/api/universe/tools` ; en-tête = nom lisible + tag
  univers (clôt J3 F2). ADR-0010. `test_universe_registry.py` +
  `test_character_registry.py` (§11 : isolation univers prouvée). Suites
  Python (10) et JS (5) vertes. Détail : `DOCS/handoffs/2026-08-27-j4-
  registres.md`.
- Hors périmètre, assumé pour J5/J6 : `AUTOMATION/identity/` (câblage des
  chaînes `model_family`/`identity`/`posing` à du code), onboarding
  d'Abyssiaelle (`CHARACTERS/abyssiaelle/`, `build_jobs`, test byte-exact),
  panel d'outils rendu à l'écran (aucun outil dédié à peupler), MCP
  conscient du registre (`mcp_server.py` reste `"lena"` en dur — V3).

**J5 — Style figé + verrou d'identité par univers** ✅ *(terminé 2026-08-28)*
- Style de sortie choisi et figé à la création du personnage, non
  modifiable ensuite (confirmé)
- `AUTOMATION/identity/` avec deux implémentations : `pulid_flux.py`,
  `lora_sdxl.py`
- Résultat : 3 commits thématiques (+ réparation disque de `config.json`).
  `AUTOMATION/identity/` = interface choisie par l'univers
  (`get`/`for_universe`, contrat `REQUIRED_ROLES` + `apply(api, roles,
  character_config, job)`). `pulid_flux.py` réel : les poids PuLID de Léna
  sortent du widget du workflow vers `config.json` / `identity` (§8.4),
  injectés par `WorkflowRunner.api_for` — vérifié graphe-identique + **une
  génération réelle, identité 0.808, verdict OK**. `lora_sdxl.py` : stub
  `NotImplementedError` → J6. Style : `character.json` / `output_style` figé,
  validé contre `universe.output_styles` (liste → map style→effet), appliqué
  dans `api_for` (inerte pour `realiste`). `qc_identity.py` (mesure) reste
  commun. ADR-0011. Skills `nouvel-univers`/`nouveau-personnage` alignés sur
  la signature réelle. Détail : `DOCS/handoffs/2026-08-28-j5-identite-style.md`.
- Hors périmètre, assumé pour J6/J7 : `lora_sdxl.py` réel + workflow SDXL de
  production (J6) ; branche NSFW dont l'`ApplyPulidFlux` reste baké, tuning
  différent (J7, asymétrie assumée ADR-0011) ; `prompt_add`/`checkpoint` des
  styles non-`realiste` de `rpg-personnage` = placeholders à mesurer à
  l'onboarding.

**J6 — Premier personnage RPG (Abyssiaelle) opérationnel** ✅ *(terminé 2026-08-28)*
- `build_jobs` + assembleur de prompt, verrouillé par un test byte-exact
  (comme Léna)
- Banque de scènes comme outil de son univers, création manuelle par
  l'utilisateur (pas de génération LLM déclarative — confirmé)
- Étapes 1-5 (scaffolding registre, `lora_sdxl.py` réel, workflow SDXL de
  production, câblage style/runner, base gelée réelle `ABY_MAIN_REF.jpg`) :
  voir commits `4149df6`..`a25bfae`.
- **Étape 6 (mesure) — constat qui renverse le plan de J5** : le mécanisme
  d'identité choisi pour l'univers (IPAdapter FaceID) ne verrouille PAS
  l'identité d'Abyssiaelle, il la DÉGRADE. Sweep réel (weight/weight_faceidv2
  0.3→2.0, même seed/prompt/LoRA, generations ComfyUI reelles) : le score
  InsightFace baisse quand le poids IPAdapter monte (0.40 à w=0.7 → 0.24 à
  w=2.0) ; IPAdapter seul sans LoRA (w=1.5) s'effondre à 0.09, pire que deux
  visages différents. C'est le LoRA de personnage déjà présent dans le graphe
  mais bypassé (`abyss1a_v1.safetensors`, entraîné hors plateforme via
  kohya_ss le 20/07/2026 sur 53 images, mot déclencheur `abyss1a`) qui porte
  réellement l'identité : LoRA seul (poids IPAdapter à 0.0) bat toute
  combinaison avec IPAdapter actif (0.51-0.63 sur 6 seeds, cadre neutre).
  Réglage retenu : poids IPAdapter neutralisé à 0.0 (le rôle reste actif dans
  le graphe, l'univers n'est pas remis en cause), LoRA à pleine force.
  Documenté en détail dans `CHARACTERS/abyssiaelle/config.json` (git-ignoré)
  et `AUTOMATION/identity/lora_sdxl.py`. Conséquence pour la suite : ce n'est
  pas une règle d'univers, c'est une mesure PAR personnage — un futur
  personnage rpg-personnage peut très bien mesurer un poids IPAdapter non nul.
  **Bug réel trouvé et corrigé en même temps** : le nœud LoRA restait bypassé
  au moment de `ui_to_api.convert()` (même mécanisme que la pose, jamais
  câblé pour le LoRA de personnage) — `identity.apply()` aurait levé un
  `KeyError` brut au lieu du `RuntimeError` explicite qu'il croit pouvoir
  lever sur un rôle absent. Corrigé dans `WorkflowRunner.api_for()`
  (`AUTOMATION/runner/comfy.py`), test de non-régression dans
  `test_model_family_sdxl.py` (section [4]). `qc.threshold_ok/watch/high`
  mesurés sur ~20 générations réelles (pas de journal de production encore) :
  0.50/0.35/0.60, explicitement provisoires (même statut que le
  `threshold_high` de Léna). Deuxième bug réel trouvé au premier batch bout
  en bout : `runner/cli.py` et `sortie.py` accédaient `cfg["preset"]["refiner"]`
  et `cfg["export"]["enabled"]` en dur — cassait tout personnage dont le
  graphe n'a pas encore ces étages optionnels. `cli.py` corrigé (`.get()`) ;
  `config.json` d'Abyssiaelle a reçu sa propre clé `export` (comme Léna).
- **Étape 7 (build_jobs + banque)** : `scenes.json`/`creative.json` réels et
  minimaux pour Abyssiaelle (2 scènes RPG, 2 intentions, 2 tons — pas une
  banque exhaustive, elle grandit à la main depuis le Dashboard). Verrouillé
  par `test_build_jobs_abyssiaelle.py` (oracle indépendant de l'assemblage
  réel, garde-fou visage, absence du mot déclencheur dans le prompt
  assemblé — il est injecté par `identity.apply()`, pas par `build_jobs`).
  **Vérification réelle bout en bout** : `run_batch.py --character
  abyssiaelle --scene portrait_etude` → image produite, verdict OK, identité
  0.663, rangée dans `PROD/ABYSSIAELLE/OK/`, export dans
  `PROD/EXPORT/abyssiaelle/portrait/`, ligne base confirmée par requête
  directe (`character_id='abyssiaelle'`, scores identité/réalisme
  enregistrés). Suite de tests (hors GPU + ceux nécessitant ComfyUI) vérifiée
  verte après ces changements, y compris non-régression Léna
  (`test_identity_pulid_flux.py`, `test_style_fige.py`, `test_serveur_http.py`).
- **J6 terminé.**

**J7bis — Modèle à quatre axes + shell studio + wizard** ✅ *(terminé 2026-08-29)*
- Table de résolution `UNIVERS/resolution.json` + `universe.resolve()` ;
  champ `types` dans `universe.json` (ADR-0012)
- Registre `WORLDS/` versionné ; `type` / `world` dans `character.json`,
  renseignés pour Léna et Abyssiaelle via script de migration
- Chrome honnête : `character_id` réel, type + monde, sonde Comfy, file,
  dernière erreur actionnable
- Sas d'entrée : l'app s'ouvre sur le registre, pas sur la production d'un
  personnage par défaut
- Wizard « nouveau personnage » : type → style → monde → base fournie ou
  générée → gel → écriture de la fiche. V1 honnête : seuils par défaut du
  pack, recalibrage plus tard dans Réglages
  - *(2026-08-30)* L'ancienne route `POST /api/config` a été **supprimée** :
    sans appelant depuis l'import initial, elle n'acceptait que `preset` et
    `qc`, jamais `identity` ni le retrait du marqueur `measured: false` — soit
    exactement ce que ce recalibrage doit écrire. Réglages demandera donc une
    **nouvelle route conçue pour ce besoin**, pas la réactivation de
    l'ancienne.
- `CLAUDE.md` §3–§4 mis en cohérence ; `wf_check.py` privé de son repli
  `CHARACTERS/lena/`
- Skills à réaligner en fin de jalon, quand le code aura figé le
  vocabulaire : `nouveau-personnage`, `nouvel-univers`, `workflow-comfyui`
- Hors périmètre : renommage `UNIVERS/`→`PACKS/`, mode Éditeur, look et
  peaux de monde, câblage des assets de monde dans le runner, mesure du
  verrou dans le wizard
- **Résultat** : 12 commits.
  - Ét. 1 (`eefe0aa`) : `resolve(type, style) -> pack`, `UnresolvedPackError`,
    jamais de repli silencieux ; `types` + `universe.types()`.
  - Ét. 2 (`92fa71b`) : `AUTOMATION/worlds.py` (miroir de `universe.py`) +
    `WORLDS/slow-life.json`, `WORLDS/terres-sauvages.json` (assets placeholder
    = dette déclarée) ; étanchéité par famille testée (§11).
  - Ét. 3 (`246fa8c`) : `character_type()` / `character_world()` ;
    `character()` valide `resolve(type,style) == universe` + `world`
    compatible ; migration idempotente (Léna→`slow-life`,
    Abyssiaelle→`terres-sauvages`) ; `wf_check.py` sans repli `lena` (nouveau
    `--character`).
  - Ét. 4 (`8decf5a`) : audit `audit-ux-ui` → 5 findings traités. `#registre`
    + `/api/characters` ; l'app s'ouvre dessus sans `?character=`. `/api/state`
    gagne `last_error` ; le chrome montre id + type + monde + file + dernière
    erreur sur tous les écrans.
  - `dde3eb5` (hors J7bis, réparé en passant) : `app.py` `reclaim_port()` —
    un tableau de bord fantôme sur le port est arrêté au démarrage ; jamais
    ComfyUI ni un process tiers.
  - Ét. 5 (`2780292`, `3b5d015`, `23384b4`, `3a39665`, `12f6740`) : wizard.
    `create_character()` (rollback si échec) + `universe.json/workflow` +
    `character_defaults.json` ; base **fournie** (upload → `input/`) ou
    **générée** (`base_portrait=True` bypasse le verrou → candidats → gel) ;
    `/api/wizard/options` + `POST /api/characters` ; écran `#wizard`.
    Vérifié bout-en-bout contre ComfyUI réel (portrait Flux + flux complet
    SDXL). Chemin de production `api_for` inchangé (tests `identity`/`style`
    verts).
  - Ét. 6 (`2fa1718`, `a262a44`) : `CLAUDE.md` §3–§4 alignés ; skills
    `nouveau-personnage` / `nouvel-univers` / `workflow-comfyui` réécrits
    (pack, type, monde, « attacher au pack »).
- Non fait, à la main : fumigation navigateur du wizard (Playwright hors
  machine, comme J3/J4).
- **J7bis terminé.**

**Isolation disque par personnage** ✅ *(terminé 2026-08-29, post-J7bis)*
- Lève ce que J3 avait explicitement laissé hors périmètre (« disposition
  disque par personnage : `PROD/<X>/`, journal, vignettes, export, `/img`,
  axe SFW/NSFW `space`, `UNDO` non scopé »). Ce n'était pas cosmétique :
  le runner rangeait déjà Abyssiaelle dans `PROD/ABYSSIAELLE/` depuis J6,
  mais **aucune route web ne savait la lire** — sa Revue montrait Léna.
- `bucket_dir(bucket, space, character_id)` : trois arguments obligatoires,
  plus aucun défaut vers `PROD/LENA/`. `/img` exige `character=` (400
  sinon) et rend 404 hors de l'arbre demandé. Journal : colonne
  `character`. Vignettes : `.thumbs/<cid>/<space>/<bucket>/`. NSFW :
  `PROD/<CID>/_NSFW/`. Export : une seule disposition,
  `PROD/EXPORT/<cid>/<catégorie>/`.
- L'axe SFW s'appelle `sfw` (l'ancienne valeur `lena` — un nom de
  personnage pour un axe qui n'en est pas un — reste acceptée en alias) ;
  la colonne `image.espace` garde son vocabulaire, conversion isolée dans
  `espace_db()`.
- Migration `AUTOMATION/tests/migrer_prod_par_personnage.py`, idempotente,
  oracle = la base pour attribuer les lignes de journal. 21/21 tests Python
  + 7/7 fumigations verts ; `test_isolation_disque.py` neuf.
  Détail : `DOCS/handoffs/2026-08-29-isolation-look.md`.

**J7 — NSFW généralisé comme outil, pas comme branche** ✅ *(terminé 2026-08-29)*
- Flux confirmé et inchangé : génération → sélection manuelle de l'image
  → reprise en NSFW → édition par IA → retouche. Recomposé à partir des deux
  outils globaux déjà prévus, aucun sous-système séparé (ADR-0003)
- Ce que J7 a réellement fait : rendre ce flux **indépendant du personnage**
  et **fermé par défaut**. Il marchait déjà, mais seulement pour Léna
- **Le graphe d'édition appartient au pack** : `universe.json` gagne
  `edit_workflow` (nullable). Plus aucun chemin de graphe en dur dans le
  runner, ni dans le `config.json` d'un personnage (CLAUDE.md §8.11).
  Un pack sans graphe lève, il n'emprunte jamais celui d'une autre famille
- **Le cran est ABSENT sans l'outil, pas grisé** : `/api/creative` n'émet
  pas un palier `requires: armed` indisponible. Disponible = armé **ET**
  pack qui déclare un graphe, jamais une seule des deux conditions.
  `guard_intensity` reste le verrou serveur
- **Un seul geste** : section « Contenu adulte — *nom* » sur l'écran
  Application, activation et désactivation. Pas d'interrupteur global —
  l'interrupteur est celui d'un personnage (ADR-0010), `false` à la création
  (`create_character`). Les trois portes du flux de production sont retirées
- `character_id` obligatoire partout sur le chemin d'édition ; préfixe
  ComfyUI et dossier de transit namespacés par cid
- Deux défauts trouvés en chemin et corrigés : la branche d'édition
  n'écrivait **jamais en base** (seules les migrations le faisaient, alors
  que la base est la source de vérité, §7) ; la destination *affichée* d'un
  palier pouvait nommer le dossier d'un autre personnage
- 22/22 tests Python + 8/8 fumigations. Neufs : `test_nsfw_isolation.py`,
  `test_isolation_disque.py` §8, `test_contenu_adulte.js`
- Détail : `DOCS/handoffs/2026-08-29-j7-nsfw-outil.md`

**Reste après J7** — n'a pas bloqué le jalon :
- **Graphe d'édition SDXL pour `rpg-personnage`** (reporté). Seule chose qui
  manque pour qu'Abyssiaelle ait l'outil : son étage « identité restaurée »
  est PuLID Flux + FaceDetailer, sans équivalent SDXL/LoRA. Graphe neuf +
  `wf_check` + mesure par personnage. La déclaration l'attend déjà
  (`edit_workflow: null`)
- Un lot NSFW réel de bout en bout piloté par une session (les fumigations
  tournent en `--no-comfy` : UI et routes vérifiées, graphe non relancé)
- `"flux+edit"` en dur en 17 endroits pour dire « ce palier édite » — sans
  effet tant que le seul pack qui édite est flux

**J8.1 — ADR des quatre couches + alignement du vocabulaire** ✅ *(terminé
2026-09-03)*
- Deux sessions de cadrage avaient fixé un modèle de responsabilité
  **runtime** à quatre couches (plateforme, pack, monde, personnage),
  distinct des quatre **axes de création** d'ADR-0012 (qui décrit comment un
  personnage se résout à un pack à la naissance, pas qui a le droit de
  porter un graphe à l'exécution). Aucun comportement changé — vocabulaire
  et renommage seulement, avant que la suite du chantier ne s'appuie dessus
- `DOCS/adr/0017-quatre-couches-plateforme-pack-monde-personnage.md` : la
  règle qui décide entre les couches — plateforme et pack peuvent porter un
  graphe, monde et personnage jamais. Nomme une distinction déjà vraie dans
  le code (ADR-0013 : `edit_workflow` est un graphe de pack ; ADR-0015/0016 :
  un monde n'a « aucun graphe ») mais jusque-là non formalisée comme un seul
  modèle — `architecture.md` §5 et `nouvel-outil` (patron 1) mélangeaient
  encore « outil global » et « outil de pack » dans la même phrase
- Renommage mécanique `UNIVERS/` → `PACKS/` : le dossier (6 fichiers, `git
  mv`) et toute référence à son chemin littéral dans le code vivant
  (`AUTOMATION/universe.py` : constante `UNIVERS_DIR` → `PACKS_DIR` + tous
  ses usages, `worlds.py`, `shared_state.py`, `identity/__init__.py`,
  `ToolRail.tsx`, `DESIGN.md`, `README.md`, `AUDIT.md`, les trois `_notes`
  internes des fichiers de `PACKS/*.json`). Rien d'autre ne bouge :
  `AUTOMATION/universe.py`, `universe.json`, la clé `character.json.universe`
  et les routes `/api/universe/*` restent tels quels — ADR-0012 avait déjà
  tranché de garder ce vocabulaire-là
- `CLAUDE.md` : Architecture pointe désormais les quatre couches +
  ADR-0017 ; invariant 7 réécrit pour les couvrir toutes les quatre (avant :
  seulement le registre de pack), avec la règle du graphe explicite.
  `DOCS/architecture.md` §5 nomme les couches à la place de « outil global »
  / « outil propre à un univers »
- Skills réalignés : `nouvel-univers` renommé `nouvel-pack` (dossier +
  frontmatter) ; `nouvel-outil` (patron 1) décide désormais explicitement
  entre couche plateforme et couche pack avant `scope` (`global`/`universe`,
  question orthogonale, inchangée) ; `workflow-comfyui` cite ADR-0017 comme
  critère de légitimité d'un graphe ; `nouveau-personnage` et les chemins
  `PACKS/` mis à jour partout. Référence
  `workflow-comfyui/references/modeles-par-univers.md` renommée
  `modeles-par-pack.md`, reformulée pack au lieu d'univers, toutes ses
  références croisées mises à jour (y compris `comfyui-custom-nodes` et
  `protocole-identite.md`, non listés au départ mais qui pointaient ce
  fichier)
- Aucun ADR accepté ni entrée datée de ce fichier n'a été réécrit — ils
  continuent de dire `UNIVERS/`, exact au moment où ils ont été écrits.
  `DOCS/handoffs/`/`DOCS/cadrage/` non touchés
- Vérifié : `test_universe_resolution.py`, `test_universe_registry.py`,
  `test_character_registry.py`, `test_worlds_registry.py`,
  `test_world_creation_isolation.py`, `test_character_create.py` — verts
  avant ET après, aucun changé sur le fond (seuls les chemins renommés et
  `universe.UNIVERS_DIR` → `universe.PACKS_DIR`)

**J8.2 — Carte de capacités** ✅ *(terminé 2026-09-03)*
- `universe.json` gagne `capabilities` (dict id -> `{graph, roles}`),
  remplace les deux champs nommés en dur `workflow`/`edit_workflow`
  (ADR-0018). Une capacité absente est une **clé absente**, jamais une
  valeur `null` — même principe qu'`edit_workflow: null` (ADR-0013), rendu
  générique : `rpg-personnage` n'a aucune clé `edit` dans sa carte.
  `roles` volontairement dissymétrique : réel pour `edit` (copié de
  `NsfwRunner.roles`, seule donnée qui n'existait nulle part ailleurs sous
  forme structurée) ; `[]` pour `produce` (déjà porté par `REQUIRED_ROLES`
  de l'implémentation d'identité du pack — le dupliquer aurait créé une 2ᵉ
  source de vérité). Ni l'un ni l'autre n'est câblé dans la résolution
  réelle des nœuds — déclaratif, pas un branchement, pour ne pas risquer la
  garantie « chemin de production byte-identique » de ce chantier
- **Écart constaté par rapport à l'énoncé du chantier** : seulement **10**
  comparaisons `"flux+edit"` trouvées en code exécutable (9 Python + 1
  TypeScript), pas 17. Explication trouvée dans le handoff du 29/08 :
  les 17 dataient du frontend JS vanille d'avant la migration React
  (30/08/2026), qui avait déjà centralisé le côté frontend dans un seul
  point (`isEditTier`, `useProduceState.ts`). Ce même handoff annonçait déjà
  l'intention (« le helper existe déjà des deux côtés, il reste à
  généraliser les comparaisons ») — ce chantier la termine, avec un
  vocabulaire capacité-générique (`"produce"`/`"edit"`) plutôt que le
  `sdxl+edit` encore préfixé par famille qu'il envisageait
- `services/creative.py` gagne `is_edit_tier(tier)` — l'unique endroit qui
  compare désormais `pipeline` à la capacité `edit` ; `edit_tier()` et les 4
  comparaisons inline restantes du même fichier, plus celles de
  `services/batch.py` (`nsfw_chaining_hook`), `routers/bank.py` (`/api/creative`),
  `routers/production.py` (`/api/decline`) et `routers/state.py`
  (`seconds_per_image`), l'utilisent toutes — 9 comparaisons Python
  consolidées en une. Le pendant frontend, déjà unique (`isEditTier`), garde
  sa forme, seul son littéral change (`'flux+edit'` → `'edit'`)
- Migration des données : `pipeline` renommé `"flux"`/`"sdxl"` → `"produce"`,
  `"flux+edit"` → `"edit"` dans les deux `character_defaults.json`
  (versionnés) et, via un script neuf idempotent
  (`migrate_pipeline_capability_ids.py`, gabarit de
  `migrate_character_type_world.py`) sur les deux `CHARACTERS/*/creative.json`
  réels de ce poste (hors dépôt, ADR-0005) — règle générique par suffixe
  `+edit`, sans nom de famille en dur dans le script lui-même
- Le panel du studio dérivait déjà de la carte pour l'essentiel
  (`AdultContentSection.tsx` lit `tool.has_graph` depuis `/api/nsfw/state`,
  aucun `pack ===` en dur trouvé dans tout `web/ui/src`) — seule
  l'implémentation interne d'`edit_tool_state()` change de source
- Nouveau `test_pack_capabilities.py` : les deux packs réels, régression
  byte-identique des deux chemins de production (comparés à des chaînes
  écrites en dur dans le test, pas seulement à la fonction), `require_capability`
  sur capacité absente et sur pack inconnu, `is_edit_tier`/`edit_tier`.
  `test_character_create.py` et `test_nsfw_isolation.py` adaptés à la
  nouvelle API sans changer une seule assertion de comportement
- Aucun ADR accepté n'est réédité (0013 continue de dire `edit_workflow` —
  exact pour son époque ; ADR-0018 le complète, ne le supersède pas).
  `DOCS/ROADMAP-finition-studio.md`/`CHECKLIST-finition-studio.md` portent un
  F5.5 qui ressemble à cette tâche mais vit dans une session GPU différente
  (mains/inpaint/edit SDXL, hors périmètre) — non touchés, signalés pour la
  personne qui tient ce second document

**J8.3 — Héritage des catalogues du monde vers le personnage** ✅ *(terminé
2026-09-03)*
- Chantier signalé comme le plus sensible de la série (données réelles hors
  dépôt) : snapshot avant toute écriture, script idempotent avec `--dry-run`
  et `--restore`, preuve sur le prompt assemblé plutôt que sur les octets du
  fichier
- **Scènes → lieux** : le mécanisme existait déjà (ADR-0014/0015,
  31/08/2026, jamais exercé sur les vraies données) — `worlds.merge_scene()`
  et `SCENE_OVERLAY_KEYS` inchangés. Les 16 scènes de Léna et les 2
  d'Abyssiaelle deviennent des lieux dans `WORLDS/slow-life.json` /
  `WORLDS/terres-sauvages.json` ; leurs entrées dans `scenes.json` gagnent
  `world_ref`/`origin: "world"`, cadre toujours matérialisé sur le disque
  (ADR-0015 §4 : `build_jobs` ne fusionne jamais lui-même — zéro ligne
  changée dans `build_jobs`). Deux placeholders génériques posés à J7bis
  sont retirés au profit du contenu réel qui les recouvre (`cafe_terrasse`,
  même id ; `feu_de_camp` → `camp_soir`, même thème, id différent — les deux
  autres placeholders sans recouvrement restent)
- **Intentions/tons → nouveau, symétrique en esprit** : rien de tel
  n'existait côté monde. `WORLDS/<id>.json` gagne `intentions`/`tones`
  (même forme que `creative.json`). Résolution par `key`, personnage
  prioritaire : `worlds.merge_creative_vocab()`/`_merge_by_key()` —
  remplacement ENTIER d'une clé connue (jamais un champ à champ, même
  logique que `config.json` sur `character_defaults.json`), ajout d'une clé
  neuve, héritage silencieux de ce que le personnage ne mentionne pas.
  Câblé dans `AUTOMATION/runner/prompt.py::load_creative()` — le seul point
  du chemin `intentions`/`tons` que `build_jobs` traverse avant l'assemblage
  (contrairement aux scènes, `intention.prompt_add`/`tone.prompt_add` sont
  résolus au lancement, sans étape de matérialisation équivalente) ; tous
  les autres appelants (`services/creative.py`, `routers/bank.py`,
  `routers/state.py`) en héritent sans être eux-mêmes modifiés
- `DOCS/adr/0019-heritage-monde-personnage.md` : la règle, pourquoi
  `load_creative()` est le seul endroit touché, la réserve sur
  `tones[].expression` (mesuré contre le budget d'identité de Léna
  spécifiquement, indistinguable d'un vocabulaire de monde tant qu'un seul
  personnage vit dans slow-life — migré tel quel, surchargeable plus tard)
- **Bug réel trouvé en auditant les consommateurs, pas en relisant** :
  `services/expression.py::save_tone_expression()` (l'éditeur de plage
  d'expression d'un ton) lisait déjà via `load_creative()` (donc la vue
  fusionnée) mais réécrivait CE DICT ENTIER dans le fichier du personnage —
  un seul appel aurait recopié les 5 tons du monde dans `creative.json` de
  Léna, annulant la migration au premier usage. Corrigé : le ton touché
  devient une surcharge complète (tous ses champs, `expression` remplacé)
  écrite SEULE dans le fichier du personnage ; les tons non touchés restent
  purement hérités. `test_expression_isolation.py` lisait aussi
  `tones[0]` en dur sur le fichier brut (devenu vide) — corrigé pour lire la
  vue fusionnée, seule source fiable d'un ton valide qu'il soit hérité ou non
- Script `AUTOMATION/tests/migrate_world_catalogs.py` (gabarit de
  `migrate_scenes_world.py`, seul des trois scripts de migration à avoir
  déjà résolu ce problème) : calcule les jobs `build_jobs()` avant/après
  (balayage niveau × intention × ton, 912 jobs pour Léna, 24 pour
  Abyssiaelle) sur l'état réel puis reconstruit en mémoire, ABANDON sans
  écrire au moindre écart. `.avant-j83.bak` par fichier personnage touché
  avant toute écriture réelle, `--restore` pour revenir en arrière
- Nouveau `test_world_catalogs_inheritance.py` : `_merge_by_key` isolé,
  `load_creative()` de bout en bout (héritage, surcharge totale, ajout,
  personnage sans monde), et la contrainte « un monde reste lisible sans
  personnage » (`worlds.intentions/tones/places` ne prennent jamais de
  `character_id`)
- Vérifié : preuve interne du script (0 écart sur le balayage) puis,
  independamment, `test_build_jobs.py` et `test_build_jobs_abyssiaelle.py`
  rejoués sur le vrai disque migré sans une assertion changée — c'est ce
  deuxième filet qui exerce le vrai chemin de code, pas une reconstruction
  en mémoire. Suite complète (15 tests touchés par J8.1-J8.3) verte

**J8.4 — Couche plateforme, premier habitant l'upscale** ✅ *(terminé
2026-09-03, validé contre ComfyUI réel)*
- Symptôme concret trouvé en explorant, pas supposé : l'upscale existe déjà
  mais enterré dans le graphe de Léna seul (`runner/comfy.py` bascule un
  groupe de `lena_master_prod_ui.json` selon `preset.upscale_2k`).
  `abyssiaelle_master_prod_ui.json` n'a que 2 groupes (identité + LoRA),
  aucun groupe d'upscale — si son `config.json` portait `upscale_2k: true`,
  ça ne ferait **rien, silencieusement** (`nodes_in_group()` rend `[]` sur
  un titre introuvable, aucune erreur). Exactement le trou que ce chantier
  ferme.
- `PLATFORM/capabilities.json` (nouveau, registre **singleton** — une seule
  plateforme, pas un dossier par id comme `PACKS/`) + `AUTOMATION/
  platform_capabilities.py`, jumeau exact des accesseurs de capacité de
  `universe.py` (J8.2) moins le paramètre `uid`. Même forme `{graph, roles}`
  qu'ADR-0018, aucune modification du schéma
- `universe.resolve()` inchangé, dans les deux sens : une capacité de
  plateforme n'y entre jamais et n'en dépend jamais — toujours disponible,
  jamais conditionnée au pack ni au personnage (ADR-0020 §2)
- `WORKFLOWS/platform/upscale_ui.json` (nouveau) : les 3 nœuds réels du
  groupe « 09 - UPSCALE IMAGE 2K » de Léna (`UpscaleModelLoader` →
  `4x_NMKD-Siax_200k.pth`, `ImageUpscaleWithModel`, `ImageScale` — mesurés
  24/08, netteté +31 %, identité -0,004), extraits plutôt que réinventés.
  Bug de généricité corrigé au passage : la cible `ImageScale` était figée
  à `1440×1800` (le format 4:5 de Léna en dur) ; le graphe autonome la
  pilote par job depuis la taille réelle de l'image reçue
- `AUTOMATION/runner/upscale.py::UpscaleRunner` + `run_upscale_batch()` :
  passe par `execute_jobs` (son paramètre `runner=` déjà injectable),
  **jamais une boucle à part** — contrairement au précédent NSFW
  (`nsfw_batch.run()`, sa propre boucle). `UpscaleRunner` n'importe ni
  `universe` ni `identity` : preuve dans le code, pas seulement affirmée,
  que la contrainte « ne consulte jamais le pack » est tenue
- `test_platform_capabilities.py` (nouveau) : registre, taille cible
  calculée sur des images réelles de Léna ET d'Abyssiaelle (jamais un
  format figé), absence d'import `universe`/`identity` vérifiée par grep
- **Validation réelle, ComfyUI démarré en cours de session** :
  `wf_check.py WORKFLOWS/platform/upscale_ui.json --essai` refusé une
  première fois (`LoadImage` pointait le nom placeholder du fichier
  versionné, qui n'existe pas sur le disque — attendu, ce placeholder est
  écrasé par `UpscaleRunner.api_for()` à l'exécution réelle, jamais lu tel
  quel) ; accepté par ComfyUI une fois un vrai fichier substitué le temps du
  test, confirmant que le seul point en cause était ce placeholder, pas le
  câblage. Round-trip complet ensuite, sous `python_embeded` (`cv2`/
  InsightFace absents du venv de dev, même limite connue que les autres
  tests QC) : upscale réel sur une photo de Léna (pack flux, 1080×1350 →
  2048×2560, verdict A_REVOIR) PUIS d'Abyssiaelle (pack sdxl, 1024×1024 →
  2048×2048, verdict OK) — **même code, aucune branche, deux verdicts QC
  différents parce que les seuils sont par personnage**, pas parce que le
  chemin diffère. Journal écrit pour les deux, fichiers rangés dans le bon
  dossier de tri, transit balayé, aucun export parasite (désactivé par
  `_capability_cfg`). Suite existante rejouée verte après coup
- Hors périmètre, assumé : pas d'écran studio (mécanisme + point d'entrée
  programmatique seulement) ; grain/recadrage/correction colorimétrique/
  watermark restent des candidats non construits, « premier habitant »
  voulait dire un seul ; aucun résolveur unifié pack+plateforme (pas de
  second appelant pour le justifier)

**J8.5 — Banc de comparaison de variantes, deuxième capacité de plateforme**
✅ *(terminé 2026-09-03, validé contre ComfyUI réel)*
- Formalise ce qui se faisait à la main (le sweep IPAdapter d'Abyssiaelle en
  J6, qui a renversé l'hypothèse « IPAdapter verrouille l'identité »).
  Différence de nature avec l'upscale (J8.4) : le banc compare des réglages
  de GÉNÉRATION (poids d'identité, steps, guidance, sampler, scheduler,
  étage optionnel) — il ne porte donc **aucun graphe à lui** (invariant 10),
  il orchestre le graphe de production que le pack fournit déjà
  (`WorkflowRunner`, déjà pack-aware, inchangée dans son rôle)
- **Le changement le plus sensible du chantier** : `execute_jobs` gagne un
  paramètre `sink=None` (`AUTOMATION/runner/sortie.py::Sink`). `None` =
  comportement strictement inchangé pour tout appelant existant — vérifié
  par toute la suite dépendante rejouée sans une assertion changée + un
  test d'isolation dédié (`test_execute_jobs_sink.py`). Fourni, `sink`
  redirige TROIS choses à la fois (pas seulement le rangement) :
  `sort_and_export` range hors de `PROD/<CID>/<verdict>/` et n'exporte
  jamais ; `sink.record()` remplace `ranger_mesures()` (jamais les deux) ;
  le journal CSV/`ecrire_en_base` partagés sont sautés entièrement — les
  trois surfaces qui auraient pollué la Revue/l'export/les tables de
  production sinon
- `AUTOMATION/base.py` gagne 3 tables dédiées (`bench_run`/
  `bench_variant`/`bench_score`), **jamais une réutilisation taguée** de
  `image`/`score`/`batch` — `test_coherence_base.py` et
  `reference_set`/`reference_member` n'ont donc rien à apprendre du banc.
  Disque : `PROD/<CID>/_BENCH/<bench_id>/<variante>/<verdict>/`, invisible
  par construction pour Revue/Galerie (elles ne font jamais un `iterdir()`
  de `PROD/<CID>/`, toujours un chemin depuis un bucket connu — même
  garantie que `_NSFW/` déjà)
- `AUTOMATION/bench.py` (nouveau) : liste blanche d'axes (`CFG_AXES` dans
  `cfg`, `JOB_AXES` — `sampler_name`/`scheduler`, jamais pilotés jusqu'ici,
  petite extension rétrocompatible de `WorkflowRunner.api_for()` dans
  `runner/comfy.py`). `validate_variant_cfg()` calcule la différence
  structurelle entre le cfg de chaque variante et la référence et **lève**
  si elle touche autre chose que l'axe déclaré — la garantie « un seul axe
  change » est vérifiée par le code, jamais laissée à la discipline de
  l'appelant. Seeds toujours explicites (`run_bench(..., seeds=[...])`),
  jamais générés par le banc — rejouer le même run reproduit les mêmes jobs
- Verdict (`verdict_bench()`) : agrégation par genre déjà mesuré (identité
  ET chaque genre que `qc_realisme` rend, pas une liste figée), comparée à
  la référence (valeur ACTUELLE du personnage, dérivée automatiquement —
  jamais déclarée par l'appelant, pour ne jamais diverger de la vraie
  config). **Aucun seuil en dur** (invariant 4) : `min_seeds`/`margin`
  viennent de `cfg["bench"]`, section neuve — absente,
  `BenchConfigMissingError` explicite plutôt qu'une constante Python de
  repli. `PACKS/*/character_defaults.json` gagnent un gabarit `bench`
  (`measured: false`, même statut que `qc`) ; `migrate_bench_config.py`
  (nouveau, gabarit des scripts `migrate_*` déjà écrits) a backfillé les
  fiches réelles de Léna/Abyssiaelle — sans quoi elles ne pouvaient pas
  lancer de banc du tout
- `PLATFORM/capabilities.json` gagne `bench` avec `graph: null` — cas
  légitime de la forme d'ADR-0018 (documenté dans ADR-0021) : une capacité
  de plateforme *peut* porter un graphe (upscale), elle n'y est pas
  obligée quand elle orchestre un graphe qu'une autre couche possède déjà
- **Validation réelle, ComfyUI démarré en cours de session** :
  `run_bench()`, MÊME CODE, exécuté pour de vrai sur Léna (pack flux,
  scène `cafe_terrasse`) PUIS Abyssiaelle (pack sdxl, scène
  `portrait_etude`), axe `steps`, 2 seeds fixes rejoués à l'identique.
  Verdict `"insuffisant"` pour les deux (2 seeds < `min_seeds=5`) — preuve
  que le gate anti-petit-échantillon marche aussi sur de vraies données,
  pas seulement en synthèse. Images réelles produites sous
  `PROD/<CID>/_BENCH/`, confirmé absentes de `PROD/<CID>/OK`/`A_REVOIR`.
  `test_platform_capabilities.py` (J8.4) rejoué vert après coup : aucune
  régression du mécanisme d'upscale depuis les changements d'
  `execute_jobs`/`comfy.py`
- Hors périmètre, assumé : pas d'écran studio (comme l'upscale) ; aucun
  résolveur unifié pack+plateforme (pas de second appelant) ; le câblage de
  `roles` (contrat de rôles ComfyUI) dans une résolution réelle des nœuds
  reste déclaratif, pas branché — cohérent avec ADR-0020/J8.4

**Studio IA — chaque écran au niveau d'un outil professionnel** *(ouvert
2026-09-01 — exigence transverse, pas un jalon avec une date de fin)*
- Périmètre inchangé : personnage → univers → scènes, le pipeline actuel.
  Pas de multi-personnage, pas de vidéo pour l'instant
- Référence de niveau visée : Unreal Engine / Photoshop côté image.
  Modèle mental posé en session : **Soulglade est
  l'orchestrateur/compositeur, ComfyUI est le moteur** — Soulglade compose
  et pilote, ComfyUI exécute les graphes. Cohérent avec les invariants
  déjà écrits (CLAUDE.md §1-§2-§11), pas une remise en cause
- Se décline écran par écran, au fil des sessions — reste ouvert tant que
  des écrans du pipeline actuel n'ont pas atteint ce niveau
- **Premier écran repris : le compositeur de scène** (Banque). Formulaire
  plat → 7 onglets (Général / Lumière / Vêtements / Pose / Prompt global /
  Amélioration IA / JSON final). Audit UX/UI dédié : 5 correctifs
  distincts en commits séparés (fuite d'Échap hors d'une modale,
  sélecteur de tenue figé au niveau 0, aria-controls cassé sur 6 onglets
  sur 7, miroirs du récapitulatif ambigus, barre de navigation flottante)
  ; tablist fait main migré vers `@radix-ui/react-tabs` après plusieurs
  bugs répétés du même genre (course de focus, id qui dérive). Le prompt
  de vêtement, le prompt de pose et le sélecteur de tenue restent un
  vocabulaire de départ en texte — pas encore un vrai catalogue illustré,
  voir l'importeur d'assets ci-dessous. **Repris en session le 2026-09-01**
  pour une nouvelle passe
- Outils annoncés pour incarner cette ambition, à faire un par un, aucun
  scope figé pour l'instant :
  - Éditeur de pose OpenPose visuel, dans le studio (au-delà de
    l'extraction actuelle de `PosesView`). **Scope défini en session le
    2026-09-02** (revue d'éditeurs OpenPose ComfyUI/A1111, de Cascadeur et
    des conventions Unreal/Blender/Unity) — deux niveaux, `PoseCanvas.tsx`
    partagé par les deux :
    - **rapide** (`PoseEditorModal.tsx`, depuis l'onglet Pose du
      compositeur) : correction point par point + zoom/pan (fait,
      2026-09-02), reste volontairement minimal
    - **avancé** (`PoseEditorScreen.tsx`, écran dédié), par petits
      commits, dans cet ordre :
      1. annuler/rétablir (fait, 2026-09-02) — utile aux deux niveaux, pas
         réservé à l'avancé
      2. **fait, 2026-09-02** : lecture/saisie numérique du point
         sélectionné (x/y éditables, angle + longueur d'os depuis le
         parent) + liste des 60 joints nommés (`PoseInspector.tsx`,
         sélection par nom — utile pour les 21 points d'une main) +
         recentrer sur la sélection. A fait remonter `selected` hors de
         `PoseCanvas` (contrôlé désormais, partagé modale/écran) ; `view`
         (zoom/pan) est resté interne au canvas, piloté par un simple
         compteur `recenterTrigger` plutôt que d'être remonté aussi —
         la caméra reste l'affaire du canvas, l'appelant se contente de la
         pousser vers un point
      3. **fait, 2026-09-02** : panneaux mains en gros plan (aucun éditeur
         OpenPose du marché ne le fait — angle mort constaté en session,
         pas juste une lacune chez nous). Disposition posée par
         l'utilisateur (maquette en session) : colonne de gauche empilant
         main gauche / main droite, `PoseCanvas` plein cadre au centre,
         panneau de travail (phase 2) à droite — trois instances du même
         `PoseCanvas`, même `pose`/`selected` partagés, donc un geste dans
         un panneau se répercute partout sans synchronisation à écrire.
         Chaque panneau main démarre pré-zoomé sur la boîte englobante de
         SES points placés (avec marge), `view` reste local à chaque
         instance comme en phase 2. A ajouté `data-canvas` (full/handLeft/
         handRight) sur le `<svg>` — nécessaire dès que `test_pose_editor.js`
         a dû distinguer les trois pour compter les joints (mis à jour dans
         la foulée)
      4. **fait, 2026-09-02** : photo de référence en fond (opacité
         réglable) + rendu du squelette réactualisable à la demande pour
         comparer au calque du dessous. En creusant : la photo source
         d'une extraction ne persiste JAMAIS (règle déjà actée de
         `pose_tools.py`, avant même cette session) — donc pas de
         "reprendre la photo d'origine de cette pose", il n'y en a plus
         une fois l'extraction faite. La photo de référence est donc une
         image choisie fraîche pour la session d'édition, jamais envoyée
         au serveur : `URL.createObjectURL` sur le fichier local
         (`useReferenceOverlay.ts`), rendue comme `<image>` DANS le SVG
         (même repère que les joints, donc alignée au zoom/pan, y compris
         dans les deux panneaux mains — même prop `referenceImage` passée
         aux trois `PoseCanvas`) — jamais un `<img>` HTML séparé qui
         aurait dérivé. Vérifié en vrai : zéro requête réseau déclenchée
         par le choix du fichier.
         « Le rendu » = le PNG local du squelette (`pose_render.py`,
         déjà utilisé par enregistrer/charger), via une nouvelle route
         `POST /api/pose/render` qui rend sans jamais écrire dans
         `INPUTS/POSE/` (`pose_tools.rendre_apercu`, testé : POSE_DIR ne
         bouge pas). Affiché avec `mix-blend-mode: screen` pour que le
         fond noir du rendu (attendu par ControlNet) ne masque pas la
         photo dessous — remplace la vue interactive plutôt que de se
         superposer (rien à glisser sur un rendu figé), un bouton
         "revenir à l'édition" restaure les poignées.
         Extension envisagée **à terme, hors scope de cette phase** : si
         la pose vient d'une photo, reprendre CETTE photo (tant qu'elle
         est encore en mémoire côté client, jamais après coup) et lui
         appliquer un vrai workflow ComfyUI pour prévisualiser le
         résultat rendu — passerait par `execute_jobs` comme toute
         génération (invariant §2), pas un chemin d'exécution parallèle
      5. **fait, 2026-09-02** : épingler un point + rotation façon IK
         (préserve la longueur d'un os) + miroir gauche/droite — le nombre
         de points OpenPose (18 corps + 21×2 mains) est un format fixe
         consommé tel quel par ControlNet, donc pas d'ajout/suppression de
         points, seulement de nouvelles façons de manipuler les points
         existants. Le système n'a jamais eu de propagation parent→enfant
         (déplacer une hanche ne bouge pas le genou) : « épingler » ne
         contre donc pas une cascade qui n'existe pas, c'est un
         verrou simple — un point épinglé ignore glisser ET les flèches,
         contour pointillé ambre pour le voir, bouton dans le panneau
         numérique (`PoseCanvas.tsx`, `PoseInspector.tsx`). La rotation IK
         est Maj+glisser sur un joint non-racine : projette la cible sur le
         cercle de la longueur d'os ACTUELLE autour du parent
         (`parentIndexOf`, désormais partagé avec la phase 2 plutôt que
         dupliqué). Miroir corps (8 paires, réfléchies autour du x du cou —
         body-18 n'a pas de point bassin unique) et miroir main (copie la
         forme depuis le poignet source, réancrée au poignet ACTUEL de la
         cible) dans `poseFrame.ts`.
         **Bug réel trouvé en testant** : les deux miroirs (corps, main)
         passaient par `update()`, dont la fenêtre de regroupement de
         400ms (pensée pour un seul glisser continu) fusionnait deux clics
         de miroir rapprochés en un seul pas d'annulation — annuler le
         miroir de main annulait aussi le miroir de corps. Corrigé par
         `applyAction()`, un second chemin dans `usePoseEditor.ts` qui
         pousse toujours un pas neuf, pour toute action déclenchée par un
         bouton plutôt qu'un geste continu.
         Rough edge déjà documentée pour Ctrl+Z, retrouvée à l'identique
         pour épingler : cliquer un bouton hors du canvas déplace le focus
         DOM, donc la flèche clavier suivante ne vise plus le joint tant
         qu'on n'a pas recliqué dessus — les boutons restent le chemin
         fiable. Caractéristique notée en testant, pas un bug de cette
         phase : dans le canvas plein cadre, le poignet du corps et le
         poignet de la main occupent presque le même pixel (la main est
         ancrée au poignet), donc une interaction souris visée sur l'un
         peut réellement accrocher l'autre — un rappel de plus de l'intérêt
         des panneaux mains dédiés (phase 3)
    - **Backlog, fait, 2026-09-02** : sélection de plusieurs points à la
      fois. `Selected` (`PoseCanvas.tsx`) est devenu `ReadonlySet<string>`
      (des `pointKey`) au lieu de `{group, index} | null` — le changement
      le plus large de tout le chantier pose, touchant `PoseCanvas`,
      `PoseInspector`, l'écran et la modale, mais compile et passe sans
      accroc du premier coup (`useSelection.ts`, nouveau, centralise la
      logique de sélection partagée par la modale et l'écran plutôt que
      dupliquée). Trois gestes, sans collision de touche :
      - **clic** sur un joint (canvas ou outliner) : remplace la
        sélection par ce seul joint (comportement d'avant, inchangé)
      - **Ctrl/Cmd+clic** sur un joint : ajoute/retire ce joint sans
        toucher au reste — Maj était déjà pris (rotation IK sur un
        glisser, futur rectangle sur le fond), Ctrl/Cmd était libre et
        c'est la convention OS standard pour ce geste
      - **Maj+glisser le FOND** du canvas : rectangle de sélection (le
        glisser normal du fond reste le panoramique, inchangé — seul
        Maj bascule vers la sélection, jamais l'inverse)
      Glisser un point qui appartient à une sélection à plusieurs déplace
      tout le groupe en bloc (`withPointsMoved`, `poseFrame.ts` — chaque
      point recalculé depuis SA propre position de départ + le même
      delta, jamais de façon incrémentale, pour ne pas se composer).
      Testé en vrai : la distance entre deux points d'un groupe déplacé
      reste identique au pixel près. La rotation IK (Maj+glisser) ne
      s'applique qu'à un glisser à UN seul point — un groupe n'a pas de
      parent commun unique à préserver, donc bascule toujours en
      déplacement libre. Épingler et le recentrage opèrent maintenant sur
      toute la sélection (bouton « épingler tout », recentrage sur la
      boîte englobante du groupe)
    - **Audit UX/UI, fait, 2026-09-02** (skill `audit-ux-ui`, avant
      validation de tout le chantier) — findings vérifiés en vrai
      (captures d'écran + mesures DOM), pas seulement à la lecture :
      - le panneau utilisait du texte en dur là où le studio a déjà un
        mécanisme d'infobulle prêt et monté globalement
        (`chrome/HintLayer.tsx`, `Shell.tsx`) — c'était le seul écran à
        ne pas s'en servir. Remplacé par `InfoHint`
        (`screens/bank/composer/InfoHint.tsx`, réutilisé hors de son
        dossier d'origine) et `data-hint-text` sur `UndoRedoButtons` (qui
        utilisait un `title` natif, sans focus clavier ni fermeture par
        Échap). Mesuré : les deux blocs de texte retirés pesaient
        148,75px dans une colonne de 320px
      - conséquence directe mesurée : la liste de joints (seule vraie
        zone de défilement, légitime vu les 60 points) passe de 42% à
        68% visible sans scroller (311px → 508px sur 742px nécessaires)
      - rangée « symétrie corps » sans `items-center`, cassait
        systématiquement à 320px de large (un bouton isolé pleine
        largeur) — corrigé en empilant le libellé au-dessus d'une
        rangée de deux boutons à parts égales
      - l'en-tête « Corps complet », partagé entre le libellé et les
        contrôles de la photo de référence (phase 4), explosait en 3
        lignes une fois une photo chargée (`<input type="range">` sans
        largeur contraint, hérite de `width:100%` par défaut) —
        `LabeledCanvas` donne maintenant sa propre rangée à
        `headerExtra`, et le curseur est fixé à 90px
      - lien « Retour à la banque » passé de `.btn` à `.link` (même
        convention que le bouton « fermer » de la modale) pour aligner
        la ligne de tête des 3 colonnes, qui ne l'était pas
      Toutes les suites de tests (régression officielle, multi-sélection,
      phase 5) repassées au vert après coup — aucune régression
      fonctionnelle depuis la restructuration visuelle
    - **Passe de capitalisation, fait, 2026-09-02** : tour des libellés et
      infobulles de l'éditeur (écran + modale) pour les majuscules
      manquantes en début de phrase/titre — texte seulement, aucun
      comportement changé
    - **Retrait du rail d'outils global sur `/bank/poses` et l'éditeur de
      pose, fait, 2026-09-02** : `RAIL_ON` (`chrome/ToolRail.tsx`) ne
      couvre plus que `PATHS.produce` — l'éditeur de pose a désormais son
      propre outillage complet (undo/redo, inspecteur, miroir, épingle),
      le rail n'y ajoutait plus rien qu'une redondance. Confirmé par
      `test_bank.js` [15]
    - **Placer un point jamais détecté, fait, 2026-09-02**
      (`PoseInspector.tsx`) : un point issu d'une extraction occultée, ou
      d'un gabarit qui ne le couvrait pas, reste à `(0,0)`/confiance nulle
      — jusqu'ici aucun moyen de le positionner depuis le studio avancé,
      identifié en amont du chantier « nouvelle pose » ci-dessous comme
      potentiellement bloquant pour une création from-scratch (un gabarit
      qui ne couvrirait pas tous les points). Le panneau du point unique
      détecte `point.c <= 0` et affiche un message + bouton « Placer ce
      point » plutôt que les champs x/y habituels. `defaultPlacement()`
      propose un point proche du parent (+40/-40px) ou, sans parent, le
      centre du canvas — mais **seulement** si le point est réellement à
      `(0,0)` (le repli de `flatToPoints` pour une donnée absente) ; un
      point à confiance nulle mais aux coordonnées déjà plausibles
      (deviné à bas niveau de confiance par l'extraction) voit sa position
      existante promue telle quelle. Distinction trouvée en testant, pas
      en amont : la première version écrasait systématiquement, un point
      `Rwri` à confiance nulle mais coordonnées réelles a révélé la perte
    - **« Nouvelle pose » : modale plutôt qu'écran plein, fait,
      2026-09-02** — un plein écran pour une décision aussi courte
      (nom + gabarit + option « créer aussi un gabarit ») n'avait pas de
      sens ; `NewPoseModal.tsx` (nouveau, `screens/pose-editor/`)
      remplace l'ancien `PresetPicker` de `PoseEditorScreen.tsx`. Elle ne
      sauvegarde rien elle-même : elle collecte la décision et la passe en
      `state` de route (`NewPoseIntent`) à `navigate(PATHS.poseEditor,
      {state})` — `PoseEditorScreen` lit `useLocation().state` ; sans nom
      dans l'URL NI état (visite directe/bookmark), l'écran redirige vers
      la banque plutôt que de ressusciter un picker plein écran
      (`<Navigate to={PATHS.bankPoses} replace/>`).
      Piège trouvé en testant, pas en le lisant : `navigate()` vers
      `PATHS.poseEditor` seul (sans `?character=`) déclenche l'effet de
      rattrapage de `CharacterContext.tsx` (« l'URL rattrape le state »),
      qui republie l'URL via `setSearchParams(..., {replace:true})` —
      et cet appel ne réinjecte PAS le `state` de la navigation qu'il
      remplace, effaçant `intent` un instant après l'arrivée sur l'écran
      (constaté : la modale se fermait, mais l'écran rebondissait vers la
      banque). Corrigé en portant `search: location.search` dans l'appel
      `navigate` de la modale, pour que `?character=` soit déjà présent
      et que l'effet de rattrapage n'ait jamais à se déclencher — même
      piège déjà documenté dans le commentaire de `selectCharacter`, pour
      la première fois rencontré côté `state`.
      Còté API : `pose_tools.enregistrer_preset(frame, label)` (nouveau,
      juste après `charger_preset`) écrit un gabarit dans
      `AUTOMATION/pose_presets/`, nom de fichier dérivé du libellé par un
      `_slug()` local (pas d'import du `_slug` de `compose.py` — module
      différent, éviter un couplage pour une fonction d'une ligne),
      numéroté en cas de collision (`ma-pose-assise`, `ma-pose-assise-2`,
      …) sans jamais écraser un gabarit existant. Testé (`test_pose_render.py`
      §6) : aller-retour du libellé (accents/ponctuation compris),
      `source` toujours `"preset"` même si le frame d'origine venait
      d'une extraction, libellé vide refusé explicitement. Exposé par
      `POST /api/pose/preset` (`PosePresetSaveRequest`/`Response`,
      `api/schemas/images.py`) à côté du `GET` déjà existant sur la même
      route — convention FastAPI valide, pas de nom alternatif nécessaire.
      Vérifié en HTTP réel (curl), pas seulement via la fonction Python.
      Côté écran : `usePoseEditor.ts` gagne `saveAsPreset(label)` et un
      `initialLabel` optionnel sur la source `preset` (le nom tapé dans la
      modale devient `pose.label` dès le chargement du gabarit de départ,
      avant même le premier enregistrement). L'option « créer aussi un
      gabarit » ne se déclenche qu'au tout premier `Enregistrer` d'une
      pose from-scratch (jamais sur un ré-enregistrement ultérieur) et
      réutilise le nom de la pose comme libellé du gabarit — pas de
      second champ. L'en-tête du panneau (`aside b`) affiche désormais
      `pose.label` en priorité sur le nom de fichier brut, cohérent avec
      le nom qu'on vient de taper plutôt qu'un `pose__00001_.png` illisible.
      `test_pose_editor.js` réécrit en conséquence (la modale remplace les
      deux premières étapes, le panneau vérifié sur le libellé plutôt que
      le nom de fichier) — toute la suite (régression officielle, banque,
      extraction) repassée au vert
    - **Banque de poses elle-même, fait, 2026-09-02** — les 3 premières
      directions actées en brainstorm ; recherche/regroupement laissé de
      côté (jugé prématuré tant que la banque reste petite) :
      - **libellé sous chaque vignette**. `poses: string[]` (déjà servi
        par `/api/scenes`, lu par tout autre sélecteur de pose de l'appli
        — le compositeur de scène notamment) ne porte ni libellé ni
        provenance ; changer sa forme aurait fait déborder ce chantier sur
        un composant qui n'en a pas besoin. Route dédiée à la place :
        `GET /api/pose/bank` (`pose_tools.poses_disponibles_detail()`,
        nouveau, juste après `poses_disponibles()`) — lit le JSON sœur de
        chaque squelette quand il existe, `label`/`source` à `None` sinon
        (une pose d'avant le sidecar JSON n'est pas une erreur, voir
        `charger_points`). Testé (`test_pose_render.py` §4bis) : les
        deux cas, plus un vrai libellé qui traverse. Régénéré via
        `python AUTOMATION/tools/toolchain.py types` (`PoseBankEntry`/
        `PoseBankResponse`, schéma généré — pas de type API écrit à la
        main, cf. `frontend.md`)
      - **badge de provenance**. Réduit aux deux valeurs que la donnée
        distingue réellement (`source: "preset" | "extraction"`) —
        « gabarit » / « photo ». Le 3ᵉ mot du brainstorm (« main »,
        pour une pose démarrée d'un gabarit puis corrigée à la main) n'a
        pas d'équivalent dans le modèle : rien ne sépare aujourd'hui « un
        gabarit copié tel quel » d'« un gabarit ensuite retouché point
        par point », les deux valent `source: "preset"`. Inventer une
        3ᵉ catégorie aurait affiché une distinction que la donnée ne
        porte pas — pas de badge du tout pour une pose sans sidecar,
        même raison. **Alignement corrigé après une capture d'écran** :
        la première version posait le badge en haut à gauche de la
        vignette, à côté du bouton retirer (haut à droite) — sur une
        carte de ~100px de large (grille `minmax(96px,1fr)`, inchangée),
        les deux se chevauchaient. Déplacé dans le bandeau du bas, à
        côté du libellé plutôt qu'en overlay sur l'image — même vigilance
        d'alignement que l'audit UX/UI de l'écran avancé, cette fois
        repérée sur une capture plutôt qu'en la lisant
      - **confirmation de suppression nommant les scènes concernées**.
        Calculée entièrement côté client, sans nouvelle route : `drafts`
        (`ScenesStoreContext`, déjà chargé pour la sous-vue Scènes) porte
        déjà `.pose` par brouillon — `drafts.filter(d => d.pose === nom)`
        suffit. Deux textes de confirmation distincts : nommée si
        référencée, rassurante (« peut être retiré sans rien casser »)
        sinon — `test_pose_extract.js` [5] attendait l'ancien texte
        générique, mis à jour ; le cas RÉFÉRENCÉ n'avait, lui, aucune
        couverture — vérifié en vrai (script one-off : squelette assigné
        à une scène réelle via l'UI, confirmation de suppression relue,
        `scenes.json` restauré depuis un instantané, même méthode que
        `test_bank.js` [16]), pas ajouté à la suite officielle
    - **Banque de poses, deuxième passe, fait, 2026-09-02** — jugée
      « trop sommaire » une fois les 3 points ci-dessus en place ; l'écran
      promu de fichier plat à dossier (`screens/bank/poses/{PosesView.tsx,
      usePoseBank.ts, PoseCard.tsx}`, même précédent que `composer/`) tant
      la surface a grossi. Trois décisions de design tranchées en session
      (menu « ⋯ » unique plutôt que boutons multiples ou icônes au survol ;
      grille compact/confortable plutôt qu'une seule taille ; renommage
      SUR PLACE plutôt qu'une modale) avant de coder :
      - **recherche + filtres (provenance, utilisation) + tri** (récent /
        alphabétique / plus utilisées), entièrement client — `usePoseBank`
        dérive `rows` depuis `poses` + le détail de `/api/pose/bank` +
        `drafts` (usage), aucune route de plus
      - **renommer une pose existante SANS route dédiée** : réutilise le
        chemin d'enregistrement normal — `GET /api/pose/keypoints` puis
        `POST /api/pose/save` avec `label` corrigé, même `nom`. Idem pour
        **dupliquer** (même GET, `POST .../save` avec `name: null` et
        `created_at: null` — sinon la copie hérite de la date de naissance
        de l'originale, ce qui aurait faussé le tri « plus récent »).
        Aucune des deux n'a de sens sur une pose sans sidecar (rien à
        charger) : le menu les désactive sur ce signal-là précisément
        (`source === null`), pas un champ ajouté pour l'occasion — un
        sidecar existant stampe TOUJOURS `source`, jamais `None`
      - **densité compact/confortable**, mémorisée en `localStorage`
        (même garde try/catch que `ChromeContext`'s rail/focus flags — un
        stockage bloqué doit rendre une grille NORMALE, jamais une erreur)
      - **menu « ⋯ »** (les 4 actions dessous : éditer / dupliquer /
        renommer / retirer), choisi sur 3 maquettes ASCII plutôt que
        deviné — la carte reste calme à ~100px, une carte plus large plus
        tard n'imposerait pas un redesign
      Deux bugs réels trouvés en testant, pas en relisant le code :
      1. les `<button>` du menu (contrairement aux `<a>`/`.btn`) captaient
         le fond GRIS PAR DÉFAUT du navigateur — aucun reset global
         `button{background}` n'existe dans `base.css` (`input,select,
         textarea` en ont un, `button` en est délibérément exclu, les
         boutons stylés passent par `.btn`). Repéré sur une capture, pas
         en relisant le JSX
      2. **dupliquer** faisait courir une vraie course : `duplicate()`
         relançait `reloadScenes(true)` (qui fait apparaître la nouvelle
         carte via `poses`) SANS attendre le rechargement du détail de
         banque — la nouvelle carte naissait donc pour UN rendu sans
         libellé (repli sur le nom de fichier brut) avant de se corriger.
         Corrigé en attendant `reloadBankDetail()` PUIS `reloadScenes`,
         dans cet ordre précis (pas `Promise.all`) : le détail de banque
         doit déjà connaître la nouvelle entrée avant que `poses` ne la
         fasse naître à l'écran, sinon la carte existe un instant sans
         savoir quoi afficher
      **Incident réel en testant, pas dans le produit** : un premier
      script de vérification de "dupliquer" identifiait la copie par
      motif de nom (`n.startsWith('pose__')`) plutôt que par différence
      d'ensemble avant/après — sur une banque à 4 squelettes, il a
      supprimé UN SQUELETTE RÉEL PRÉEXISTANT au lieu de la copie de test.
      Aucune scène ne le référençait (vérifié après coup), mais le
      fichier n'était pas récupérable. Le bug était dans le SCRIPT de
      test, pas dans la route `/api/pose/delete` elle-même ni dans
      l'écran — mais la discipline qui l'aurait évité manquait :
      `test_pose_bank.js` (nouveau, suite officielle) identifie
      désormais TOUJOURS la carte créée par différence d'ensemble
      (avant/après), jamais par motif de nom ou position de liste — en
      commentaire d'en-tête, pour que la prochaine fumigation de ce
      dossier reparte de la même règle
      `test_pose_editor.js` [8] réparé au passage (pas une régression de
      cette session, une hypothèse devenue fausse : il supposait que
      « toute pose plus vieille que celle du test n'a pas de sidecar »,
      vrai avant le sidecar JSON, plus du tout depuis — vérifie
      maintenant via `/api/pose/keypoints` plutôt que de le supposer).
      Suite complète (`test_pose_editor.js`, `test_pose_extract.js`,
      `test_pose_bank.js`, `test_bank.js`) rejouée 4 fois d'affilée sans
      résidu entre les runs
  - Créateur de lumière (probable remplaçant du placeholder « template de
    lumière » du compositeur de scène)
  - Importeur d'assets (ex. vêtements) avec résumé automatique par vision
    LLM de l'image importée
  - **Éditeur d'expression faciale, fait, 2026-09-03** — jusqu'ici un
    mécanisme sans aucune UI : `AUTOMATION/expression.py` pose une
    expression via le node ComfyUI `ExpressionEditor`
    (`comfyui-advancedliveportrait`, revue de l'installation réelle en
    session — ce node couvre déjà tout ce dont une image fixe a besoin,
    `AdvancedLivePortrait`/vidéo hors scope V1, `SaveExpData`/`LoadExpData`
    un format `.exp` interne à ComfyUI, pas une base à reprendre), une
    plage `[lo, hi]` par ton (`creative.json` → `tones[].expression`)
    tirée au hasard par job. Trois étapes, chacune commitée séparément :
    1. **Backend** — `expression.py` factorisé (`_generer()` commun),
       nouvelle `apercu()` qui rend SANS jamais toucher le fichier source
       (contrairement à `appliquer()`, elle lève explicitement plutôt que
       d'avaler l'échec — l'utilisateur attend un retour d'un clic).
       `api/services/expression.py`+`routers/expression.py` neufs (suivent
       le précédent `routers/worlds.py`) : `POST /api/expression/preview`
       (image + score d'identité en en-tête `X-Identity-After`) et `POST
       /api/expression/tone` (première écriture de `creative.json`, jamais
       exposée avant). `test_expression_isolation.py` neuf, vérifié contre
       ComfyUI/InsightFace réels.
    2. **Écran éditeur** (`screens/expression-editor/`, calqué sur
       `pose-editor/`) — sliders groupés par zone du visage, champs
       numériques + boutons « fixer min/max depuis l'essai » plutôt qu'un
       double-curseur inventé, aperçu rendu sur une photo DÉJÀ PRODUITE du
       personnage (jamais un envoi à la volée — le coût d'identité du warp
       varie trop d'une photo à l'autre pour qu'un aperçu sur une image
       arbitraire veuille dire quoi que ce soit). **Bug réel trouvé et
       corrigé en testant** : une exception non attrapée remontant de
       `run_in_executor` jusqu'au handler générique d'erreurs fait
       raccrocher la réponse sous `LocalOriginGuardMiddleware` — un défaut
       connu de `BaseHTTPMiddleware` (Starlette) avec une exception
       d'exécuteur qui s'échappe de la route qui l'attend ; confirmé en
       isolant (la requête SUIVANTE sur ce même serveur restait bloquée).
       Corrigé en attrapant largement dans la route, comme
       `/api/pose/extract` le fait déjà pour la même raison.
    3. **Sous-vue Tons** de la Banque (`screens/bank/tones/`) — le point
       d'entrée manquant : l'éditeur était complet mais inatteignable sans
       taper une URL à la main. Une carte par ton, aucun menu ni
       rename/duplicate/delete (un ton reste hand-authored dans
       `creative.json`), lien vers son propre éditeur.
    `test_expression_editor.js` (nouveau, contre `lena` — seul personnage
    avec des photos produites — snapshotte et restaure `creative.json` à
    l'octet près) + `test_bank.js` étendu (3 sous-vues). Suite complète
    (12 fumigations navigateur) verte.
    - **Audit UX/UI + lightbox réparé, fait, 2026-09-03** — passe dédiée sur
      ce module tout juste livré, deux bugs réels trouvés en testant (pas en
      relisant) : re-rendre à l'identique échouait à coup sûr (cache
      ComfyUI renvoyant un fichier déjà supprimé — corrigé par un nom
      d'entrée unique par appel) et changer de photo après un rendu
      laissait l'ancien aperçu/score affichés. Layout de l'écran rebordé en
      hauteur (toute la page défilait au lieu du seul panneau de droite).
      Puis, en branchant le zoom demandé sur `LightboxContext` : le
      composant partagé (Revue/Galerie/Produire) n'avait plus AUCUN style
      depuis la migration React (`#lightbox` documenté dans DESIGN.md,
      jamais porté) — réparé avec un vrai zoom (taille native, clic sur
      l'image plutôt que sur le fond), plus 3 compléments sur le modèle de
      l'éditeur de pose : bascule original/rendu, indicateur « non
      enregistré », annuler/rétablir (Ctrl+Z) sur les curseurs.
    - **Refonte pro one-page + capacités + a11y, fait, 2026-09-04** —
      `DOCS/design-pass/screen-expression-editor.md`, handoff validé mais
      jamais implémenté (vérifié via `git log` avant de commencer, pas via
      le statut affiché dans le doc lui-même — voir aussi l'erreur de
      lecture symétrique sur le thème Phase 0b plus haut). `ParamRow` passe
      de 3 lignes empilées à une seule (case+libellé, curseur, essai,
      min/mn/max/mx) ; la borne `[lo, hi]` jusque-là toujours visible est
      retirée plutôt que déplacée en `title` — `InfoHint` la porte déjà en
      `data-hint-text`, dupliquer en hover-only aurait réintroduit le
      pattern que `conventions-ux-ui.md` §3 proscrit. Colonnes passées de
      `1fr/360px` à 50/50 (nécessaire : le budget de 360px ne laissait pas
      la place pour caser tout un `ParamRow` sur une ligne). Compteur
      `N/M inclus` par groupe. Sélection de 1 à 3 photos à la fois
      (`useExpressionEditor` : `photo`/`previewUrl` singuliers →
      `selectedPhotos`/`results` indexé par nom), un rendu par photo, échec
      isolé par carte (son propre message + retry), toast explicite à la
      4ᵉ photo plutôt qu'un clic mort. Menu « Copier depuis… » (popover
      `role="menu"`, calqué sur `chrome/IdentityMenu.tsx`, en plus simple)
      applique la plage d'un autre ton en un seul geste d'historique
      (`applyParamsAction`, pas `updateParams` — un seul Ctrl+Z doit tout
      annuler). Vignettes : `title` → `data-hint-text`. `test_expression_editor.js`
      étendu (compteur de groupe, sélection multi-photo, limite à 3, menu
      copier) — suite verte, plus `test_expression_isolation.py` (aucun
      changement backend, sert de garde-fou). **Trouvé mais volontairement
      hors scope** : la case à cocher de chaque paramètre n'a aucun anneau
      de focus visible (`chrome.css` : `input:focus{outline:0}`, appuyé sur
      un changement de `border-color` à la place) — règle globale de
      l'appli, pas une régression de ce chantier, à traiter séparément.
    - **Alignement du rail + modal « Copier depuis… », fait, 2026-09-04** —
      retour utilisateur sur capture d'écran réelle : colonnes non alignées
      et chevauchement visible sous le menu « Copier depuis… ». **Trois bugs
      réels en cascade, chacun mesuré avant/après, aucun deviné** :
      1. Le libellé sans largeur fixe (mesure précédente) faisait dériver
         `essai`/`min`/`max` de jusqu'à 80px d'une ligne à l'autre — remis à
         largeur fixe, mais **cette fois mesurée** (170px = largeur réelle
         maximale des 12 libellés, jamais 180px au hasard).
      2. Une fois la largeur fixée, la ligne entière ne tenait plus dans
         l'aside à une fenêtre réaliste (~1180px, mesuré ~458px d'aside) :
         `mx` se rendait à x=1268, hors du viewport à 1180 — aucun retour à
         la ligne, aucun clip visible, un **débordement horizontal
         silencieux** sans indice pour l'utilisateur. Corrigé en masquant
         visuellement (`clip-path`, jamais `display:none`) les légendes
         `essai`/`min`/`max` répétées 12× (remplacées par un unique en-tête
         collant `sticky top-0`, ses cellules étant des copies invisibles
         des vrais boutons — ne peut pas se désaligner des lignes) et en
         resserrant les champs numériques.
      3. **Le plus retors** : une fois le libellé large fixe posé, la case à
         cocher elle-même s'est mise à occuper 140px et à écraser tout le
         texte (mesuré : la largeur rendue du texte était 0px) — la règle
         globale `chrome.css` `input{width:100%}` n'avait jamais eu de
         largeur DÉFINIE à résoudre avant ; en lui en donnant une, elle
         s'y accrochait. Corrigé (`w-auto` sur la case) — le même piège
         guette toute autre case à cocher qui gagnerait un jour un ancêtre à
         largeur définie, non traqué ailleurs dans le studio.
      Gain net : hauteur de ligne 79px → 55px, les 12 paramètres tiennent
      maintenant SANS le moindre défilement interne à cette fenêtre (avant :
      défilement nécessaire). Le popover « Copier depuis… » (droite de
      l'aside) chevauchait 6 à 8 des 12 lignes une fois les lignes
      raccourcies — remplacé par une vraie modale (`chrome/Dialog.tsx`, même
      primitif que `NewPoseModal.tsx`) sur choix explicite de l'utilisateur
      (question posée : garder le popover contraint vs modale — modale
      choisie). `test_expression_editor.js` : sélecteur `.tiny:has-text
      ("Bouche")` corrigé en `"Bouche —"` (collision avec le sous-titre du
      nouveau modal, qui contient aussi le mot "bouche" en minuscule) ;
      assertions du modal portées sur `#copyFromToneBox` (dialog natif) au
      lieu de `role="menu"`. Suite verte.
    - **Barre d'actions du haut regroupée, fait, 2026-09-04** — retour
      utilisateur : « Copier depuis… » seul sur sa propre ligne, aligné à
      droite, flottait sans rien à sa gauche quand l'écran n'était pas
      modifié (mesuré sur capture). Fusionné avec « Enregistrer la plage »
      sur une seule ligne — les deux sont des actions de niveau ton, pas
      juste voisines par hasard — `flex-1` retiré du bouton Enregistrer
      (il dominait hors de proportion une fois à côté d'un petit bouton
      secondaire) ; annuler/rétablir restent groupés à droite (des
      contrôles d'historique, pas des actions de ton). Le message « non
      enregistré » descend sur sa propre ligne, affiché seulement si
      `dirty`, plus besoin du `<span/>` de réservation d'espace. Une ligne
      entière de hauteur récupérée en plus. Suite verte.
  - **Éditeur photo — 7a (modal) + fondation 7b (avancé), fait,
    2026-09-04** — `DOCS/design-pass/screen-photo-editor.md`. Le patron
    pose/expression étant stabilisé sur un deuxième outil, le tour de
    l'éditeur photo (noté ci-dessus) venait logiquement.
    1. **7a** (`screens/review/PhotoEditor.tsx`) — le seul écart réel vs
       CLAUDE.md §1 comblé : `dirty` dérivé de l'écart avec l'état
       d'ouverture (NEUTRAL/pas de cadre), ✕/annuler passent par la
       confirmation partagée si `dirty` (Échap reste un dismiss direct,
       par construction du design demandé — pas une incohérence), lien
       « Éditeur avancé → » vers 7b. Aucun changement serveur.
    2. **Décision d'architecture pour 7b** : le compositing des calques
       reste ENTIÈREMENT CLIENT (Canvas2D, même stratégie « aperçu à
       taille écran, pleine résolution seulement à l'enregistrement » que
       `PhotoEditor.tsx`), pas d'endpoint `/preview` serveur — le
       design-pass suggérait un rendu serveur, mais un aller-retour par
       tick de curseur serait la mauvaise latence pour un outil qui se
       veut instant. Le backend (`api/routers+services/photo_editor.py`,
       suivant le patron `expression.py`) ne fait que persister la pile
       (sidecar `<nom>.layers.json`, même convention que
       `pose_tools.py::_chemin_points`) et enregistrer le résultat déjà
       composité — même contrat copie/écrase que `/api/edit/save`.
       `apply_overwrite_side_effects` factorisé dans `services/journal.py`
       (vignette oubliée, mesures effacées, export refait) : deuxième
       appelant réel, pas une abstraction prématurée. Vérifié manuellement
       de bout en bout : le chemin `remplacer=true` de `/api/edit/save`
       n'avait AUCUNE couverture automatisée existante avant ce chantier.
       `test_photo_editor_isolation.py` neuf (calqué sur
       `test_expression_isolation.py`) — piège trouvé en le lançant : les
       deux personnages jetables partageaient d'abord le même nom de
       photo, donc la requête croisée résolvait légitimement SA PROPRE
       photo au lieu de 404 — le test ne prouvait rien tant que seul un
       des deux personnages avait le fichier.
    3. **Écran** (`screens/photo-editor-advanced/`) — calques réels
       (`layers[0]` = sommet de la pile, le calque `photo` verrouillé
       toujours en dernier), 4 curseurs de base par calque
       (expo/contraste/sat/temp), historique en tableau + curseur (pas
       deux piles) pour que le panneau Historique saute à un état
       arbitraire en un clic tout en filtrant les entrées non
       structurantes (curseurs coalescés) de celles qui le sont
       (ajout/suppression de calque, préréglage) — design-pass §7b. Deux
       bugs réels trouvés EN TESTANT, aucun à la lecture du JSX :
       - le raccourci Ctrl+Z était posé sur la barre du haut plutôt que
         sur le conteneur englobant tout l'écran (même piège que
         `PoseEditorScreen.tsx` a déjà résolu pour lui-même) — un focus
         dans le panneau droit (un curseur) ne faisait jamais remonter
         l'évènement jusqu'au gestionnaire, une SIBLING n'étant pas un
         ancestor ;
       - une fois ce premier bug corrigé, un second est apparu : la
         coalescence par temps (`push()`) relisait `lastPushAt.current`
         DANS le updater passé à `setHist`, alors que la ligne juste après
         l'appel de `setHist` le réécrivait de façon synchrone — React
         n'exécute pas forcément le updater avant cette ligne suivante, si
         bien que chaque poussée mesurait `now - now = 0` et fusionnait
         TOUJOURS avec l'entrée précédente, quel que soit le temps réel
         écoulé (confirmé en isolant : un seul Ctrl+Z annulait à la fois
         le réglage d'un curseur ET l'ajout du calque qui venait de
         l'introduire). Corrigé en décidant `coalesce` une seule fois,
         avant `setHist`, et en ne capturant que ce booléen dans le
         updater — jamais relire une ref mutée juste après l'appel de
         `setState` depuis l'intérieur de son propre updater.
    4. **Audit UX/UI, fait** — deux findings réels mesurés (pas devinés),
       corrigés : les boutons icône du panneau Calques (visibilité,
       réordonner, supprimer) mesuraient 11-18px, sous le minimum WCAG 2.2
       AA (24×24, SC 2.5.8) et très en-deçà des boutons icône déjà établis
       ailleurs (`UndoRedoButtons.tsx`, 35×34px mesuré) — élargis à 24×24
       pile. Le calque de base n'expliquait nulle part dans la LISTE
       pourquoi il n'a ni réordonnement ni suppression (seul le panneau
       Colorimétrie le disait, et seulement une fois sélectionné) — tag
       « verrouillé » ajouté. Colatéral : « Enregistrer une copie » de la
       barre du haut n'avait pas de poids `primary`, contrairement au
       bouton d'enregistrement de CHAQUE éditeur frère (pose, expression,
       7a lui-même) — corrigé (`btn primary sm`, même combo que
       `ExpressionEditorScreen.tsx`).
    `test_photo_editor_advanced.js` neuf (14 étapes : chargement, ajout de
    calque en un geste d'historique, undo/redo distinguant le curseur
    coalescé de l'ajout structurant, clic sur une entrée d'Historique,
    préréglage, réordonner/masquer/supprimer un calque non-base, base
    jamais supprimable, avant/après, écraser confirmé puis toujours
    annulé, enregistrer une copie en aller-retour réel par l'API). Suite
    review/pose/expression/bank rejouée verte à plusieurs reprises.
    **Volontairement hors de cette passe** (pas des coquilles à moitié
    finies, leur propre étape à venir) : courbes par canal, niveaux, HSL
    par bande, netteté/flou sélectif avec les 6 modes de masquage (auto
    sujet/ciel/arrière-plan désactivés « bientôt » — backend de
    segmentation à fournir, même statut que la retouche IA),
    recadrage avancé (perspective H/V), panneau Retouche IA
    maquetté-inerte. À ce moment-là : revisiter si le compositing
    client-side tient encore la route pour des opérations plus lourdes ou
    s'il faut basculer une partie sur un rendu serveur.
  - **Éditeur photo avancé — les 4 panneaux différés, fait, 2026-09-05** —
    suite directe de l'entrée précédente : Colorimétrie avancée,
    Netteté/flou sélectif, Recadrage avancé, Retouche IA
    (`DOCS/design-pass/screen-photo-editor.md` §7b), niveau Lightroom
    demandé explicitement. Tout reste compositing client (Canvas2D),
    cohérent avec la décision de la fondation.
    1. **Pipeline restructuré** — chaque calque rend désormais sur son
       PROPRE canvas offscreen avant composition sur le canvas partagé :
       `ctx.filter` (expo/contraste/sat) → une passe pixel UNIQUE
       (niveaux → courbes → HSL par bande, une seule lecture/écriture
       d'`ImageData`) → déformation de perspective → netteté → flou
       sélectif masqué. Non-régression stricte vérifiée sur les 4
       curseurs de base après le refactor (pixel témoin identique).
    2. **Courbes** — LUT 256 entrées par canal, interpolation cubique
       monotone (Fritsch-Carlson) : une spline naïve produirait une LUT
       non monotone (bande de couleur visible). Éditeur SVG 4 canaux.
    3. **Niveaux + HSL** — point noir/moyen/blanc classique ; HSL 6
       bandes avec poids de mélange TRIANGULAIRE entre bandes adjacentes
       (pas de frontière dure, comme Lightroom) — les deux pliés dans la
       même passe pixel que les courbes.
    4. **Perspective** — homographie 2 angles (Paul Heckbert,
       square-to-quad + inversion 3×3 + échantillonnage bilinéaire),
       Canvas2D n'ayant aucune transformation projective native. Coin
       hors-source = transparent, pas de recadrage auto (le redressement
       fin reste dans le modal 7a, volontairement pas dupliqué ici).
    5. **Masquage partagé** (flou sélectif ET retouche IA, même
       composant `MaskPicker`) — pinceau/dégradé/radial via les
       primitives natives Canvas2D (`createLinearGradient`/
       `createRadialGradient`/traits arrondis), jamais un rasterizeur
       maison ; traits stockés en coordonnées NORMALISÉES 0-1 pour
       survivre au redimensionnement aperçu↔export. Sujet/Ciel/
       Arrière-plan restent des entrées sélectionnables mais INERTES
       (pas de backend de segmentation) — même statut que la Retouche
       IA, `data-hint-text` explicite plutôt qu'un `disabled` muet.
    6. **Retouche IA** — panneau maquetté-inerte, réutilise le même
       `MaskPicker` + taille de pinceau + prompt. « Générer la
       retouche » PERMANENTEMENT désactivé (`data-hint-text`, jamais
       `title`), aucun appel réseau.
    Bugs réels trouvés EN TESTANT (aucun à la lecture du JSX) :
    - `Field(default_factory=X)` en Pydantic v2 n'émet pas de clé
      `default` dans le JSON Schema OpenAPI généré → `openapi-typescript`
      marque le champ TS optionnel alors qu'il ne devrait pas l'être.
      Tous les nouveaux champs objet/liste/dict de `LayerSettings`
      utilisent une instance littérale (`= Curves()`) à la place — sûr en
      Pydantic v2 (deep-copy par instance, pas d'état mutable partagé).
    - `CurvesEditor` : glisser un point de courbe juste après en avoir
      ajouté un lisait un `points.length` PÉRIMÉ (2 au lieu de 3) — un
      listener `pointermove` posé sur `document` de façon synchrone voit
      les props React encore périmées avant que le `setState` d'ajout
      n'ait fini de re-rendre. Corrigé par un `useRef` dédié au geste
      live, mis à jour de façon synchrone à chaque mouvement, jamais lu
      depuis les props pendant un geste en cours — la même bascule a été
      appliquée PROACTIVEMENT au drag de placement de masque avant de
      l'écrire, resté sans bug dès le premier test.
    - `aspect-square` + `max-h-[200px]` ensemble sur le SVG de courbe
      produisaient une boîte non carrée (354×200), donc un `viewBox`
      256×256 en letterbox à 200×200 — tout rétrécissait de ~40%, cibles
      de points de courbe comprises. `max-h` retiré (le panneau défile
      déjà, une courbe plus haute est acceptable).
    - Points de courbe à 8×8px puis 14×14/25×14 anisotropes : sous le
      minimum WCAG 2.2 SC 2.5.8 (24×24). Corrigé par un cercle de visée
      invisible (r=9) derrière le point visible (r=5/6.5) — pattern déjà
      utilisé pour les boutons icône de `LayerList` (entrée précédente).
    7. **Audit UX/UI final (assemblage complet), fait** — chaque étape
       avait déjà sa vérification à la construction ; ce passage porte
       sur les 5 panneaux repliables assemblés dans l'aside 380px :
       aucun chevauchement entre panneaux ouverts simultanément (mesuré),
       aside scrollable (`scrollHeight` 1666 > `clientHeight` 768,
       `overflow-y:auto`), ordre de tabulation cohérent de bout en
       écran, bascule flou→IA→flou sur le `MaskPicker` partagé sans
       fuite d'état ni double bandeau. Deux findings réels :
       - **`input[type=range]:focus` n'a AUCUN indicateur visible** —
         `input:focus{outline:0;border-color:var(--acc)}` (chrome.css)
         suppose un input avec bordure visible, mais le rendu natif
         Chromium d'un curseur ignore ce `border-color` (confirmé par
         capture avant/après identique au pixel). Pré-existant sur TOUT
         le studio (même pattern que `ExpressionSliders.tsx`), mais cet
         écran porte à lui seul désormais le plus de curseurs de toute
         l'app (niveaux, HSL, netteté, flou, pinceaux, perspective) —
         corrigé au niveau commun (`chrome.css`, une règle
         `input[type=range]:focus-visible`), pas dans les fichiers de
         l'écran, pour bénéficier à tout curseur existant plutôt que
         créer une incohérence entre écrans. Reconfirmé par capture
         avant/après (anneau visible) et non plus seulement mesure CSS.
       - `test_photo_editor_advanced.js` existait et passait depuis
         l'étape 1 mais n'avait jamais rejoint la liste `TESTS` de
         `run_browser_tests.py` — lancé à la main (`node ...`) à chaque
         étape de ce chantier, absent de la fumigation officielle.
         Ajouté à la liste.
    Suite complète rejouée : 9/11 verts ; les 2 échecs restants
    (`test_application` flaky isolé — repasse vert seul ;
    `test_review` — le venv de dev n'a pas `cv2`, `/api/mesurer` y
    répond 500, limitation déjà connue et non liée à ce chantier) sont
    sans rapport avec ces changements.
    **Toujours inerte, volontairement** : Sujet/Ciel/Arrière-plan (pas de
    backend de segmentation), Retouche IA (F5.2 pas branché).
  - **Zoom sur les deux éditeurs photo, fait, 2026-09-05** — aucun des deux
    (7a modal simplifié, 7b avancé) ne permettait de grossir l'image ;
    signalé explicitement, alors que 7b manipule désormais des réglages
    fins (courbes, HSL, netteté) où voir le détail réel compte.
    1. **Hook partagé** `chrome/useZoomPan.ts` (générique, aucun couplage
       photo — même famille que `useRovingChoice.ts`) : bornes
       `[fitPct..400%]`, boutons `+`/`−`/`Ajuster`, Ctrl/Cmd+molette centré
       sur le curseur, pan par **défilement natif** (`overflow:auto`) —
       délibérément pas un geste de drag maison, qui aurait dû cohabiter
       avec le drag du cadre de recadrage (7a) et la peinture de masque
       (7b), tous deux déjà posés sur le canvas/son overlay.
    2. **Deux stratégies de rendu, une seule par écran** : 7a ne touche que
       `canvas.style.width/height` (le buffer reste à la résolution
       « ajuster » de `sizeCanvas()`) — son cadre de recadrage lit déjà
       `getBoundingClientRect()` pour se positionner, donc rien à changer
       dans sa géométrie. 7b redessine `canvas.width/height` en résolution
       réelle jusqu'à 100 % (compositing complet à chaque palier de zoom,
       jamais au-delà — au-delà, agrandissement CSS pur, comme un
       visualiseur d'image) : son placement de masque étant déjà en
       coordonnées normalisées 0-1, il reste correct sans changement non
       plus.
    Trois bugs réels trouvés EN TESTANT, aucun à la lecture du JSX :
    - `useZoomPan` initialisait son état AU RENDU où `naturalWidth`/
      `naturalHeight` valaient encore 0 (image pas chargée) — l'initialiseur
      one-shot de `useState` retombait alors sur un repli à 100 %, jamais
      recorrigé vers le vrai « ajuster » une fois les dimensions connues
      (la logique de re-plancher ne fait que REMONTER un zoom trop bas,
      jamais redescendre un zoom trop haut). Corrigé par un ref `touched` :
      tant que l'utilisateur n'a rien demandé lui-même, tout recalcul de
      `fitPct` RESYNCHRONISE le zoom au lieu de se contenter d'un plancher.
    - `PhotoEditor.tsx` recalculait `displayScale()` en lisant
      `canvas.getBoundingClientRect()` — correct tant que le zoom n'existait
      pas, mais structurellement en retard d'un rendu une fois que
      `canvas.style.width` devient un choix délibéré : le rendu qui pose le
      cadre de recadrage lit la taille CSS d'AVANT que l'effet de CE MÊME
      rendu ne la change. Mesuré : le cadre dérivait hors de sa région à
      chaque palier de zoom. Corrigé en lisant `zoom.displayScale`
      directement (une valeur déjà synchrone avec le rendu), plus une
      lecture DOM du tout.
    - Molette+Ctrl sur `onWheel` (React, synthétique) ne zoomait pas
      vraiment : React pose ce gestionnaire en PASSIF par défaut, donc
      `preventDefault()` ne fait rien (confirmé par l'avertissement console
      « Unable to preventDefault inside passive event listener
      invocation ») — le zoom natif de la page aurait pu se déclencher en
      même temps. Corrigé par un VRAI `addEventListener('wheel', ...,
      {passive:false})` posé directement sur le stage, hors du système
      synthétique de React.
    Un quatrième piège, purement CSS, a été anticipé puis confirmé en
    testant plutôt que découvert en production : `items-center
    justify-center` sur un conteneur `overflow:auto` déclenche le
    « safe centering » de CSS Box Alignment dès que son contenu déborde,
    ce qui décale la plage de défilement d'une façon que les calculs de
    `scrollLeft`/`scrollTop` du zoom ne peuvent pas deviner — mesuré : le
    cadre de recadrage se retrouvait à des coordonnées NÉGATIVES après
    quelques clics sur « + ». Remplacé par `margin:auto` sur le canvas
    (ou son wrapper) : un mécanisme de centrage différent, qui ne fait
    jamais intervenir ce repli « safe » et retombe simplement à 0 dès que
    le contenu déborde — le calcul de défilement redevient un simple
    rectangle ancré en haut-à-gauche.
    Un cinquième, apparenté : les boutons de zoom (et le bandeau « glisser
    sur l'image » de 7b) doivent vivre HORS du conteneur défilant — un
    enfant `position:absolute` fait partie du contenu qui défile (seul
    `position:fixed` y échappe), donc un bouton codé « en bas à droite du
    stage » dérivait hors champ dès qu'on zoomait, entraînant le
    `scrollIntoViewIfNeeded()` du test dans une course sans fin. Le stage
    de chaque écran est désormais scindé en un EXTÉRIEUR non-défilant
    (`position:relative`, porte les contrôles) et un INTÉRIEUR défilant
    (`overflow:auto`, porte le canvas).
    Suite complète rejouée verte (`test_editor.js` +4 étapes, `test_
    photo_editor_advanced.js` +2 étapes) ; le seul échec restant
    (`test_review`, venv de dev sans `cv2`) est la même limitation connue
    et sans rapport, déjà notée dans l'entrée précédente.
- Le patron d'interface du compositeur de scène (tabs + panneaux + champs
  de prompt + catalogues + navigation Suivant/Précédent) est candidat à
  être repris par les outils ci-dessus, mais **pas généralisé en composant
  partagé avant un deuxième vrai consommateur** — cohérent avec CLAUDE.md
  contre l'abstraction prématurée
- **Renommage nav « Banque » → « Ateliers », fait, 2026-09-04** — le mot
  « Banque » ne décrivait pas correctement ce sous-menu (composeur de
  scènes + éditeur de poses + éditeur de tons). Uniquement le libellé de
  nav et tout texte visible (aria-label, data-hint-text, titres, messages
  de confirmation/erreur) sur `routes.ts`, `BankScreen.tsx`,
  `SceneInspector.tsx`, `DirtyBar.tsx`, `WorldBanner.tsx`,
  `useSceneWorkbench.tsx`, `WorldPlacesScreen.tsx`,
  `ScenesStoreContext.tsx`, `SceneComposer.tsx`, `runSummary.ts`,
  `ExpressionEditorScreen.tsx`, `PoseEditorScreen.tsx`,
  `produce/SceneCard.tsx`, `produce/SceneDevelopPanel.tsx` — jamais les
  clés internes (`key: 'bank'`, routes `/bank/*`, ids `#bankView`/
  `#bankDocument`, noms de fichiers/composants), jamais les commentaires
  de code ni les fichiers générés (`schema.d.ts`, `openapi.json`).
  « Ateliers » (majuscule) quand le texte cite l'écran/la destination,
  « atelier » (minuscule, singulier) quand le texte désigne LE document
  d'un personnage précis. Un vrai bug de sélecteur trouvé en testant : la
  fumigation `test_pose_editor.js` cliquait `a:has-text("Retour à la
  banque")`, cassé par le renommage — corrigé. Six fumigations
  (`test_bank`, `test_pose_editor`, `test_produce`, `test_expression_editor`,
  `test_pose_bank`, `test_pose_extract`) rejouées vertes ; confirmé à
  l'écran (capture) que l'entrée de nav s'affiche bien « Ateliers » et
  reste allumée sur `/bank/*`.

## V2 — Extensions

- Mise en scène de plusieurs personnages ensemble (verrous d'identité
  multiples actifs simultanément dans une même génération)
- Univers "art pur"
- Vidéo (Wan 2.2) et voix (ACE-Step) intégrées au pipeline généralisé, pour
  l'influenceur comme pour le RPG-personnage — le registre de création les
  a déjà déclarées en V1 (J4), il reste à brancher les workflows
- Vidéo NSFW

## V3 / plus tard

- Univers "monde RPG" complet (lore, carte, PNJ secondaires, histoire,
  dialogue, persistance) — mini-application à part entière, pas un outil
  parmi d'autres
- **Intégration MCP** : exposer les actions de la plateforme (créer une
  scène, lancer une génération, consulter le contenu d'un personnage) comme
  outils MCP pour des assistants généralistes. À garder en tête dès la V1
  dans la conception de l'API interne (routes propres, typées, sans effet
  de bord caché) pour que l'exposition MCP soit un ajout plus tard, pas une
  réécriture
- Passage du dépôt en public (dépend de la séparation données/code posée
  en J1)

## Exigence transverse — pas un jalon, continue sur tous les jalons

Qualité et repérabilité des bugs (backend et frontend) :
- Pas de commit sans test du module touché (déjà posé)
- Logs structurés plutôt que prints épars
- Erreurs remontées explicitement à l'interface plutôt qu'échouées en
  silence
- Health-check étendu au niveau plateforme (pas seulement Léna), une fois
  la base = source de vérité en place (J0)
- Fumigations navigateur (Playwright, installé hors du repo — le repo n'a
  aucune dépendance) : `AUTOMATION/tests/run_browser_tests.py`, un tableau
  de bord neuf par test. Couvre registre, wizard, écran Créer, aperçu de
  prompt, banque de poses, éditeur photo (7 tests). Mis en place pendant la
  passe frontend post-J7bis, avec un bug réel corrigé au passage
  (`pose_tools.extraire` écrasait un squelette au lieu d'en ajouter un)
