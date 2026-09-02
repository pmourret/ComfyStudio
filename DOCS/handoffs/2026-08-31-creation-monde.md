# Handoff — Créer un monde : écran « Mondes », pack curaté, catalogue vide

**Date** : 31/08/2026
**Portée** : backend + frontend (nouvel écran). `universe.resolve()` et
`CHARACTERS/` non touchés.
**Statut** : clos. Registre, isolation, typecheck/build, vérification
navigateur manuelle (Playwright ad hoc) tous verts.

## Le trou qu'on a bouché

ADR-0015 a rendu le catalogue de lieux d'un monde EXISTANT vivant. Mais créer
un monde restait un geste manuel : les deux seuls fichiers `WORLDS/*.json` du
dépôt sont écrits à la main. Il n'y avait aucun écran, aucune route, pour en
créer un troisième.

## Ce qui est écrit — ADR-0016

`DOCS/adr/0016-creation-monde-pack-curate.md`. Décision centrale : le
formulaire ne demande que ce qu'un humain doit vraiment choisir (id, nom,
pack, ton optionnel) — `compatible_families` et `suggested_styles` sont
**dérivés** du pack, jamais tapés. Le pack choisi est une **proposition**,
pas un aiguillage : `universe.resolve()` continue de dériver le pack d'un
personnage de (type, style) exclusivement, et un monde créé ici reste
proposable à tout personnage d'un pack de la même famille — pas seulement
celui choisi à sa naissance.

## Où ça vit

- `AUTOMATION/worlds.py` : `create_world(wid, label, pack, tone="")`. N'écrit
  QUE `WORLDS/<wid>.json` (catalogue `places: []`). Aucun accès à
  `CHARACTERS/`, aucune écriture dans `UNIVERS/resolution.json` — le gel
  (« assigné à aucun personnage ») est vrai par construction.
- Routes (`api/routers/worlds.py`, mêmes fichiers qu'ADR-0015, étendus) :
  `GET /api/worlds` (registre), `GET /api/worlds/options` (packs
  proposables), `POST /api/worlds` (création). `ValueError`/`FileExistsError`
  → `ss.bad_request()`, même patron que `POST /api/characters`.
- Écran (`screens/worlds/`) :
  - `WorldsScreen.tsx` (`/worlds`) — registre en grille (même patron visuel
    que `CharactersScreen.tsx`) + carte « + Nouveau monde » qui déplie un
    formulaire court **inline**, pas un wizard multi-étapes. Succès →
    navigation vers l'éditeur de lieux du monde créé.
  - `WorldPlacesScreen.tsx` (`/worlds/:worldId/places`) — l'éditeur complet
    du catalogue (liste + ajout + retrait), ce que la Banque n'a jamais
    fait : elle n'édite qu'UN lieu déjà lié à une scène.

## Un déplacement, pas une duplication

`useWorldPlaces.ts` et `PlaceInspector.tsx` vivaient sous `screens/bank/`
depuis ADR-0015 (un seul appelant alors). Ce chantier les a **déplacés** sous
`screens/worlds/` — leur vrai domicile maintenant que deux écrans les
utilisent — et `BankScreen.tsx` les importe depuis là. `PlaceInspector` gagne
un prop `idEditable` (faux par défaut, comportement Banque inchangé) :
l'identifiant d'un lieu n'est éditable que pour un lieu **en cours de
création**, jamais pour en renommer un déjà là — le renommer casserait le
`world_ref` de scènes existantes, un risque non demandé ici et laissé fermé.

## Entrée d'écran

Nouvelle destination de navbar, « Mondes » (`app/routes.ts`,
`chrome/SideNav.tsx`, glyphe globe dans `chrome/Icon.tsx`) — décidé avec
l'utilisateur plutôt qu'une carte sur le registre des personnages ou une
section de l'écran Application. Visible seulement personnage réclamé (règle
déjà existante de `SideNav`, pas nouvelle), mais atteignable par son URL
directement (`app/App.tsx` ne garde aucune route derrière une réclamation).

## Le wizard personnage ne change pas

Aucun fichier du wizard « nouveau personnage » n'a bougé. Un monde neuf y
apparaît tout seul : `worlds_for_family()` scanne `WORLDS/` à chaque appel de
`/api/wizard/options`.

## Tests

- `tests/test_worlds_registry.py` §11 : id invalide, pack inconnu, id déjà
  pris refusés ; `compatible_families`/`suggested_styles` DÉRIVÉS du pack ;
  `places == []` ; label vide replié sur l'id.
- Nouveau `tests/test_world_creation_isolation.py` (TestClient réel) :
  `POST /api/worlds` écrit UN SEUL fichier neuf sous `WORLDS/`, les deux
  mondes réels restent octet pour octet identiques, `CHARACTERS/` octet pour
  octet identique, `universe.resolve()` rend exactement les mêmes réponses
  avant/après pour tous les couples (type, style) réels.
- `tsc -b --noEmit` et `vite build` verts.
- Vérification manuelle dans un vrai navigateur (Playwright ad hoc, pas une
  fumigation permanente — cohérent avec le reste de la Banque récemment) :
  parcours complet registre → créer un monde → atterrir sur son éditeur vide
  → ajouter un lieu → revenir au registre et voir le compte de lieux à jour.
  Zéro erreur JS console. Fichier jetable nettoyé après coup.

## Ce qui reste ouvert

- Pas de fumigation Playwright permanente pour cet écran (comme le reste de
  la Banque récemment) — à poser plus tard sur le modèle des tests existants
  de `AUTOMATION/tests/run_browser_tests.py` si l'écran devient un chemin
  fréquenté.
- Renommer un lieu déjà dans un catalogue reste fermé (§ ci-dessus) — ouvrable
  plus tard avec une vraie réflexion sur les `world_ref` orphelins.
- `assets` d'un monde créé ici naissent vides (LoRA/prompt_add), comme les
  deux mondes réels à leur propre naissance manuelle — dette déclarée, pas
  un oubli (même statut qu'avant ce chantier).
