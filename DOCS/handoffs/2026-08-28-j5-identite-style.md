# J5 — Verrou d'identité par univers + style figé (terminé)

Commits : `daf0016` (ét. 1), `a01da86` (ét. 2), `fb187b7` (ét. 3), + cet
handoff/ROADMAP (ét. 4). Plan de référence : `wild-riding-crayon`. Étape 0
(hors J5) : réparation de `config.json` — voir plus bas.

Décisions actées avec l'utilisateur (AskUserQuestion) :
1. **`pulid_flux.py` = extraction complète** — les poids PuLID passent dans
   `config.json` / `identity`, injectés par le runner.
2. **`lora_sdxl.py` = stub documenté** → J6.
3. **Style câblé jusqu'au pipeline dès J5** — table style → effet dans
   `universe.json`, appliquée dans `api_for` (inerte pour Léna).

## État atteint

J4 avait laissé `universe.json` / `identity` et `output_styles` comme des
chaînes que rien ne consommait. J5 les rend effectifs, et sort les poids
PuLID de Léna du **widget du workflow** vers `config.json` (entorse §8.4
réparée, skill `nouveau-personnage` respecté).

### Étape 0 — Réparation `config.json` (hors J5, disque seulement)

`CHARACTERS/lena/config.json` avait été réécrit hors session : `nsfw.enabled:
true` réapparu en fin de bloc `nsfw` (valeur morte — `is_armed` lit
`character.json` — mais `test_character_registry.py [4]` rouge). Ligne
retirée. `config.json` est git-ignoré → pas de commit, réparation sur
disque. Cause probable : un dashboard **pré-J4** encore ouvert au démarrage
de session sur lequel une action NSFW a tourné l'ancien `api_nsfw_arm`.

### Étape 1 — Paquet `AUTOMATION/identity/` — `daf0016`

- `identity/__init__.py` : `get(name)` / `for_universe(uid)` (lit
  `universe.json` / `identity`). Contrat : `REQUIRED_ROLES` +
  `apply(api, roles, character_config, job)` qui modifie le graphe
  **converti** en place.
- `identity/pulid_flux.py` : réel. `REQUIRED_ROLES` = `ApplyPulidFlux` +
  `LoadImage "BASE GELEE"`. `apply()` injecte `weight/start_at/end_at`
  (`config.json` / `identity`) et l'image de référence (`config.json` /
  `base_gelee`). Rôle obligatoire absent → `RuntimeError` explicite.
- `identity/lora_sdxl.py` : stub, `apply()` lève `NotImplementedError` → J6.
- `qc_identity.py` (mesure InsightFace) **non touché** — reste commun à tous
  les univers (§4).
- `test_identity_registry.py`.

### Étape 2 — `config.json` / `identity` + câblage runner — `a01da86`

- `CHARACTERS/lena/config.json` : bloc `identity: {weight: 0.85, start_at:
  0.1, end_at: 1.0}` = **valeurs exactes du widget `ApplyPulidFlux`
  d'origine**, `_notes` mesurées.
- `WorkflowRunner.__init__(cfg, character_id="lena")` : résout
  `identity.for_universe(character_universe(cid))` ; `_roles()` intègre les
  `REQUIRED_ROLES` de l'impl ; `api_for` appelle `self.identity.apply(...)`
  en dernier.
- `execute_jobs` / `cli.py` enfilent `character_id` dans `WorkflowRunner`.
  (grep `WorkflowRunner(` : seulement ces 2 sites.)
- `test_identity_pulid_flux.py` : construit le **vrai** `WorkflowRunner`
  (ComfyUI requis, `IGNORE` sinon), vérifie que le graphe converti porte les
  valeurs de `config.json` **et** qu'elles égalent le widget d'origine
  (anti-dérive, §8.1).

### Étape 3 — Style figé + table style → effet — `fb187b7`

- `UNIVERS/*/universe.json` : `output_styles` **liste → map**
  `{ style: { prompt_add, checkpoint } }`. `instagram-influenceur` :
  `realiste` seul, effet nul. `rpg-personnage` : 4 styles déclaratifs
  (`prompt_add`/`checkpoint` à **mesurer** en J6).
- `universe.py` : `style_names(uid)`, `style_effect(uid, name)`
  (`UnknownStyleError`).
- `CHARACTERS/lena/character.json` : `output_style: "realiste"`.
- `prompt.py` : `character_style(cid)` ; `build_jobs` estampille
  `job["output_style"]` (donnée pour J6, hors du prompt → `test_build_jobs`
  byte-exact vert).
- `shared_state.character()` : refuse en 400 un `output_style` hors de la map
  de l'univers. **Aucune route ne l'écrit** (gelé comme `universe`).
- `WorkflowRunner` : `self.style = style_effect(univers, style_perso)`,
  appliqué dans `api_for` — `prompt_add` en fin de prompt positif, swap de
  checkpoint (rôle optionnel) si non-null. Léna `realiste` → **prompt et
  graphe inchangés** (vérifié via le vrai runner).
- `/api/character` : renvoie `output_style` + `style_names(uid)`.
- ADR-0011. `test_style_fige.py`.

## Vérification

- Suites non-GPU vertes : Python (13, dont `test_identity_registry`,
  `test_identity_pulid_flux`, `test_style_fige`, `test_build_jobs`
  byte-exact) + node-stub (2) + fumigations navigateur (3 —
  `test_ecran_creer` [1b] en-tête registre inchangé). `test_apercu_prompt` /
  `test_pose_scene_card` par défaut sur `:8189`, penser à `DASHBOARD_URL`.
- `wf_check.py --roles WORKFLOWS/content/lena_master_prod_ui.json` → vert
  (les rôles d'identité sont vus).
- **Génération réelle** (ComfyUI up) :
  `run_batch.py --character lena --limit 1 --seed 424242 --no-variants` →
  `cafe_terrasse (4:5) : OK (0.808) 56s -> lifestyle_cafe_terrasse_20260828_01.png`.
  Score d'identité **0.808** (≥ `threshold_ok` 0.72, verrou fermement
  appliqué). L'injection PuLID depuis `config.json` produit un résultat
  normal — le pipeline de Léna n'a pas bougé (§8.1). Image dans
  `PROD/LENA/OK/` + journal + base — **décision utilisateur : garder ou
  retirer** (image Léna valide, pas un déchet de test).
- Skills `nouvel-univers` / `nouveau-personnage` mis à jour (signature réelle
  de l'interface `apply(api, roles, character_config, job)`, `config.json` /
  `identity`, `character.json` / `output_style`).

## Ce qui reste ouvert

- **Branche NSFW** : `nsfw_batch.NsfwRunner` garde son propre
  `ApplyPulidFlux` baké (id 28, poids `[0.9, 0.05, 1.0]` — tuning délibéré
  différent de la passe SFW). À replier dans `identity/` quand le NSFW est
  généralisé comme outil (J7) — asymétrie assumée, ADR-0011.
- `lora_sdxl.py` reste un stub jusqu'à J6 (aucun workflow SDXL ni personnage
  rpg pour valider le contrat).
- `output_styles` de `rpg-personnage` : `prompt_add`/`checkpoint` des styles
  non-`realiste` sont des placeholders — à **mesurer** à l'onboarding
  d'Abyssiaelle.
- Rôle `checkpoint` du runner : résout à `None` sur le graphe Flux de Léna
  (checkpoint all-in-one non titré par ce rôle) ; sert aux univers
  multi-styles (J6).
- Dette J2/J3 inchangée : disposition disque `PROD/<X>/` par personnage, axe
  `space`, `UNDO`, déplacement des `WORKFLOWS/*.json` sous `CHARACTERS/`.
- `config.json` réécrit hors session (étape 0) : si un dashboard tourne en
  permanence sur le poste, il sert du code pré-J4/J5 — le redémarrer.

## Prochaine étape attendue

`ROADMAP.md` : **J6 — Premier personnage RPG (Abyssiaelle) opérationnel**
(`build_jobs` + assembleur de prompt verrouillé byte-exact, `lora_sdxl.py`
réel, banque de scènes de son univers, workflow SDXL de production). Ne pas
démarrer sans feu vert explicite.
