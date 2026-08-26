---
name: conventions-backend
description: A utiliser des qu'on ecrit ou modifie du code backend (routes Flask, acces base SQLite, modules AUTOMATION) - frontieres de module, acces base sans ORM, propagation de character_id, gestion d'erreur et de config.
---

# Conventions backend de la plateforme

## Stack — et ce qu'on n'utilise volontairement pas

Flask, SQLite en accès direct (`AUTOMATION/base.py`). **Pas d'ORM**
(SQLAlchemy ou autre), **pas de couche de validation type Pydantic**. Un
skill backend générique installé par ailleurs va naturellement proposer ces
patterns — ne pas les suivre ici, ils ne correspondent pas à la stack
réelle du projet. Requêtes SQL paramétrées à la main, pas de query builder.

## Frontière des modules

`AUTOMATION/` : un module = une responsabilité. Ne jamais y mettre de
logique métier de graphe ComfyUI — les réglages vivent dans
`CHARACTERS/<nom>/config.json`, les scènes dans `scenes.json`, jamais en
dur dans le code (invariant `CLAUDE.md` §8.4).

Découpage cible du backend web (`ROADMAP.md`, J2) — une nouvelle route
rejoint le module qui correspond à sa responsabilité, pas le fichier où
c'est le plus simple de l'ajouter :
- `routes/etat` — état du système, health-check
- `routes/banque` — banque de scènes, taxonomie
- `routes/vignettes` — miniatures, assets
- `routes/production` — lancement de génération, file de jobs
- `routes/tri` — QC, revue, jugements

Même logique côté runner batch : `prompt` / `comfy` / `sortie` / `cli`.

## Accès base de données

Une seule base, schéma commun, `character_id` en clé (`CLAUDE.md` §7) —
jamais de connexion ou de fichier de base séparé par personnage. La base
est source de vérité **en lecture** une fois `J0` (`ROADMAP.md`) terminé —
avant ça, ne pas faire dépendre une route de cette hypothèse.

Toute requête qui touche des données de personnage prend `character_id`
en paramètre explicite — jamais une variable globale ou un contexte
implicite qui suppose "le personnage courant" (même règle que pour les
outils, `CLAUDE.md` §11).

## Configuration

Aucun seuil ni réglage en dur dans le code. Tout se lit depuis
`CHARACTERS/<nom>/config.json` via l'API (`/api/config` ou équivalent) —
invariant `CLAUDE.md` §8.4, il s'applique au backend en premier lieu
puisque c'est lui qui sert cette API.

## Erreurs et logs

Logs structurés plutôt que `print()` épars. Une erreur remontée au frontend
explicitement (code d'erreur + message exploitable) plutôt qu'un échec
silencieux ou un code 500 nu — objectif affiché : une application
repérable et débugable (`CLAUDE.md` §11).

## Tests

- Toute route/fonction généralisée (touchant plusieurs personnages) est
  accompagnée d'un test qui aurait détecté un mélange de données entre
  deux personnages
- L'assembleur de prompt d'un personnage est verrouillé par un test à
  l'octet près dès sa création (`CLAUDE.md` §8.3)
- Pas de commit sans lancer les tests du module touché

## Si la route touche un workflow ComfyUI

Voir le skill `workflow-comfyui` — le backend **lit** les workflows, ne les
réécrit jamais, et toute édition de graphe passe par `wf_check.py --roles`
puis `--essai` avant d'être considérée valide.

## Checklist

- [ ] Pas d'ORM, pas de Pydantic introduits par erreur via un pattern
      générique suggéré ailleurs
- [ ] Nouvelle route dans le module correspondant à sa responsabilité
- [ ] `character_id` explicite si la route touche des données de personnage
- [ ] Aucun seuil en dur — lu depuis `config.json`
- [ ] Erreurs remontées explicitement, logs structurés
- [ ] Tests écrits pour le module touché
