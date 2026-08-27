---
paths:
  - "AUTOMATION/**/*.py"
---

# Conventions backend de la plateforme

## Stack — et ce qu'on n'utilise volontairement pas

Flask, SQLite en accès direct (AUTOMATION/base.py). Pas d'ORM
(SQLAlchemy ou autre), pas de couche de validation type Pydantic.
Requêtes SQL paramétrées à la main, pas de query builder.

## Frontière des modules

AUTOMATION/ : un module = une responsabilité. Ne jamais y mettre de
logique métier de graphe ComfyUI — les réglages vivent dans
CHARACTERS/<nom>/config.json, les scènes dans scenes.json, jamais en dur
dans le code (invariant CLAUDE.md §8.4).

Découpage cible du backend web (ROADMAP.md, J2) — une nouvelle route
rejoint le module qui correspond à sa responsabilité :
- routes/etat — état du système, health-check
- routes/banque — banque de scènes, taxonomie
- routes/vignettes — miniatures, assets
- routes/production — lancement de génération, file de jobs
- routes/tri — QC, revue, jugements

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

## Tests

- Toute route/fonction généralisée est accompagnée d'un test qui aurait
  détecté un mélange de données entre deux personnages
- L'assembleur de prompt d'un personnage est verrouillé par un test à
  l'octet près dès sa création (CLAUDE.md §8.3)
- Pas de commit sans lancer les tests du module touché

## Si le fichier touche un workflow ComfyUI

Voir le skill workflow-comfyui — le backend lit les workflows, ne les
réécrit jamais.
