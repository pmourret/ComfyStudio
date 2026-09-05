# Projet Soulglade

Ce document précède la roadmap et les invariants techniques. Il fixe le
cadrage stratégique du projet et se lit en premier, à chaque ouverture de
session. Toute décision d'architecture qui remet en cause un point ci-
dessous modifie d'abord ce document, et l'ADR qui en découle le cite.

## Ce que c'est

Soulglade est un outil open source de création de contenu par IA, destiné
à d'autres créateurs. Il orchestre ComfyUI plutôt que de le remplacer :
Soulglade compose et pilote, ComfyUI exécute les graphes.

## Pour qui

Cible V1 : créateur qui connaît déjà l'IA générative (a manipulé un
Automatic1111, une interface web équivalente, comprend ce qu'est un
prompt, un LoRA, un checkpoint) mais qui découvre Soulglade. Ni néophyte
complet, ni expert ComfyUI.

Non-cibles V1 : néophyte complet en IA générative ; utilisateur qui veut
publier automatiquement sans intervention ; opérateur multi-utilisateur en
SaaS.

## Aha moment

Un utilisateur exécute le parcours complet du néant à la publication :
installation, création d'un personnage, production d'une image
satisfaisante, export prêt-à-poster. La V1 est finie quand ce parcours est
possible sans intervention extérieure.

## Positionnement

Soulglade est un outil d'aide, pas une plateforme décisionnelle.
L'utilisateur garde la main sur les choix créatifs, publicitaires et
éthiques. La plateforme mesure et informe, elle n'arbitre pas à sa place.

## Monétisation

- Vente de packs de monde via Patreon
- Vente ultérieure de l'éditeur de packs
- La base plateforme reste open source, gratuite, sans dégradation
  fonctionnelle

## NSFW

Citoyen de première classe du produit. Activable par personnage, désactivé
par défaut. Aucun sous-système parallèle : recompose les outils existants.

## Publication

- V1 : export prêt-à-poster, formats natifs pour Meta
  (Instagram/Facebook), export générique pour toutes les autres
  destinations
- Publication assistée par API : reportée après V1. Raisons : maintenance
  perpétuelle des tokens tiers, incompatibilité du NSFW avec Meta,
  responsabilité qu'un outil open source solo ne peut pas porter

## Mondes livrés d'origine

Deux ou trois mondes, exigeants sur la qualité. Ils servent de
démonstration muette du format d'un pack payant. Léna et Abyssiaelle
restent des personnages de vitrine, jamais livrés dans le produit.

## Ce qui n'est explicitement pas dans la V1

- Multi-personnage en scène
- Vidéo (déclarée dans le registre, workflows non branchés)
- Voix
- Publication automatisée
- Personnages templates fournis
- Mode multi-utilisateur / SaaS
- Univers "monde RPG" complet (lore/carte/PNJ)
- Intégration MCP

## Critères de sortie V1

- Parcours nominal exécutable de bout en bout par un utilisateur cible en
  une session
- Aucun crash silencieux ; toute erreur remontée à l'interface est
  actionnable
- Retour temps réel pendant la génération
- Détection des mains cassées et cohérence de l'identité mesurées,
  affichées, laissées à l'arbitrage de l'utilisateur
- Suite complète de tests de non-régression verte
- Chaque écran du parcours nominal passe un audit UX/UI vérifié en vrai
- Critères UI/UX détaillés à formaliser au moment du découpage en phases

## Discipline de projet

Cinq règles matérialisées dans le dépôt, à respecter avant tout code :

1. **Le cadrage vient avant l'architecture.** Toute décision non triviale
   demande d'abord "pour qui est-elle prise". Sans réponse, cadrage avant
   code. `PROJET.md` est la source.

2. **Un chantier hors parcours nominal attend.** Se demander avant tout
   nouveau chantier : "un utilisateur qui n'a jamais installé Soulglade
   en a-t-il besoin pour aller jusqu'à sa première publication ?". Sinon,
   `BACKLOG.md`.

3. **Un chantier ambitieux se cadre par écrit avant la première ligne de
   code.** Tout chantier de plus d'une étape dans `ROADMAP.md` a son
   fichier dans `DOCS/cadrage/` avant démarrage. Trois questions : à quoi
   ça sert, hors périmètre, critère de sortie.

4. **Une rétro à chaque fin de phase.** Dossier `DOCS/retros/`, format à
   deux questions : livré non prévu, prévu non livré. Trente minutes
   max.

5. **La motivation est un signal, pas un ordre.** Une envie qui prend en
   cours de phase va dans `BACKLOG.md` avec la date, jamais directement
   dans `ROADMAP.md`. Relecture en fin de phase — ce qui parle encore
   peut être promu par cadrage explicite.
