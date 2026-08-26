# ADR-0005 : Séparation des données personnelles et du code versionné

## Statut

Accepté (2026-08-26)

## Contexte

Le dépôt Léna mêle aujourd'hui code et données de personnage (assets
d'identité, réglages NSFW). La mission de la plateforme prévoit qu'une
fois la base validée, le dépôt puisse devenir public.

## Décision

`CHARACTERS/*`, les réglages NSFW et les assets d'identité sont séparés du
code versionné dès la conception du nouveau repo — jamais mêlés au cœur
qui pourrait devenir public.

## Alternatives envisagées

- **Différer la séparation jusqu'au jour du passage en public** — écarté :
  un tri d'urgence sous pression, au moment de rendre le dépôt public,
  risque des oublis (un asset d'identité ou un réglage NSFW qui reste dans
  l'historique git même après un tri de dernière minute).

## Conséquences

Aucune route ou test ne doit dépendre d'un chemin qui suppose ces données
présentes dans le repo public. Le tri au moment de rendre le dépôt public
devient une vérification, pas une opération à risque.
