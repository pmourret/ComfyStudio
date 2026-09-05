# Rétro — Phase 1 : V1 Fondations (J0 → J9)

Écrite le 05/09/2026, en clôturant la phase 2 — cette rétro aurait dû
précéder le cadrage de la phase 2 (`2026-09-05-cadrage-v1-et-discipline.md`)
et ne l'a pas fait : reconstituée après coup depuis `ROADMAP.md` et
l'historique git, pas à chaud. Voir la question 2 pour ce que ce
décalage dit de lui-même.

## 1. Qu'a-t-on livré qui n'était pas prévu ?

- **L'ambition « Studio IA »**, en particulier l'éditeur photo avancé
  (calques, historique, préréglages type Lightroom). Le J8 initial ne
  prévoyait que quatre sous-étapes techniques (couches, capacités,
  héritage, plateforme) ; l'éditeur photo a grandi bien au-delà, sans
  critère de sortie défini nulle part — jusqu'à devenir la raison
  directe du cadrage du 05/09 et de la phase 2. Livré (code committé,
  navigable), mais hors de toute portée initialement fixée.
- **J8.5 — banc de comparaison de variantes**, capacité de plateforme
  ajoutée en cours de route (pas dans le découpage J8 d'origine),
  complètement livrée et validée contre ComfyUI réel le 2026-09-03.
- **J9 — provisioning ComfyUI par manifeste**, chantier de fiabilité
  ajouté après coup, motivé par un incident réel (custom node/modèle
  manquant en production) plutôt que planifié dès le début de la phase.

## 2. Qu'est-ce qui était prévu et qui n'a pas été livré ?

- **Deux des sept critères de sortie de `PROJET.md`** n'étaient pas
  formellement vérifiés à la fin des neuf jalons techniques : suite de
  tests verte pour de vrai, et audit UX/UI du parcours nominal. Les
  neuf jalons J0-J9 sont des fondations techniques, pas la V1 au sens
  produit — l'écart entre les deux est exactement ce qui a motivé la
  phase 2 (close le jour même, voir sa propre rétro).
- **La décision Abyssiaelle/NSFW/SDXL** existait déjà en substance
  depuis J7 (raison technique écrite dans les notes de
  `PACKS/rpg-personnage/universe.json`) mais n'avait jamais été actée
  comme décision de fermeture dans `ROADMAP.md` — restée invisible dans
  un fichier que personne ne relit, plutôt qu'affichée.
- **Cette rétro elle-même.** Trois documents (`ROADMAP.md`, le cadrage
  du 05/09, ce dossier) la citaient comme si elle existait ; elle
  n'avait jamais été écrite. Trouvé seulement en préparant la rétro de
  phase 2, par accident. Rien ne l'avait signalé avant — la règle 4 de
  `PROJET.md` ("une rétro à chaque fin de phase") n'a pas de garde-fou
  qui la fasse respecter automatiquement, elle dépend de la mémoire de
  la session qui clôt la phase.
