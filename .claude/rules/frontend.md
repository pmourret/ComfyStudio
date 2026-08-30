---
paths:
  - "AUTOMATION/web/ui/**"
---

# Conventions frontend de la plateforme

## Stack

React 19 + TypeScript + Vite, React Router pour la navigation
(migration du 30/08/2026). Les types de données d'API ne s'écrivent pas
à la main : ils sont **générés depuis le schéma OpenAPI** que FastAPI
produit (`AUTOMATION/tools/dump_openapi.py` → `openapi-typescript`).
Une forme de payload recopiée à la main est une deuxième copie du
contrat, qui dérive en silence.

L'ancien frontend (JavaScript vanilla, modules ES, sans étape de build)
a été **déposé le 30/08/2026**, les sept écrans étant migrés et validés.
`AUTOMATION/web/static/` n'existe plus, `/legacy` non plus.

## L'étape de build : assumée, et portable

La contrainte « aucune étape de build » est **levée** (30/08/2026). Elle
tenait tant que le dépôt n'avait aucune dépendance ; la migration
FastAPI avait déjà introduit les premières côté Python, et une
application dont les utilisateurs sont des profils techniques ne gagne
rien à s'interdire un bundler.

Ce qui la remplace est une contrainte plus forte : **l'application est
portable.** Tout ce que la chaîne d'outils télécharge vit dans le
répertoire du dépôt, jamais sous `%APPDATA%` / `%LOCALAPPDATA%` :
déplacer le dossier déplace le studio entier.

Un seul point d'entrée l'applique — `AUTOMATION/tools/toolchain.py`. Il
pose `npm_config_cache` et `PLAYWRIGHT_BROWSERS_PATH` sur
`<dépôt>/.toolchain/` avant de passer la main à npm :

    python AUTOMATION/tools/toolchain.py install   # dépendances de web/ui
    python AUTOMATION/tools/toolchain.py build     # bundle → web/ui/dist
    python AUTOMATION/tools/toolchain.py dev       # serveur Vite + HMR
    python AUTOMATION/tools/toolchain.py browsers  # chromium des fumigations

Ne jamais appeler `npm` directement : le `.npmrc` du projet est un filet
(chemin relatif au cwd), pas la règle. Node reste le seul prérequis que
le développeur apporte ; un lanceur l'installera plus tard.

`web/ui/dist/`, `node_modules/` et `.toolchain/` sont git-ignorés — un
build commité à côté de sa source en est une seconde copie.

## Langue

Tout le code est en **anglais** : noms de fichiers, composants, props,
state, hooks, commentaires, docstrings, tests. Deux exceptions, qui sont
de la donnée et pas du code :

- les **libellés d'interface** restent en français ;
- les **messages d'erreur remontés par le backend** restent en français,
  ils s'affichent tels quels.

La dette de nommage français de l'ancien frontend s'est éteinte avec
lui : il n'a pas été traduit, il a été remplacé.

## État

Pas de variable globale, jamais sur `window`. L'état partagé passe par
des contextes React nommés par domaine (personnage courant, sondes,
pannes, chrome) ; l'état d'un écran reste dans son écran.

Le **personnage courant est un state React partagé**. `?character=`
reste dans l'URL pour le partage de lien et le bookmarking, et le state
l'y synchronise — mais c'est le state qui décide, pas l'URL. Changer de
personnage **ne recharge pas la page** (c'était le contrat V1, levé par
la migration React).

Toute requête est bornée au personnage courant par construction :
`useApi()` est le seul moyen d'obtenir un appelant, et il rend des
fonctions déjà liées. Oublier `?character=` doit rester impossible, pas
seulement déconseillé (isolation du 29/08/2026).

## Deux couches, deux responsabilités

- Structure et comportement (ce fichier) : composants du design system
  commun, organisation en modules, gestion d'état, remontée d'erreurs.
  Reste identique d'un univers à l'autre.
- Identité visuelle par univers (territoire d'un skill de design
  générique) : palette, typographie, ambiance propres à chaque univers —
  voulu, différent d'un univers à l'autre (CLAUDE.md §5).

`tokens.css` est **la seule** couche d'identité visuelle, dans
`ui/src/styles/`. `base`, `chrome` et les feuilles d'écran n'en
dépendent que par `var()`, jamais par une valeur en dur qui encoderait
un choix de style. Un univers qui veut sa propre ambiance redéfinit ce
fichier ; le chrome commun ne bouge pas.

## Panel d'outils

Vient du registre univers (tools.json), jamais d'un
if character == "lena" en dur (CLAUDE.md §8.7).

## Erreurs

Une erreur backend se traduit en message explicite dans l'interface —
jamais un échec silencieux, un spinner infini, ou une erreur uniquement
en console. Le client d'API ne lève pas : il rend `{ok:false, erreur}`
sur un corps non-JSON, et chaque chargeur **vérifie la forme** avant de
toucher aux données (`errorOf`).

## État visible

Toute vue de production montre : personnage + univers actifs, sonde
ComfyUI, job en cours ou dernière erreur. Un échec backend = message
actionnable dans l'UI (déjà ci-dessus) — un compteur ou badge qui
ment (base ≠ disque) est un bug, pas un détail de style.

## Design system commun ≠ peau d'univers

Chrome, composants, états, clavier : communs. Palette / typo / ambiance :
par univers, via le skill d'univers, jamais en recopiant un composant.
Pas de `if character == "lena"` pour le style non plus (§8.7).

## Effort et accessibilité (cible pratique)

WCAG 2.2 AA, HTML sémantique avant ARIA, focus visible, Escape ferme
une overlay. Actions haute fréquence (tri, valider/rejeter, relancer)
opérables au clavier. Statut jamais par la couleur seule.
`prefers-reduced-motion` respecté. Densité de studio, pas de landing.

Un libellé masqué en mode icônes l'est **visuellement** (clip-path),
jamais par `display:none` : il reste le nom accessible du contrôle.

## Tests

Chaque écran a sa fumigation navigateur
(`AUTOMATION/tests/run_browser_tests.py`), et un écran neuf arrive avec
la sienne. Elles tournent sous `python_embeded`, celui de ComfyUI : le
venv de développement n'a pas `cv2`, donc `/api/mesurer` y répond 500.

Une fumigation qui touche des données réelles porte une **garde de
destruction** : elle intercepte les requêtes et échoue si un
`/api/delete` vise un fichier qu'elle n'a pas créé elle-même. Un
compteur avant/après ne dit pas *quel* fichier a bougé.

## NSFW et identité

NSFW = outils globaux réordonnés (ADR-0003), pas un dashboard parallèle.
Référence de scène ≠ verrou d'identité : l'UI ne les confond pas.

## Quand le changement est visuel ou de parcours

Charger le skill `audit-ux-ui` : findings avant patch, diff minimal.
Ne pas « améliorer le look » hors finding.
