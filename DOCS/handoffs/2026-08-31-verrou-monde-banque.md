# Handoff — Le verrou de monde sur la banque de scènes

**Date** : 31/08/2026 · **Base** : `f55ffee`
**Portée** : ADR + backend. UI non ouverte, workflows non touchés.
**Statut** : clos. Banque / worlds / build_jobs verts, plus `test_character_create`.

## Le trou qu'on a bouché

ADR-0012 fige le monde à la création **côté personnage**. Côté banque, rien :
une scène était un objet nu, sans monde. Coller une scène de `terres-sauvages`
dans la banque d'une influenceuse `slow-life` passait sans un mot — alors que
la seule raison du gel est que les assets de monde entrent dans le rendu **et
dans la mesure du verrou d'identité**. Le monde était donc figé nulle part.

## Ce qui est écrit — ADR-0014

`DOCS/adr/0014-scene-composition-dans-un-monde.md`. Quatre décisions de fait
que le code prenait déjà en silence, plus celle qui manquait :

1. une scène est une **composition dans un monde**, elle n'en sort pas ;
2. la **tenue appartient au personnage** — un catalogue de monde n'habille
   pas ses scènes ;
3. `scenes.json` porte son monde **à la racine et sur chaque scène**, plus un
   `origin` (`world` | `manual` | `compose`) qui explique la provenance ;
4. **aucun graphe par scène** — la règle d'ADR-0012 §2, un cran plus bas.

## Ce que le serveur refuse maintenant

`POST /api/scenes` reçoit le monde du personnage (déjà validé par
`shared_state.character()`) et rend **400 en français** :

| Cas | Réponse |
| --- | --- |
| `world` racine absent ou différent | 400 |
| scène connue sans `world`, ou avec un `world` étranger | 400 |
| `origin` hors vocabulaire | 400 |
| **scène neuve** (absente de la version précédente) sans `world` | tamponnée, acceptée |

La dernière ligne est **la seule tolérance, et elle est bornée** : le Dashboard
construit une scène neuve dans le navigateur et ne connaît pas le monde.
`stamp_world()` l'écrit avant le disque — rien d'untagué n'atteint jamais
`scenes.json`, et naître n'autorise pas à porter un monde étranger.

> C'est le seul écart à « absent = refusé » : sans lui, « ajouter une scène »
> depuis le Dashboard rendait 400 tant que l'interface n'envoie pas le tampon.
> Le jour où elle l'envoie, l'exception se retire en supprimant deux lignes de
> `_world_problems` (la branche `not previous or sid in known`).

## Fichiers touchés

| Fichier | Ce qui change |
| --- | --- |
| `DOCS/adr/0014-…md` | l'ADR |
| `web/api/services/bank.py` | `_world_problems()`, `stamp_world()`, `KNOWN_ORIGINS` ; `validate_scene_bank(..., world=None)` |
| `web/api/routers/bank.py` | passe `lb.character_world(cid)`, tamponne avant écriture |
| `runner/prompt.py` | `create_character` : la banque **naît** tamponnée |
| `worlds.py` | `starter_scenes()` refuse un catalogue qui habille (`CHARACTER_ONLY_SCENE_KEYS`) |
| `tests/migrate_scenes_world.py` | migration, idempotente, `--dry-run` |
| 3 tests | verrou de monde, catalogue sans dressing, tampon à la naissance |

`validate_scene_bank(data)` **sans** `world` garde exactement l'ancien
comportement : un appelant sans contexte de personnage juge la forme seule.

## L'assemblage du prompt n'a pas bougé d'un octet

`world` et `origin` sont des clés de provenance : `build_jobs` ne les lit pas.
La migration le **vérifie elle-même** avant d'écrire, en comparant les prompts
produits avant/après sur la banque en mémoire. `test_build_jobs.py` et sa
fixture sont intacts.

## Migration passée sur ce poste

`python AUTOMATION/tests/migrate_scenes_world.py` — lena (slow-life, 20
scènes) et abyssiaelle (terres-sauvages, 2 scènes) tamponnées, `.bak`
`avant-world` posé, relance idempotente. `origin` mis à `manual` : ces scènes
sont antérieures à la notion d'amorce, les dire `world` serait affirmer une
provenance qu'on n'a pas.

**Un autre poste doit lancer cette migration** avant d'enregistrer une banque,
sinon 400 avec le message qui nomme le script.

## Tests lancés

`test_valider_banque` (32 ok) · `test_worlds_registry` (30 ok) ·
`test_build_jobs` · `test_build_jobs_abyssiaelle` · `test_character_create`.
Tous verts. Interpréteur : `.venv/Scripts/python.exe` (fastapi requis).

## Ce qui reste ouvert

- **Le frontend n'envoie pas encore `world`.** Il n'en a pas besoin
  aujourd'hui (relais verbatim de `data` + tolérance de naissance), mais
  l'écran Créer gagnerait à afficher le monde de la banque et l'origine de
  chaque scène — c'est ce que `origin` sert à rendre lisible en Réglages.
- `/api/compose` ne tamponne pas ses propositions : elles passent par la
  tolérance de naissance et ressortent `origin: "manual"`. Les marquer
  `"compose"` est un une-ligne dans le router, laissé de côté pour garder le
  commit petit.
- Les assets de monde ne sont toujours **consommés par personne** dans le
  runner (hors périmètre depuis J7bis, inchangé ici).
