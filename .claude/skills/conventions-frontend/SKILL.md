---
name: conventions-frontend
description: A utiliser des qu'on ecrit ou modifie du code frontend du Dashboard (JS vanilla, HTML, CSS) - modules ES sans globales partagees, design system commun, articulation avec l'identite visuelle propre a chaque univers.
---

# Conventions frontend de la plateforme

## Stack

JavaScript vanilla, modules ES (`<script type="module">`, `import`/
`export`) — **pas de framework** (React/Vue), pas d'étape de build. Un
skill frontend générique installé par ailleurs peut orienter vers des
patterns React — ne pas les suivre ici, le Dashboard n'utilise pas de
framework.

## Aucune globale partagée entre fichiers

C'est la dette identifiée dans le repo Léna d'origine (`SC`, `SEL`,
`LEVEL`…) et la raison du passage en modules ES (`CLAUDE.md` §9). Chaque
module encapsule son propre état et expose une interface explicite
(fonctions exportées) — jamais une variable posée sur `window` ou partagée
implicitement entre fichiers `<script>`.

## Deux couches, deux responsabilités

Ne pas confondre ce que gouverne ce skill et ce que gouverne un skill de
design d'interface générique installé par ailleurs :

- **Structure et comportement** (ce skill) : composants du design system
  commun (cartes, layout, panneaux de réglages), organisation en modules,
  gestion d'état, remontée d'erreurs. Reste **identique** d'un univers à
  l'autre.
- **Identité visuelle par univers** (territoire d'un skill de design
  générique, pas de celui-ci) : palette, typographie, ambiance propres à
  `instagram-influenceur` vs `rpg-personnage`. C'est *voulu* que chaque
  univers ait une identité affirmée et différente (`CLAUDE.md` §5) — un
  skill de design orienté esthétique s'applique légitimement à cette
  couche, jamais à la couche structurelle ci-dessus.

Concrètement : un composant de carte partagé peut changer de couleur/police
selon l'univers actif sans que sa structure, ses props ou son comportement
changent — sinon ce n'est plus le même composant, c'est une duplication
déguisée.

## Sélecteur de personnage

V1 : rechargement simple (`?character=lena`) — pas de gestion d'état
cross-personnage sans besoin réel démontré (`CLAUDE.md` §9).

## Panel d'outils

Le panel affiché vient du registre univers (`tools.json`), jamais d'un
`if character == "lena"` en dur dans le frontend (invariant `CLAUDE.md`
§8.7). Un composant d'outil ne sait pas pour quel personnage il tourne
autrement que par les données qu'on lui passe explicitement.

## Erreurs

Une erreur backend (§ skill `conventions-backend`) se traduit en message
explicite dans l'interface — jamais un échec silencieux, un spinner qui
tourne indéfiniment, ou une erreur uniquement visible en console.

## Checklist

- [ ] Aucune variable globale partagée entre fichiers
- [ ] Composant structurel identique entre univers ; seule l'identité
      visuelle change
- [ ] Panel d'outils lu depuis le registre univers, pas codé en dur
- [ ] Erreurs backend remontées explicitement à l'utilisateur
