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
- Reste : `web/app.py` → `web/routes/`

**J3 — Frontend**
- Passage en modules ES, plus de globales partagées entre fichiers
- Design system minimal commun
- Sélecteur de personnage (rechargement simple `?character=`)

**J4 — Registre univers + registre personnage**
- Registre univers : id, famille de modèle / mécanisme d'identité, panel
  d'outils
- Univers `instagram-influenceur` (Flux + PuLID) ← Léna, portée telle quelle
- Univers `rpg-personnage` (SDXL/Pony + LoRA/IPAdapter) ← Abyssiaelle,
  première implémentation réelle
- Registre personnage : univers associé, type(s) de contenu actifs
  (registre de création), NSFW on/off (off par défaut)
- Le registre de création liste les types de contenu (image, vidéo, voix,
  mise en scène à plusieurs) comme des types **communs à tout univers** —
  pas propres à un univers en particulier. En V1, seul `image` est actif ;
  `vidéo` et `voix` existent comme types déclarés mais inactifs, pour les
  deux univers (influenceur et RPG-personnage), afin de ne pas avoir à
  retoucher ce registre quand ils s'activeront en V2

**J5 — Style figé + verrou d'identité par univers**
- Style de sortie choisi et figé à la création du personnage, non
  modifiable ensuite (confirmé)
- `AUTOMATION/identity/` avec deux implémentations : `pulid_flux.py`,
  `lora_sdxl.py`

**J6 — Premier personnage RPG (Abyssiaelle) opérationnel**
- `build_jobs` + assembleur de prompt, verrouillé par un test byte-exact
  (comme Léna)
- Banque de scènes comme outil de son univers, création manuelle par
  l'utilisateur (pas de génération LLM déclarative — confirmé)

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
