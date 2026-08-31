---
paths:
  - "AUTOMATION/**/*.py"
---

# Conventions backend de la plateforme

## Stack — et ce qu'on n'utilise volontairement pas

FastAPI + uvicorn (migration du 30/08/2026 ; c'était aiohttp avant, et
ce fichier annonçait Flask — voir AUDIT §0 et §7.6). SQLite en accès
direct (AUTOMATION/base.py). Pas d'ORM (SQLAlchemy ou autre), requêtes
SQL paramétrées à la main, pas de query builder.

Pydantic **est** utilisé, et seulement là où il a un sens : un schéma
par forme de payload réellement échangée, à la frontière HTTP. Pas de
schéma fourre-tout, et rien de déclaratif dans le cœur métier —
`AUTOMATION/runner/`, `identity/`, `base.py` ne connaissent ni HTTP ni
Pydantic. Deux règles qui ne se devinent pas :

- une réponse qui relaie un fichier que cette couche ne possède pas
  (`config.json`, une ligne de journal, un palier de `creative.json`)
  se déclare `extra="allow"` ou sans `response_model` : tronquer une
  clé inconnue casserait le front loin du changement ;
- une borne serveur qui **écrête** (`count`, `limit`, `lot`) ne devient
  jamais une contrainte `ge`/`le`. `count=9999` doit continuer à rendre
  200 avec un plan de 24 images, pas un refus.

**Un seul worker uvicorn.** `STATE`, `UNDO` et le QC d'identité en
cache sont des globales de process (`web/shared_state.py`). Le lanceur
passe l'objet application à `uvicorn.run`, ce qui rend `--workers > 1`
techniquement indisponible : un seul GPU, un seul batch.

## Frontière des modules

AUTOMATION/ : un module = une responsabilité. Ne jamais y mettre de
logique métier de graphe ComfyUI — les réglages vivent dans
CHARACTERS/<nom>/config.json, les scènes dans scenes.json, jamais en dur
dans le code (invariant CLAUDE.md §8.4).

Découpage du backend web (ROADMAP.md, J2 ; routers inchangés par la
migration FastAPI) — une nouvelle route rejoint le router qui correspond
à sa responsabilité :
- api/routers/state — état du système, registres, fiche, journal
- api/routers/app — cycle de vie de ce serveur et de ComfyUI
- api/routers/bank — banque de scènes, taxonomie, composeur
- api/routers/images — images, miniatures, poses
- api/routers/production — lancement de génération, file de jobs
- api/routers/review — QC, revue, jugements, export

**Une règle de dépendance, une seule** (31/08/2026) :

    routers  ->  services  ->  runner / base / shared_state

et jamais l'inverse. Un router lit la requête, appelle un service, et
traduit ce qu'il reçoit en code de statut. Un service ne connaît pas
`fastapi` : il refuse par `ss.bad_request()` et rend du Python nu. Un
modèle Pydantic peut le traverser (c'est la forme du payload, pas un
transport) ; une `JSONResponse` non — une fonction qui doit choisir un
403 reste dans le router.

- api/services/creative — règles des paliers d'intensité
- api/services/batch — superviseur de lot (un seul chemin de lancement)
- api/services/bank — validation de banque, backup, stats des cartes
- api/services/journal — ligne en base, export, journal NSFW du tri
- api/services/preview — aperçu de prompt et échos entre fragments

Le test d'une règle vise le service, jamais le router : c'est ce qui a
motivé la couche (`test_valider_banque.py` importait `api.routers.bank`
pour tester une fonction pure).

Ce qui met en forme un fragment de réponse pour UNE route reste dans le
router — descendre trois lectures en service serait de la cérémonie.

`web/app.py` ne fait que le démarrage ; l'assemblage vit dans
`api/main.py`, les gardes dans `api/security.py` et `api/errors.py`.

Même logique côté runner batch : prompt / comfy / sortie / cli.

## Accès base de données

Une seule base, schéma commun, character_id en clé (CLAUDE.md §7) —
jamais de connexion ou de fichier de base séparé par personnage. Toute
requête qui touche des données de personnage prend character_id en
paramètre explicite.

## Configuration

Aucun seuil ni réglage en dur dans le code. Tout se lit depuis
CHARACTERS/<nom>/config.json via l'API (CLAUDE.md §8.4).

## Erreurs et logs

Logs structurés plutôt que print() épars. Une erreur remontée au frontend
explicitement plutôt qu'un échec silencieux ou un code 500 nu.

Toute réponse porte un corps JSON, succès comme échec — le front lit du
JSON sur chaque réponse quel que soit le statut. Une erreur a la forme
`{"ok": false, "erreur": "<texte français destiné à l'écran>"}` ;
`ss.bad_request()` est le point de passage. Les messages d'erreur restent
en français (ils s'affichent tels quels), le code reste en anglais.

## Tests

- Toute route/fonction généralisée est accompagnée d'un test qui aurait
  détecté un mélange de données entre deux personnages
- L'assembleur de prompt d'un personnage est verrouillé par un test à
  l'octet près dès sa création (CLAUDE.md §8.3)
- Pas de commit sans lancer les tests du module touché

## Si le fichier touche un workflow ComfyUI

Voir le skill workflow-comfyui — le backend lit les workflows, ne les
réécrit jamais.
