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

## NSFW et identité

NSFW = outils globaux réordonnés (ADR-0003), pas un dashboard parallèle.
Référence de scène ≠ verrou d'identité : l'UI ne les confond pas.

## Quand le changement est visuel ou de parcours

Charger le skill `audit-ux-ui` : findings avant patch, diff minimal.
Ne pas « améliorer le look » hors finding.