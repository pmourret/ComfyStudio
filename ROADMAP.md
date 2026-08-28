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
- Opérationnel pour `J1` : `PROD/comfystudio.db` est git-ignoré, ne voyage pas
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
  `comfystudio` (`.mcp.json`, `PROD/comfystudio.db`). Restent nommés
  d'après Léna, volontairement : la valeur `character_id="lena"` elle-même
  (c'est le bon identifiant, pas un nom à généraliser), les fichiers de
  workflow ComfyUI (`WORKFLOWS/*/lena_*.json` — renommage risqué et propre
  à J4/J6 quand la structure univers/personnage sera tranchée), et les
  préfixes de namespace `_LENA_EXPR_`/`_LENA_NSFW_SRC_` (évitent une
  collision, pas des noms de code)
- Embeddings/centroïde non régénérés ici (`backfill_embeddings.py`
  demande le GPU) — à lancer une fois qu'une génération réelle démarre
  dans ce repo
- Audit des skills Léna vs ComfyStudio fait, puis porté : `workflow-comfyui`
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
  `UNDO` non scopé, branding de l'en-tête.

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

**J7bis — Modèle à quatre axes + shell studio + wizard**
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
- `CLAUDE.md` §3–§4 mis en cohérence ; `wf_check.py` privé de son repli
  `CHARACTERS/lena/`
- Skills à réaligner en fin de jalon, quand le code aura figé le
  vocabulaire : `nouveau-personnage`, `nouvel-univers`, `workflow-comfyui`
- Hors périmètre : renommage `UNIVERS/`→`PACKS/`, mode Éditeur, look et
  peaux de monde, câblage des assets de monde dans le runner, mesure du
  verrou dans le wizard

**J7 — NSFW généralisé comme outil, pas comme branche**
- Flux confirmé : génération de personnage → sélection manuelle de l'image
  → reprise en NSFW → édition par IA → retouche
- Recomposé à partir des outils déjà prévus (modification live par IA +
  éditeur d'image) — pas de sous-système séparé
- Réglage dans le paramétrage de l'app, off par défaut

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
