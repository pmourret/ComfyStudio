# ADR-0001 : Un seul repo pour la plateforme multi-personnage

## Statut

Accepté (2026-08-26)

## Contexte

Léna existait comme repo mono-personnage. En ajoutant Abyssiaelle puis
d'autres personnages à venir, deux architectures de dépôt étaient
possibles : un repo dédié par personnage, ou un repo unique hébergeant
tous les personnages.

## Décision

Un seul repo pour la plateforme. Les personnages sont des **données**
(`CHARACTERS/<nom>/`), jamais des dépôts ou des codebases séparées.

## Alternatives envisagées

- **Un repo par personnage**, dupliqué depuis le repo Léna comme point de
  départ — écarté : deux codebases qui divergent, deux jeux de correctifs
  à propager, et ça va directement à l'encontre de l'objectif « all-in-one »
  explicitement demandé.
- **Un cœur partagé (lib) + un repo léger par personnage** — écarté comme
  complexité prématurée pour un développeur solo, sans besoin actuel de
  déploiements indépendants par personnage.

## Conséquences

Le bootstrap se fait en un seul fork (stabiliser l'ancien repo Léna, puis
forker une fois vers le nouveau repo — voir `ROADMAP.md` J0-J1), pas un
fork par personnage. Ajouter un troisième personnage plus tard veut dire
ajouter un dossier `CHARACTERS/<nom>/` et une entrée de registre, jamais
créer un nouveau dépôt.
