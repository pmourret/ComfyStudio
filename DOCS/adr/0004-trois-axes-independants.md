# ADR-0004 : Trois axes indépendants — Univers, Personnage, Registre de création

## Statut

Accepté (2026-08-26)

## Contexte

Au démarrage de la généralisation, la tentation était de coupler les types
de contenu actifs (image/vidéo/voix/mise en scène) à l'univers du
personnage — par exemple, supposer que seul un personnage RPG aurait un
jour de l'audio.

## Décision

Le registre de création (types de contenu actifs) est un axe
**indépendant** de l'univers et **commun** à tous les univers. En V1, seul
`image` est actif ; `vidéo` et `voix` sont déclarés mais inactifs pour
tous les univers, pas seulement pour celui qui en a un usage envisagé en
premier.

## Alternatives envisagées

- **Coupler les types de contenu à l'univers** — écarté explicitement :
  la vidéo et l'audio doivent pouvoir coexister aussi bien pour l'univers
  influenceur que pour le RPG-personnage, ce n'est pas une exclusivité
  d'un monde en particulier.

## Conséquences

Activer la vidéo ou la voix en V2 est un changement de valeur dans le
registre de création, pas une migration de schéma ni un ajout spécifique
à un univers.
