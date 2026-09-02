# Handoff — Catalogue de monde vivant : héritage live + overlay personnage

**Date** : 31/08/2026
**Portée** : ADR + backend + frontend (écran Banque). `build_jobs` non touché.
**Statut** : clos. Registre monde / banque / création de personnage /
isolation verts.

## Le trou qu'on a bouché

ADR-0014 avait posé le tampon de monde sur une scène, mais avait laissé le
catalogue lui-même figé au sens fort : `starter_scenes` était copié à la
naissance d'un personnage par `create_character`, puis **oublié**. Éditer une
entrée dans `WORLDS/<id>.json` après coup ne changeait plus rien pour les
personnages déjà nés dans ce monde — le fichier versionné et la banque d'un
personnage divergeaient dès la première génération, sans que rien ne le dise.

## Où vit le catalogue

`WORLDS/<id>.json`, clé `places` (renommée depuis `starter_scenes` — même
forme : `id`, `label`, `intention`, `prompt`, un **cadre**, jamais une
garde-robe — `worlds.CHARACTER_ONLY_SCENE_KEYS` continue de refuser toute
tenue/pose/format/compte au chargement, ADR-0014 §2 inchangé).

Deux routes dédiées, `api/routers/worlds.py`, les seules à écrire ce fichier :

    GET  /api/worlds/{world_id}/places   le catalogue
    POST /api/worlds/{world_id}/places   remplace le catalogue ENTIER

`POST /api/scenes` n'y écrit jamais, quoi que le client envoie sur les clés
de cadre d'une scène liée à un lieu — voir plus bas.

## Comment la fusion marche

Une scène de personnage liée à un lieu porte `world` / `origin: "world"`
(ADR-0014, inchangé) plus un nouveau champ, `world_ref` — l'id du lieu. Elle
ne stocke **que** son overlay (`worlds.SCENE_OVERLAY_KEYS` : wardrobe, pose,
format, count, variants, tones, tags, intensity, guidance). `label` /
`intention` / `prompt` ne sont **jamais** fiables depuis ce que le client
envoie — `worlds.merge_scene(world_id, place_id, overlay)` les redérive à
chaque fois du catalogue actuel et les écrase.

Deux points de matérialisation, tous deux en amont de `build_jobs` :

1. **`create_character`** (`runner/prompt.py`) : la banque d'un personnage
   neuf est écrite avec des scènes déjà fusionnées — un personnage jamais
   ouvert dans le studio produit un prompt correct dès son premier
   lancement.
2. **`GET`/`POST /api/scenes`** (`api/services/bank.py`,
   `refresh_world_scenes`) : `GET` fusionne pour l'affichage ; `POST`
   fusionne **avant** `validate_scene_bank` (le prompt hérité doit exister
   avant le contrôle « prompt vide ») et avant l'écriture disque — c'est ce
   second point qui rend le fichier que `build_jobs` lira déjà à jour.

`build_jobs` lui-même n'a **pas changé d'une ligne** : il lit `scenes.json`
avec `load_json` et prend `scene["prompt"]` tel quel, exactement comme avant
cet ADR. `tests/test_build_jobs.py` et `test_build_jobs_abyssiaelle.py`
passent sans modification — c'est la preuve.

## La limite assumée du live

Un lieu édité **après** le dernier chargement/enregistrement de la Banque
d'un personnage n'atteint sa prochaine génération qu'après un aller-retour
par la Banque. `api/routers/production.py` ne refusionne pas avant
`build_jobs`. Décision délibérée (ADR-0015, alternatives envisagées) : la
fusion vit à la frontière où une scène est écrite ou affichée, pas à celle où
elle est lancée. Rouvrable plus tard si l'écart Banque → production s'avère
gênant en usage réel — ce serait deux appels de plus dans
`api/routers/production.py`, rien de plus.

## Ce qui casse volontairement, et ce qui ne casse pas

Un lieu retiré du catalogue **ne fait rien planter**. `refresh_world_scenes`
laisse la scène orpheline telle quelle (`UnknownPlaceError` attrapée
localement) ; c'est `validate_scene_bank` (« prompt vide ») qui refuse au
prochain `POST /api/scenes` — même esprit qu'ADR-0014 §4 : le serveur
refuse, il ne répare pas, et il ne fait pas tomber toute la banque pour une
référence morte.

## L'isolation, garantie par construction ET par test

Sauver la banque d'un personnage écrit `CHARACTERS/<id>/scenes.json` ;
éditer le catalogue écrit `WORLDS/<id>.json`. Deux fonctions, deux cibles, ne
se croisent jamais dans le code — mais l'affirmer ne suffit pas :
`tests/test_world_catalog_isolation.py` (neuf) le vérifie octet pour octet
dans les deux sens, plus qu'éditer le catalogue fait bien apparaître le
nouveau texte pour DEUX personnages du même monde sans jamais mélanger leurs
tenues respectives.

## Écran Banque

Cran **Monde | Personnage**, visible seulement sur une scène `origin:
"world"` (`useSceneWorkbench.inspectorMode`) :

- **Personnage** (`SceneInspector`) : les champs `intention`/`prompt`
  passent en lecture seule avec une note « hérité du lieu » — les éditer ici
  serait un no-op silencieux à l'enregistrement suivant, autant le dire
  franchement. Le reste (tenue, pose, format, compte, variantes, tons, tags)
  reste éditable à l'identique.
- **Monde** (`PlaceInspector`, `useWorldPlaces.ts`) : édite le lieu
  directement — avertit que ça touche **tous** les personnages du monde,
  enregistre via `POST /api/worlds/{id}/places`, puis recharge la banque
  (`useScenes().load()`) pour que l'onglet Personnage montre tout de suite
  le nouveau texte.

Pas de créateur de monde : ces deux écrans éditent des lieux d'un monde déjà
versionné, ils n'en créent pas un nouveau.

## Fichiers touchés

| Fichier | Ce qui change |
| --- | --- |
| `DOCS/adr/0015-…md` | l'ADR |
| `DOCS/adr/0014-…md` | pointeur vers 0015 |
| `worlds.py` | `starter_scenes` → `places`, `place()`, `save_places()`, `merge_scene()`, `UnknownPlaceError`, `SCENE_OVERLAY_KEYS` |
| `web/api/schemas/worlds.py`, `web/api/services/worlds.py`, `web/api/routers/worlds.py` | nouveaux — routes catalogue |
| `web/api/main.py` | enregistre le nouveau router |
| `web/api/services/bank.py` | `refresh_world_scenes()` |
| `web/api/routers/bank.py` | l'appelle sur `GET`/`POST /api/scenes` |
| `runner/prompt.py` | `create_character` construit l'amorce via `merge_scene` |
| `WORLDS/*.json` | clé renommée, `_notes` corrigées |
| `web/ui/src/screens/bank/{useWorldPlaces.ts,PlaceInspector.tsx}` | nouveaux |
| `web/ui/src/screens/bank/{SceneInspector,BankScreen,useSceneWorkbench}.tsx` | cran Monde \| Personnage |
| `web/ui/src/state/ScenesStoreContext.tsx` | `Scene.world_ref` |
| `web/ui/src/api/{openapi.json,schema.d.ts}` | régénérés |
| `.claude/skills/nouvel-univers/SKILL.md`, `DOCS/architecture.md` | vocabulaire à jour |
| 3 tests (`test_worlds_registry`, `test_character_create`) modifiés + `test_world_catalog_isolation.py` neuf | |

## Tests lancés

`test_worlds_registry` · `test_character_create` ·
`test_world_catalog_isolation` (neuf) · `test_scenes_categories` ·
`test_valider_banque` · `test_build_jobs` · `test_build_jobs_abyssiaelle` ·
`test_character_registry`. Tous verts. Interpréteur : `.venv/Scripts/python.exe`
(fastapi requis). Côté frontend : `tsc -b --noEmit` et `vite build` verts.

## Ce qui reste ouvert

- Fumigation navigateur du cran Monde | Personnage (Playwright, comme les
  autres écrans) — non lancée dans ce chantier, à poser sur le même modèle
  que les fumigations existantes de la Banque.
- La limite du live (§ ci-dessus) : si l'usage réel montre qu'un lieu édité
  doit atteindre la production immédiatement, refusionner avant
  `build_jobs` dans `api/routers/production.py` est le point d'extension —
  décidé hors périmètre pour ce chantier (ADR-0015, alternatives).
- `/api/compose` ne tague toujours pas ses propositions `origin: "compose"`
  (dette déjà notée dans le handoff ADR-0014, inchangée ici).
