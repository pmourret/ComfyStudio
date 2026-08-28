# J6 — Premier personnage RPG (Abyssiaelle) opérationnel (terminé)

Commits étapes 1-5 : `4149df6`..`a25bfae` (scaffolding registre, `lora_sdxl.py`
réel, workflow SDXL de production, câblage style/runner, base gelée réelle).
Ce handoff couvre les étapes 6 (mesure) et 7 (build_jobs + banque),
terminées dans cette session à partir des images déjà curées par
l'utilisateur (`H:\...\ComfyUI\output\abyss1a_curated`).

## Constat central — le plan d'identité de J5 ne tient pas pour Abyssiaelle

J5 avait retenu IPAdapter FaceID comme mécanisme d'identité par défaut pour
`rpg-personnage`, avec un LoRA de personnage optionnel « en plus ». La
mesure réelle (sweep sur ComfyUI, pas une supposition) montre l'inverse :

- Score InsightFace contre `ABY_MAIN_REF.jpg`, même seed/prompt/LoRA, poids
  IPAdapter croissant (0.3 → 2.0) : **0.40 → 0.35 → 0.32 → 0.24** — le score
  BAISSE quand le poids IPAdapter MONTE.
- IPAdapter seul, sans LoRA, poids 1.5 : **0.09** — pire que deux visages
  différents (des images de Léna contre `ABY_MAIN_REF.jpg` scorent 0.28-0.29).
- LoRA de personnage seul (poids IPAdapter à 0.0, déjà présent dans le
  graphe mais bypassé) : **0.51-0.63** sur 6 seeds, cadre neutre — bat toute
  combinaison avec IPAdapter actif.

Le LoRA en question (`abyss1a_v1.safetensors`) existait déjà : entraîné hors
plateforme via kohya_ss le 20/07/2026, 53 images (mot déclencheur `abyss1a`),
et déjà câblé dans le graphe de production comme groupe bypassé
(« 02 LORA PERSONNAGE (bypass) »). Le dossier `abyss1a_curated` fourni par
l'utilisateur est ce jeu d'entraînement, pas un jeu de QC post-verrou — les
scores très étalés qu'on y mesure (0.36 à 0.997) sont normaux pour des
photos d'entraînement à angles/lumières variés, pas un signal de bug.

**Retenu** : poids IPAdapter neutralisé à `0.0` (le rôle reste dans le
graphe — l'univers n'est pas remis en cause), LoRA à pleine force (1.0).
Documenté dans `CHARACTERS/abyssiaelle/config.json` (git-ignoré) et dans
`AUTOMATION/identity/lora_sdxl.py`. **Ce n'est pas une règle d'univers** :
un futur personnage `rpg-personnage` avec une meilleure base de référence
peut très bien mesurer un poids IPAdapter non nul — c'est une mesure PAR
personnage, comme partout ailleurs dans ce fichier.

## Deux bugs réels trouvés en exerçant le pipeline pour de vrai

1. **`WorkflowRunner.api_for()` (`AUTOMATION/runner/comfy.py`)** — le nœud
   `LoraLoaderModelOnly` reste bypassé (mode 4) dans le graphe tant que rien
   ne force son mode actif avant `ui_to_api.convert()` — même mécanisme que
   la pose, jamais câblé pour le LoRA de personnage. Sans le fix,
   `identity.apply()` (qui écrit dans `api[str(role["id"])]` après le
   `convert()`) aurait levé un `KeyError` brut au lieu du `RuntimeError`
   explicite qu'il croit pouvoir lever sur un rôle absent. Corrigé (ajout
   `node_modes[lora_role["id"]] = 0` quand `identity.lora.name` est
   renseigné) ; test de non-régression dans `test_model_family_sdxl.py`
   section [4] (active ET inactive).
2. **`runner/cli.py` + `runner/sortie.py`** — accès directs
   `cfg["preset"]["refiner"]` / `cfg["export"]["enabled"]` sans `.get()` :
   cassait tout personnage dont le graphe n'a pas encore ces étages
   optionnels (Abyssiaelle n'a ni refiner, ni facedetailer, ni grain, ni
   export configuré au départ). `cli.py` corrigé pour utiliser `.get()`
   partout, comme `WorkflowRunner`. `config.json` d'Abyssiaelle a reçu sa
   propre clé `export` (mêmes valeurs que Léna — réglage technique, pas une
   mesure de personnage).

## Étape 7 — build_jobs + banque de scènes

`CHARACTERS/abyssiaelle/scenes.json` + `creative.json` réels et **minimaux**
(2 scènes RPG — `portrait_etude`, `camp_soir` —, 2 intentions, 2 tons) :
pas une banque exhaustive, elle grandit à la main depuis le Dashboard
(ROADMAP J6, confirmé — pas de génération LLM déclarative). Le ton `sombre`
porte une note explicite : la mesure étape 6 montre qu'un éclairage
coloré/faible fait chuter le score d'identité (0.23-0.40 même avec le
réglage retenu) — un choix créatif assumé, pas un bug.

Verrouillé par `test_build_jobs_abyssiaelle.py` (nouveau) : oracle
indépendant de l'assemblage réel (pas un appel circulaire à `build_jobs`
lui-même), garde-fou visage, et vérification que le mot déclencheur du LoRA
n'est PAS dans le prompt assemblé par `build_jobs` — il est injecté par
`identity.apply()` depuis `config.json`, le dupliquer le répéterait deux
fois dans le prompt final.

## Vérification réelle bout en bout

```
run_batch.py --character abyssiaelle --scene portrait_etude --no-variants --seed 999001
```
→ `portrait_etude (1:1) : OK (0.663) 8s`. Fichier dans
`PROD/ABYSSIAELLE/OK/portrait_etude_20260828_01.png`, export dans
`PROD/EXPORT/abyssiaelle/portrait/portrait_etude_20260828_01.jpg`, ligne
base confirmée par requête directe (`character_id='abyssiaelle'`, scores
`identite`/`nettete`/`texture_visage`/`bruit_fond` enregistrés). Image
gardée comme premier contenu réel de production, pas un déchet de test
(même décision que la première génération réelle de Léna en J5).

Suite de tests relancée après tous les changements : `test_build_jobs`
(Léna, non-régression), `test_build_jobs_abyssiaelle` (nouveau),
`test_model_family_sdxl`, `test_style_fige` (fixé — voir plus bas),
`test_identity_pulid_flux`, `test_identity_registry`, `test_universe_registry`,
`test_character_registry`, `test_character_param`, `test_cross_character`,
`test_coherence_base`, `test_valider_banque`, `test_suppression_edition`,
`test_tri_export`, `test_serveur_http` — tous verts.

`test_style_fige.py` section [6] a dû être ajusté : il testait que le style
`realiste` n'altère pas le prompt, mais chargeait `config.json`
d'Abyssiaelle tel quel — qui porte maintenant un vrai
`identity.lora.trigger_word`, un mécanisme d'IDENTITÉ séparé du style. Le
test neutralise maintenant `identity` explicitement pour isoler ce qu'il
teste réellement (même ajustement que fait déjà `test_model_family_sdxl`
pour son propre cas « sans LoRA »).

## Ce qui reste ouvert (pas un blocage J6)

- `qc.threshold_ok/watch/high` (0.50/0.35/0.60) mesurés sur ~20 générations
  de test, PAS sur un journal de production accumulé — provisoires, même
  statut que `threshold_high` de Léna. À recalibrer avec plus de données
  réelles.
- Pas de refiner/FaceDetailer/grain/upscale dans le graphe de production
  d'Abyssiaelle pour l'instant — `preset` ne porte que `guidance`/`steps`.
  À mesurer si une prochaine étape le justifie (pas demandé par J6).
- Un seul format (`1:1`) — gamme complète hors scope tant qu'aucune scène
  réelle ne la demande.
- Dette J2/J3 inchangée (axe `space` nommé `lena` par convention historique,
  `UNDO` non scopé) — hors périmètre de ce chantier, déjà noté aux jalons
  précédents.

## Prochaine étape attendue

`ROADMAP.md` : **J7 — NSFW généralisé comme outil, pas comme branche**. Ne
pas démarrer sans feu vert explicite.
