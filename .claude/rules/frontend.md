---
paths:
  - "AUTOMATION/web/static/**"
---

# Conventions frontend de la plateforme

## Stack

JavaScript vanilla, modules ES (<script type="module">, import/export) —
pas de framework, pas d'étape de build.

## Aucune globale partagée entre fichiers

Chaque module encapsule son propre état et expose une interface explicite
(fonctions exportées) — jamais une variable posée sur window ou partagée
implicitement entre fichiers <script>.

## Deux couches, deux responsabilités

- Structure et comportement (ce fichier) : composants du design system
  commun, organisation en modules, gestion d'état, remontée d'erreurs.
  Reste identique d'un univers à l'autre.
- Identité visuelle par univers (territoire d'un skill de design
  générique) : palette, typographie, ambiance propres à chaque univers —
  voulu, différent d'un univers à l'autre (CLAUDE.md §5).

## Sélecteur de personnage

V1 : rechargement simple (?character=lena).

## Panel d'outils

Vient du registre univers (tools.json), jamais d'un
if character == "lena" en dur (CLAUDE.md §8.7).

## Erreurs

Une erreur backend se traduit en message explicite dans l'interface —
jamais un échec silencieux, un spinner infini, ou une erreur uniquement en
console.
