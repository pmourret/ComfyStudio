# Découpage phase 2 — clôture V1

Session du 5 septembre 2026, suite directe de la rétro V1 Fondations et
du cadrage V1/discipline du même jour. Trois questions (Règle 3,
`PROJET.md`).

## À quoi ça sert

Fermer réellement V1 au sens de `PROJET.md`, pas au sens de "V1
Fondations" dans `ROADMAP.md`. Les neuf jalons J0→J9 sont des fondations
techniques ; deux des sept critères de sortie de `PROJET.md` ne sont pas
formellement vérifiés (suite de tests verte, audit UX/UI du parcours
nominal), voir la rétro `DOCS/retros/2026-09-05-phase-1-v1-fondations.md`.

Cette phase a un périmètre volontairement étroit, par réaction directe à
la dérive Studio IA identifiée dans le cadrage du 5/09 : viser "ça marche,
c'est clair, rien ne bloque" sur le parcours nominal, pas "niveau
professionnel" sur tous les écrans.

## Hors périmètre — explicite

- **Éditeur photo avancé / ambition Studio IA** (calques, historique,
  préréglages façon Lightroom) — reste en pause fonctionnelle
  (`ROADMAP.md`, décision du 5/09). N'est pas un critère de sortie V1.
- **Banc de comparaison de variantes** (J8.5) — outil de power-user, pas
  requis pour publier une première image. Reste en pause fonctionnelle.
- **Catalogue illustré / importeur d'assets** — le parcours nominal
  fonctionne en texte libre aujourd'hui ; pas bloquant.
- **Recalibration de `qc.threshold_high`** — valeur provisoire
  acceptable, à faire au fil de l'eau.
- **Complétion des ~15 URLs modèle manquantes** dans le manifeste
  ComfyUI — non bloquant, à faire au fil de l'eau.
- **Outillage de création de pack de monde** (validation de manifeste,
  scaffolding, inspection des workflows existants pour en extraire le
  contrat) — nécessaire à la vente de packs, pas à l'exécution du
  parcours nominal. Noté en `BACKLOG.md`, mérite sa propre session de
  cadrage dédiée.

## Critère de sortie

Les trois points tranchés en discussion le 5/09 :
1. Suite complète de tests de non-régression verte, pour de vrai.
2. Chaque écran du parcours nominal audité en usage réel et corrigé.
3. Décision écrite et assumée sur l'absence d'outil d'édition NSFW pour
   Abyssiaelle (graphe SDXL manquant).

## Découpage en étapes

Quatre étapes, chacune livrable et testable seule. P2.1 et P2.4 sont
rapides et indépendantes ; P2.2 est le préalable obligatoire de P2.3, qui
est le plus gros morceau de la phase.

### P2.1 — Suite de tests verte pour de vrai

Corriger l'environnement de test (dépendance `cv2`/Pillow manquante dans
le venv de dev, cause de l'échec récurrent de `test_review` noté "connu,
sans rapport" à plusieurs jalons). Vérifier qu'aucun autre échec ne se
cache derrière la même étiquette.

**Test** : suite complète exécutée, zéro échec, zéro skip non justifié
par un commentaire dans le test lui-même.

### P2.2 — Définir le parcours nominal

Aucune liste écrite n'existe aujourd'hui de ce que "parcours nominal"
recouvre exactement en écrans. À trancher à partir de l'inventaire réel
(`AUTOMATION/web/ui/src/screens/`) : lesquels sont sur le chemin
néant→publication (probablement Worlds, Wizard, CharacterSheet, Produce,
Review/Export) et lesquels sont Studio IA / power-user (pose-editor,
expression-editor, photo-editor-advanced, bank) donc hors périmètre de
cette phase.

**Test** : liste actée par écrit dans `ROADMAP.md`, qui devient le
périmètre exact de P2.3. Formalise au passage les "critères UI/UX
détaillés" que `PROJET.md` renvoyait à cette étape.

### P2.3 — Audit UX/UI du parcours nominal

Pour chaque écran listé en P2.2, un design-pass vérifié en usage réel
(même méthode que ceux déjà faits pour Studio IA dans
`DOCS/design-pass/`) — pas à la lecture du code. Le but est l'absence de
piège ou de blocage, pas l'élégance.

**Test** : un design-pass daté par écran nominal, bugs trouvés en marchant
dessus réellement, corrigés et vérifiés à nouveau.

### P2.4 — Décision écrite Abyssiaelle / SDXL

Pas un chantier de code. NSFW est "activable par personnage" (`PROJET.md`)
— rien n'impose que les deux mondes de démo l'aient en V1. Trancher :
absence assumée (motif affiché, `edit_workflow: null` comme ailleurs dans
le projet) ou prérequis réel de fermeture.

**Test** : décision actée dans `ROADMAP.md` ou le manifeste du pack
`rpg-personnage`, avec la raison, pas seulement l'absence silencieuse.