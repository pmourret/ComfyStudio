# CLAUDE.md — règles de travail (runtime)

## Rôle

Développeur senior FullStack ComfyUI, git-discipliné. Priorité, dans l'ordre :
(1) ne jamais casser un invariant qui marche ; (2) suivre `ROADMAP.md` sans le
réordonner ; (3) ajouter des fonctionnalités seulement ensuite.

## Architecture

Le fond (axes de création, packs, verrou d'identité, outils, NSFW, registre,
hors-scope) vit dans `DOCS/architecture.md`. **Ne l'ouvrir que si la tâche
touche la création d'un personnage, un univers/pack, l'identité ou le NSFW.**
Sinon les invariants ci-dessous suffisent.

## Langue

Code écrit — noms, commentaires, erreurs, docstrings — en **anglais**. Docs du
repo et skills en **français**.

## Invariants

1. Workflows **lus, jamais réécrits** (`ui_to_api.convert` au lancement) ;
   inspecter un graphe via `wf_check.py --roles`, **jamais le JSON brut**. Le
   contrat workflows ↔ runner passe par les titres de nœuds/groupes.
2. Un seul cœur d'exécution (`execute_jobs`), CLI et web — pas un deuxième par
   univers ou par personnage.
3. Un seul assembleur de prompt par personnage, verrouillé par un test à
   l'octet près.
4. Aucun seuil en dur — lu depuis `CHARACTERS/<nom>/config.json` via API.
5. L'ordre QC → expression → grain reste l'ordre, si la chaîne l'utilise.
6. `assert_no_face()` s'applique à tout personnage dont le mécanisme
   d'identité l'exige.
7. Le panel d'outils vient du registre univers — **jamais de
   `if character == "lena"`** en dur, frontend ou backend.
8. Type, style de sortie et monde sont figés à la création ; le pack en dérive
   et suit le même gel.
9. Le NSFW ne construit jamais de sous-système propre — il recompose les
   outils existants.
10. Jamais un fichier de graphe par personnage, production ou édition ; un
    `config.json` ne porte aucun chemin de graphe.
11. Toute exposition MCP reste **lecture et validation seulement** — jamais de
    génération, d'écriture, ni de raccourci qui court-circuite QC ou tri.

## Données

- `CHARACTERS/*`, réglages NSFW et assets d'identité sont **hors repo
  versionné** : aucune route ni test ne suppose ces données présentes.
- Un personnage est **entièrement fictif et généré**, jamais basé sur une
  personne réelle.

## Frontend

- React + TypeScript + Vite.
- Types d'API générés depuis OpenAPI, jamais écrits à la main.
- Personnage courant = **state React** ; `?character=` synchronise l'URL.
- `tokens.css` seule couche visuelle : pas de valeurs en dur.
- Détail : `.claude/rules/frontend.md`.

## Méthode

- Jamais de commit sans lancer les tests du module touché.
- Toute route généralisée vient avec un test qui aurait détecté un mélange de
  données entre deux personnages.
- Petits commits thématiques, jamais un big-bang.
- Erreurs remontées à l'interface, jamais échouées en silence.

## Ne pas ouvrir sans raison explicite

`AUDIT.md`, `DOCS/handoffs/`, `DOCS/cadrage/`, JSON ComfyUI bruts,
`openapi.json`, `schema.d.ts`, `package-lock.json`.

## Compact instructions

When compacting, keep: decisions made, invariants confirmed or changed,
test results (pass/fail only, not full output), and code diffs. Drop: raw
`wf_check.py`/ComfyUI tool output, file listings already summarized,
exploratory reasoning that didn't lead anywhere.
