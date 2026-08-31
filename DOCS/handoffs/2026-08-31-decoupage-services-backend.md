# Handoff — Découpage du backend en services

**Date** : 31/08/2026 · **Base** : `bd5ac17` (MCP projet désactivé)
**Portée** : backend seul. Le frontend suit dans une session à part.
**Statut** : clos. 24/25 tests Python verts, contrat d'API vérifié inchangé.

Suite du J2 (`web/app.py` → routers) et de la migration FastAPI du 30/08.
Le découpage en routers tenait ; ce qui ne tenait plus, c'est **ce que les
routers portaient**.

## Le constat, en une phrase

Les routers étaient minces sur le papier et gros en pratique :
`production.py` faisait 910 lignes dont ~250 de routes, et **une règle métier
n'était atteignable qu'en important un module FastAPI**.

Le symptôme était déjà dans le dépôt : `test_valider_banque.py` importait
`api.routers.bank` pour tester `validate_scene_bank`, une fonction pure qui
n'a jamais vu une requête HTTP.

## La règle posée

```text
routers  ->  services  ->  runner / base / shared_state
```

Sens unique. Un router lit la requête, appelle un service, traduit ce qu'il
reçoit en code de statut. **Un service ne connaît pas `fastapi`** : il refuse
par `ss.bad_request()` et rend du Python nu.

La frontière n'est pas cosmétique, elle se teste : un modèle Pydantic peut
traverser (c'est la forme du payload), une `JSONResponse` non. C'est pourquoi
`start_edit_from_image` est **resté** dans le router — il choisit entre un 403
et un 400, et ce statut est lu par le front.

## Ce qui est descendu

| Service | Ce qu'il détient | Venu de |
| --- | --- | --- |
| `preview` | aperçu de prompt, échos entre fragments | production |
| `creative` | verrous de paliers, règle d'export, mode édition | production |
| `batch` | superviseur de lot, un seul chemin de lancement | production |
| `bank` | validation, backup tournant, stats des cartes | bank |
| `journal` | ligne en base, export, journal NSFW du tri | review |

Et un router de plus : `routers/app.py`, les six routes `/api/app/*` sorties
de `state.py`. Deux métiers y cohabitaient — « que fait le studio », lu toutes
les 1,5 s, et « arrête ce process », destructif à chaque appel.

| Fichier | Avant | Après |
| --- | --- | --- |
| `routers/production.py` | 910 | 504 |
| `routers/state.py` | 549 | 401 |
| `routers/review.py` | 536 | 431 |
| `routers/bank.py` | 406 | 199 |

## Ce qui n'a PAS bougé, et pourquoi

- **`shared_state.py`** (475 lignes) : `STATE`, `UNDO` et le QC en cache sont
  les globales du worker unique. Le découper est un risque sans gain — la
  seule règle qui compte (les atteindre par l'objet module, jamais par un
  import de la valeur) est déjà tenue partout.
- **`world_brief`, `frozen_base_brief`, `seconds_per_image`** : ils mettent en
  forme un fragment de réponse pour une seule route chacun. Les descendre
  serait de la cérémonie, pas une frontière.
- **Aucun comportement.** Les blocs sont déplacés tels quels : même ordre
  d'application, mêmes messages français, mêmes statuts.

## Un bug attrapé en chemin

`services/bank.py` utilisait `pose_tools.POSE_DIR` sans importer `pose_tools`.
Les tests passaient — la banque de Léna ne déclenche pas cette branche — et un
contrôle d'imports morts ne voit pas ce défaut-là.

Filet mis en place : un vérificateur de **noms libres non définis** basé sur
`symtable` (il gère les fermetures, donc pas de faux positif sur les `hook` et
`on_event` imbriqués). Il tourne sur tout `AUTOMATION/` — 0 nom inconnu. Il vit
dans le scratchpad de session, pas dans le dépôt : à installer proprement le
jour où `pyflakes` entre dans l'environnement de test.

## Vérifications

- **Contrat d'API** : les 39 chemins comparés à `ui/src/api/openapi.json`
  versionné — aucun perdu, aucun ajouté. C'est le vrai garde-fou du découpage
  de routers, plus que les tests.
- **24/25 tests Python.** `test_apercu_prompt.py` est neuf : il verrouille la
  part de chaque fragment et le rapprochement `framing`/`frame`, le cas mesuré
  le 26/08 qui n'avait aucun test.
- `test_coherence_base` échoue, **antérieur et sans rapport** : 4 mesures NSFW
  sur disque absentes de la base (décalage de données locales, pas de code).

## Ce qui reste ouvert

- **Le frontend**, même geste : `ReviewScreen.tsx` (1051), `ProduceScreen.tsx`
  (966), `PhotoEditor.tsx` (827), `WizardScreen.tsx` (689).
- Le décalage `test_coherence_base` à rattraper (rejouer la mesure, ou migrer
  les 4 lignes).
- `pyflakes` dans l'environnement de test — voir F6, même famille que la
  Pillow manquante.

## Prochaine étape attendue

Découpage du frontend. Aucune raison de toucher au backend avant.
