# ADR-0019 : Le monde fournit le vocabulaire créatif de base, le personnage surcharge et étend

## Statut

Accepté (2026-09-03) — précise ADR-0014/0015, ne les supersède pas.

## Contexte

`scenes.json` et `creative.json` vivent dans `CHARACTERS/<id>/`. Les scènes
types, les tons et les intentions appartiennent pourtant au monde : c'est ce
qui se vend dans un pack. Sans un mécanisme d'héritage, un monde acheté
arrive vide et l'acheteur ressaisit tout à la main.

ADR-0014/0015 (31/08/2026) ont déjà construit ce mécanisme pour les
**scènes** : `WORLDS/<id>.json` porte un catalogue `places` vivant (le
cadre seul — `id`/`label`/`intention`/`prompt`, jamais une garde-robe) ;
une scène de personnage qui en hérite porte `world_ref` et ne stocke que son
overlay (`worlds.SCENE_OVERLAY_KEYS`) ; `worlds.merge_scene()` refait le
cadre à la lecture, mais **jamais dans `build_jobs`** — la fusion vit à la
Banque et à la création (ADR-0015 §4), pour que le test à l'octet près
(`tests/test_build_jobs.py`) n'ait jamais à en tenir compte. Ce mécanisme
existait, mais n'avait jamais été exercé sur les données réelles : les 16
scènes de Léna et les 2 d'Abyssiaelle sont restées `origin: "manual"` depuis
leur migration de tampon (ADR-0014), et les catalogues `places` des deux
mondes ne portaient que 2 lieux placeholders chacun.

Rien d'équivalent n'existait pour les **intentions et les tons** :
`WORLDS/<id>.json` n'avait qu'un `tone` singulier (l'ambiance UI, ADR-0012),
pas de vocabulaire structuré. Les 9 intentions et 5 tons de Léna, les 2 et 2
d'Abyssiaelle, étaient entièrement piégés dans leur `creative.json`
personnel.

Différence technique entre les deux qui a guidé la décision : `build_jobs`
va chercher `intention.prompt_add` / `tone.prompt_add` **au moment du
lancement**, via `by_key(creative.get(...), key)`, sans étape de
matérialisation équivalente à celle des scènes. Faire vivre le catalogue de
base au monde exige donc que la fusion ait lieu **avant** que `build_jobs`
ne lise `creative`.

## Décision

### 1 · Scènes : le mécanisme d'ADR-0014/0015 est utilisé, pas réinventé

Les scènes réelles de Léna et d'Abyssiaelle deviennent des lieux
(`WORLDS/slow-life.json` / `WORLDS/terres-sauvages.json`, catalogue
`places`) ; leurs entrées dans `scenes.json` gagnent `world_ref` +
`origin: "world"` et perdent `label`/`intention`/`prompt` comme vérité
propre — ces trois clés restent **matérialisées sur le disque**,
recalculées par `worlds.merge_scene()` à chaque écriture (Banque,
migration), exactement comme le prévoyait déjà ADR-0015. Zéro changement
dans `build_jobs`, zéro changement dans la règle : cet ADR ne fait
qu'exécuter, sur les deux banques réelles, ce qui était déjà écrit.

### 2 · Intentions/tons : `WORLDS/<id>.json` gagne `intentions` et `tones`

Même forme par entrée que `creative.json` aujourd'hui. Résolution **par
`key`**, personnage prioritaire : le personnage part de la base du monde ;
une `key` qu'il porte **remplace entièrement** l'entrée du monde (jamais une
fusion champ à champ — même logique que `config.json` sur
`character_defaults.json`) ; une `key` neuve **s'ajoute** ; une entrée du
monde qu'il ne mentionne pas reste **héritée**, visible.

`intensity` et `assemblage` ne font jamais partie de la fusion : liés au
pack (capacités, ADR-0018), pas au monde.

### 3 · La fusion vit dans `load_creative()`, pas dans `build_jobs`

`AUTOMATION/runner/prompt.py::load_creative()` — déjà le point d'entrée
unique qu'utilisent `build_jobs`, `services/creative.py`, `routers/bank.py`
et `routers/state.py` — fusionne désormais `worlds.merge_creative_vocab()`
par-dessus la fiche du personnage avant de la rendre. Un seul endroit
change ; tous les appelants héritent de la fusion sans être eux-mêmes
modifiés. C'est la même philosophie qu'ADR-0015 §4 pour les scènes (la
fusion vit en amont de l'assemblage), appliquée au seul endroit du chemin
`intentions`/`tons` qui la rend possible sans toucher `build_jobs`
lui-même.

## Alternatives envisagées

- **Matérialiser une fois à la création du personnage seulement** (comme
  `output_styles`/`character_defaults.json` aujourd'hui), sans fusion vivante
  ensuite — écarté : le monde resterait figé pour tout personnage déjà né dès
  qu'on éditerait son catalogue après coup, exactement le trou qu'ADR-0015
  a comblé pour les lieux. Le vocabulaire créatif mérite la même vivacité.
- **Fusion champ à champ plutôt que remplacement total d'une entrée** —
  écarté : une fusion partielle laisserait un champ du monde survivre
  silencieusement dans une entrée que le personnage croit avoir
  entièrement réécrite. Le remplacement total est explicite, prévisible,
  et cohérent avec la façon dont `config.json` recouvre déjà
  `character_defaults.json`.
- **Refusionner dans `build_jobs` lui-même** — écarté : c'est précisément
  ce qu'ADR-0015 §4 a refusé de faire pour les scènes, pour la même
  raison — ça ferait porter à l'assembleur de prompt une responsabilité
  qu'il n'a jamais eue, et compliquerait sa preuve à l'octet près.

## Conséquences

- `AUTOMATION/worlds.py` gagne `intentions()`, `tones()`, `_merge_by_key()`,
  `merge_creative_vocab()`.
- `AUTOMATION/runner/prompt.py::load_creative()` fusionne le monde —
  seul point touché sur le chemin de `build_jobs`.
- `WORLDS/slow-life.json` / `WORLDS/terres-sauvages.json` portent
  désormais le contenu réel migré de Léna et d'Abyssiaelle ; les 2 lieux
  placeholders de chaque monde qui recouvraient un lieu réel (même id ou
  même thème) sont retirés, les 2 sans recouvrement restent.
- La garantie « même prompt assemblé » est démontrée par
  `AUTOMATION/tests/migrate_world_catalogs.py` (balayage niveau × intention
  × ton, avant/après, sur les deux personnages réels) puis reconfirmée par
  `tests/test_build_jobs.py` et `tests/test_build_jobs_abyssiaelle.py`,
  rejoués sans qu'une seule assertion n'ait changé.
- Réserve écrite, pas résolue : les plages `tone.expression` de Léna sont
  mesurées contre son propre budget d'identité, pas contre une notion de
  monde. Migrées telles quelles faute d'un second personnage dans le même
  monde pour distinguer les deux aujourd'hui ; le mécanisme de surcharge
  (§2) permet déjà à un futur personnage de les corriger pour son propre
  visage sans toucher au monde.
