# ADR-0021 : Banc de comparaison de variantes — un graphe orchestré, pas un graphe possédé

## Statut

Accepté (2026-09-03) — précise ADR-0017/0018/0020, ne les supersède pas.

## Contexte

L'identité (InsightFace) et le réalisme (QC) sont déjà mesurés sur chaque
génération, seuils par personnage. Mais toute comparaison A/B d'un réglage
ou d'un étage de graphe se fait à la main, hors plateforme — le sweep
IPAdapter d'Abyssiaelle en J6 (qui a renversé l'hypothèse « IPAdapter
verrouille l'identité ») en est l'exemple qui a motivé ce chantier. Ce
chantier en fait la **deuxième** capacité de plateforme, après l'upscale
(J8.4, ADR-0020).

**Différence de nature avec l'upscale, qui change la conception.** L'upscale
opère sur une image déjà produite et porte son propre graphe ComfyUI
autonome (`WORKFLOWS/platform/upscale_ui.json`). Le banc compare des
**réglages de génération** (poids d'identité, sampler, scheduler, steps,
cfg, étage optionnel) — des valeurs injectées dans le graphe de
**production du pack** par `WorkflowRunner`/`identity.apply()`. Le banc ne
porte donc **aucun graphe à lui** (invariant 10) : il orchestre le graphe
que le pack fournit déjà, en faisant varier UN champ de config à la fois.
C'est ce qui le rend agnostique de la famille de modèle malgré des réglages
qui, eux, sont pack-spécifiques — le banc ne les comprend pas, il applique
une surcharge générique dont l'appelant lui donne le chemin.

**Le point qui force à toucher `execute_jobs`.** `sort_and_export` écrivait
toujours dans `PROD/<CID>/<verdict>/`, et le rangement des mesures
(`ranger_mesures`) écrivait toujours dans `mesures.json` et les tables
partagées (`image`/`score`/`batch`). Sans changer `execute_jobs`, un banc
pollue forcément la Revue, l'export, et toute requête qui suppose que
`image` ne contient que de la vraie production. La contrainte « passe par
`execute_jobs`, jamais un chemin parallèle » ET « ne pollue pas `PROD/` »
ne sont réconciliables qu'en donnant à `execute_jobs` un point d'extension
**optionnel**, jamais activé par un appelant existant.

## Décision

### 1 · `execute_jobs` gagne un paramètre `sink=None`

`AUTOMATION/runner/sortie.py::Sink` (`NamedTuple` : `dest_root`, `record`).
`sink=None` (défaut) laisse `execute_jobs` **strictement inchangé** pour
tout appelant existant (CLI, web, `nsfw_batch`, `upscale.py`) — vérifié par
la suite de tests existante rejouée sans une assertion changée. Fourni,
`sink` redirige **trois** choses à la fois, pas seulement le rangement :
`sort_and_export` range sous `sink.dest_root` et n'exporte jamais ;
`sink.record(job, verdict, score, reel, dest)` remplace `ranger_mesures()`
(jamais les deux) ; `append_log` (journal CSV + `ecrire_en_base`) est
sauté entièrement.

### 2 · Trois tables dédiées, pas une réutilisation taguée de `image`/`score`

`bench_run` / `bench_variant` / `bench_score` (`AUTOMATION/base.py`),
séparées de `image`/`score`/`batch`. Mélanger banc et production dans les
mêmes tables mettrait en risque tout ce qui les lit sans s'attendre à du
bruit de banc (`test_coherence_base.py`, `reference_set`/
`reference_member`). La mesure elle-même (`checker.mesure`,
`qc_realisme.mesure`) reste la même fonction — seule la **persistance**
change de table.

### 3 · Disque : `PROD/<CID>/_BENCH/<bench_id>/<variante>/<verdict>/`

Invisible par construction pour Revue/Galerie : ces routes ne font jamais
un `iterdir()` de `PROD/<CID>/`, elles construisent toujours un chemin
depuis un bucket connu (`shared_state.bucket_dir`) — même garantie que
`_NSFW/` déjà.

### 4 · Liste blanche d'axes, un seul axe garanti par le code

`AUTOMATION/bench.py::CFG_AXES` (chemin dans `cfg` : poids d'identité,
steps, guidance, refiner, facedetailer, upscale_2k, grain_export) et
`JOB_AXES` (`sampler_name`/`scheduler`, posés sur `job["overrides"]` — pas
dans `cfg`, extension minimale et rétrocompatible de
`WorkflowRunner.api_for()` qui ne les pilotait pas jusqu'ici).
`validate_variant_cfg()` calcule la différence structurelle entre le cfg
de la variante et la référence et **lève** `MultiAxisError` si elle touche
autre chose que le chemin déclaré — la garantie « un seul axe change »
est vérifiée par le code, pas laissée à la discipline de l'appelant.

### 5 · Seeds explicites, jamais générés par le banc

`run_bench(character_id, scene, seeds, axis, values, ...)` exige `seeds`
en paramètre. Chaque variante (y compris la référence, ajoutée
automatiquement à la valeur ACTUELLE du personnage sur cet axe) lance
exactement `len(seeds)` jobs avec les mêmes seeds, dans le même ordre.

### 6 · Verdict : agrégation par genre déjà mesuré, jamais un seuil en dur

`cfg["bench"]` (`min_seeds`, `margin` par genre) — absente, `verdict_bench()`
lève `BenchConfigMissingError` plutôt que deviner une constante Python
(invariant 4). Par genre : `"insuffisant"` si `n < min_seeds` pour l'une
des deux variantes ; sinon `"amelioree"`/`"degradee"`/`"stable"` selon que
l'écart de moyenne dépasse `margin[genre]`. Verdict global : « meilleure
sur tous les axes suivis » seulement si CHAQUE genre est amélioré ou
stable, jamais une moyenne qui masquerait un genre qui recule.

### 7 · `PLATFORM/capabilities.json` : `bench.graph = null`, cas légitime

Pas une entorse à la forme `{graph, roles}` d'ADR-0018 : un capacité de
plateforme *peut* porter un graphe (upscale), elle n'y est pas *obligée*.
Le banc orchestre un graphe qu'il ne possède pas ; `graph: null` le dit
explicitement plutôt que d'inventer un graphe factice pour remplir le
champ.

## Alternatives envisagées

- **Une boucle dédiée pour le banc (comme `nsfw_batch.run()`)** — écartée :
  la contrainte du chantier est explicite (invariant 2). Contrairement à
  l'édition NSFW (préambule propre, garde-fou d'armement propre), le banc
  n'a besoin d'aucune règle qu'`execute_jobs` ne couvre pas déjà.
- **Réutiliser `image`/`score` avec un `bucket`/`espace` marqueur** —
  écartée : demanderait à chaque lecteur existant de ces tables
  (`test_coherence_base.py`, `reference_set`, un futur tableau de bord) de
  savoir filtrer le bruit de banc. Trois tables séparées ne demandent rien
  à personne.
- **Reference déclarée par l'appelant plutôt qu'auto-dérivée** — écartée :
  aurait pu diverger de la valeur réelle du personnage sans qu'aucune
  vérification ne le remarque. La lire depuis `reference_cfg` la rend
  toujours exacte par construction.
- **Un résolveur unifié pack+plateforme pour cette capacité** — écartée,
  même raisonnement qu'ADR-0020 : pas de second appelant pour le justifier.

## Conséquences

- `AUTOMATION/runner/sortie.py` : `Sink`, `execute_jobs(..., sink=None)`,
  `sort_and_export(..., sink=None)`.
- `AUTOMATION/base.py` : trois tables + `bench_creer_run`/
  `bench_enregistrer_variante`/`bench_enregistrer_score`/`bench_scores`.
- `AUTOMATION/runner/comfy.py` : `sampler_name`/`scheduler` optionnels sur
  le nœud `sampler`, posés seulement si `job["overrides"]` les fournit.
- `AUTOMATION/bench.py` (nouveau) : liste blanche, validation un-seul-axe,
  `run_bench()`, `verdict_bench()`.
- `PLATFORM/capabilities.json` gagne `bench` (`graph: null`).
- `PACKS/*/character_defaults.json` gagnent `bench` (`measured: false`,
  même statut que `qc`/`identity`) ; `AUTOMATION/tests/
  migrate_bench_config.py` backfille les personnages existants — sans quoi
  ils ne peuvent pas lancer de banc du tout (§6, pas de repli silencieux).
- Pas d'écran studio dans ce chantier : mécanisme + point d'entrée
  programmatique testé, comme l'upscale en J8.4. Un écran suivrait le
  skill `nouvel-outil` (patron 2) dans une session séparée.
