# ADR-0003 : Le NSFW est une composition d'outils existants, pas un sous-système

## Statut

Accepté (2026-08-26)

## Contexte

Chez Léna, la branche NSFW existait comme un pipeline semi-séparé
(`nsfw_batch.py`, onglet dédié). En généralisant à plusieurs univers, le
risque était de reconstruire un sous-système NSFW dédié pour chacun.

## Décision

Le NSFW est un flux manuel en quatre étapes — génération → sélection
manuelle de l'image par l'utilisateur → reprise NSFW via l'outil de
modification live par IA → retouche via l'éditeur d'image — recomposé à
partir de deux outils globaux déjà prévus, sans aucun outil dédié.
Réglage dans le paramétrage de l'app, **off par défaut**.

## Alternatives envisagées

- **Génération NSFW native dans chaque outil dès sa conception** — écarté :
  coûteux à reconstruire pour chaque univers et chaque outil.
- **Garder une branche parallèle dédiée par univers**, comme pour Léna
  aujourd'hui — écarté : duplique un sous-système entier à chaque univers
  ajouté, alors que le flux réel ne varie pas.

## Conséquences

Ajouter un univers n'implique aucun travail NSFW spécifique tant que les
deux outils globaux existent pour lui. Aucun nouvel outil dédié au NSFW
n'est jamais nécessaire.
