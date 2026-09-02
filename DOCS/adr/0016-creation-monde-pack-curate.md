# ADR-0016 : Un monde se crée avec un pack déjà curaté, jamais un aiguillage neuf

## Statut

Accepté (2026-08-31).

## Contexte

ADR-0015 a rendu le catalogue de lieux d'un monde EXISTANT vivant et
éditable. Mais créer un monde restait manuel : les deux seuls fichiers
`WORLDS/*.json` du dépôt sont écrits à la main. Le but ici est un écran qui
écrit `WORLDS/<id>.json`, catalogue vide, prêt à être peuplé depuis l'éditeur
de lieux d'ADR-0015 — sans rouvrir la question, déjà tranchée par ADR-0012,
de qui résout un pack.

## Décision

### 1 · Le formulaire ne demande que ce qu'un humain doit choisir

Id, nom, un **pack parmi ceux qui existent** (`universe.list_universes()`),
un ton optionnel. Rien d'autre : la famille compatible ne se tape pas, elle
se **dérive** du pack choisi (`universe.model_family(pack)`), exactement
comme `suggested_styles` (`universe.style_names(pack)`) — c'est la
convention déjà observée à la main sur les deux mondes réels
(`suggested_styles` de chacun égale les styles du pack qui l'a inspiré).

### 2 · Le pack est une proposition, pas un aiguillage

Choisir un pack ici sert **une fois**, à la création, à dériver
`compatible_families`. Il n'est écrit nulle part comme un lien dur : aucune
entrée neuve dans `UNIVERS/resolution.json`, `universe.resolve()`
inchangé. Une fois créé, ce monde reste proposable à **tout** personnage
d'un pack de la même famille — pas seulement celui choisi à sa naissance.
`worlds.create_world()` le dit dans ses propres `_notes`, comme le font déjà
les deux mondes réels pour leurs propres choix.

### 3 · Aucun personnage n'est assigné

`create_world()` n'écrit que `WORLDS/<id>.json`. Aucun accès à
`CHARACTERS/`. Le gel de l'appartenance d'un personnage à un monde
(CLAUDE.md §3-§4) est donc vrai par construction — il n'y a rien à geler de
plus, cette route ne touche jamais un personnage.

### 4 · Le wizard personnage ne crée pas de monde

Le wizard « nouveau personnage » (J7bis) continue de **choisir** un monde
parmi ceux que `worlds.worlds_for_family()` filtre pour le pack déjà résolu
— il n'a jamais rien créé, et cet ADR ne lui ajoute pas ce geste. Un monde
neuf créé par l'écran « Mondes » y apparaît automatiquement, sans aucun
changement côté wizard : `worlds_for_family()` scanne `WORLDS/` à chaque
appel.

### 5 · Entrée d'écran : une destination de navbar

« Mondes » est une destination à part entière de la navbar du studio
(`app/routes.ts`, `chrome/SideNav.tsx`), au même titre que Produire ou
Revue — visible seulement personnage réclamé (contrainte déjà existante de
`SideNav`, pas nouvelle ici), mais atteignable par son URL sinon (aucune
route de ce studio n'est gardée par la présence d'un personnage, voir
`app/App.tsx`). Alternative écartée : une carte sur le registre des
personnages — un monde n'est pas un personnage, et la navbar dit plus
honnêtement qu'il s'agit d'un axe de la plateforme, pas d'un geste
ponctuel de l'écran d'entrée.

## Conséquences

- `AUTOMATION/worlds.py` gagne `create_world()`, `_WID_RE`.
- Nouvelles routes `GET /api/worlds` (registre), `GET /api/worlds/options`
  (packs), `POST /api/worlds` (création) — `api/routers/worlds.py`,
  `api/schemas/worlds.py`.
- Écran « Mondes » (`screens/worlds/`) : registre + formulaire court
  (`WorldsScreen.tsx`), éditeur de catalogue autonome
  (`WorldPlacesScreen.tsx`, réutilise `useWorldPlaces`/`PlaceInspector`
  d'ADR-0015 sans les dupliquer).
- `tests/test_world_creation_isolation.py` verrouille : le fichier est là,
  `CHARACTERS/` intact.
