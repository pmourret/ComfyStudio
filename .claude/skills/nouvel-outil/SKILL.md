---
name: nouvel-outil
description: A utiliser pour ajouter un outil au panel du Dashboard (global ou propre a un univers) - contrat du module, enregistrement dans tools.json, respect du design system commun.
---

# Ajouter un outil au Dashboard

## Décider la portée avant d'écrire du code

- **Outil global** : utile à tout univers (ex. édition d'image, modification
  live par IA). Ne pas dupliquer un outil global existant pour un univers en
  particulier — vérifier `CLAUDE.md` §5 avant d'en créer un nouveau
- **Outil propre à un univers** : n'a de sens que dans ce monde (ex. un
  éditeur de lore pour un univers narratif). Reste déclaré uniquement dans
  le(s) `tools.json` de cet/ces univers

Un outil peut démarrer propre à un univers et devenir global plus tard si un
second univers en a l'usage — mais ce n'est jamais l'inverse (ne pas
construire "global" par précaution si un seul univers l'utilise aujourd'hui).

## Contrat d'un outil

Un outil est un module autonome :
- **Backend** : route(s) dédiée(s). Pas de logique métier de graphe ComfyUI
  dans le code de l'outil lui-même — les réglages vivent dans
  `CHARACTERS/<nom>/config.json`, jamais en dur (invariant `CLAUDE.md` §8.4)
- **Frontend** : écran/composant en module ES (`CLAUDE.md` §9), utilisant le
  design system commun (cartes, layout, panneaux de réglages) plutôt qu'un
  style ad hoc

Si l'outil touche un workflow ComfyUI (création, édition, appel), suivre le
skill `workflow-comfyui` pour le contrat de lecture des workflows et la
validation (`wf_check.py`).

## Enregistrement

Ajouter l'entrée dans le(s) `tools.json` concerné(s) (`UNIVERS/<nom>/
tools.json`) plutôt que de modifier le Dashboard au cas par cas pour un
personnage ou un univers particulier. C'est cette étape qui rend l'outil
visible dans le panel — un outil implémenté mais non enregistré n'apparaît
nulle part, et c'est voulu (permet de merger le code avant de l'activer).

## Isolation des données

Un outil qui lit/écrit des données de personnage doit toujours passer par
`character_id` explicite — jamais une variable globale ou un contexte
implicite qui suppose "le personnage courant". Écrire un test qui aurait
détecté un mélange de données entre deux personnages si l'outil manipule
des données par personnage (`CLAUDE.md` §11).

## Checklist

- [ ] Portée décidée (global vs univers spécifique), pas de duplication
      d'un outil global existant
- [ ] Aucun réglage en dur — tout lu depuis `config.json` du personnage
- [ ] Frontend en module ES, design system commun respecté
- [ ] Si ComfyUI impliqué : `wf_check.py --roles` et `--essai` passés
- [ ] Enregistré dans le(s) `tools.json` concerné(s)
- [ ] Test d'isolation `character_id` si l'outil touche des données de
      personnage
