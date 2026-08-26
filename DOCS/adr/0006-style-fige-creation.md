# ADR-0006 : Le style de sortie est figé à la création du personnage

## Statut

Accepté (2026-08-26)

## Contexte

Un style de sortie librement sélectionnable par scène ou par génération
(réaliste/fantastique/cartoon/manga au choix) a été envisagé. Mais le
style dépend de la famille de modèle de l'univers, elle-même liée au
mécanisme de verrou d'identité (ADR-0002).

## Décision

Le style de sortie est fixé à la création du personnage et n'est plus
modifiable ensuite. Un besoin de style différent se traduit par la
création d'un nouveau personnage, pas par un paramètre de génération.

## Alternatives envisagées

- **Style libre, sélectionnable à chaque génération** — écarté : changer
  de style en cours de route reviendrait à changer de famille de modèle à
  la volée, ce qui percute directement l'abstraction du verrou d'identité
  posée en ADR-0002 et en complique l'implémentation pour un bénéfice
  incertain.

## Conséquences

Pas de logique de changement de famille de modèle à construire au sein
d'un même personnage. Le coût d'un nouveau style est le coût normal d'un
nouveau personnage (identité à mesurer, etc.), pas un coût technique
supplémentaire.
