# Écran — Éditeur photo : modal simplifié retravaillé + éditeur avancé (calques, Lightroom)

Périmètre validé par l'utilisateur. Fichiers concernés : `src/screens/review/PhotoEditor.tsx`
(modal existant, à retravailler) + nouvel écran plein `src/screens/photo-editor-advanced/*`
(à créer, backend et intégration Produire/Comfy à la charge de Claude Code — cette passe ne
couvre que le frontend). Maquette validée : `Maquettes ecrans prioritaires.dc.html`, turn 7
(`7a` modal, `7b` avancé). Deux surfaces distinctes, liées par un aller-retour explicite —
pas de fusion des deux, pas de remplacement du modal par l'avancé.

## Contexte produit

`PhotoEditor.tsx` existant couvre déjà crop/rotate/flip/straighten + 4 curseurs
(exposition/contraste/saturation/chaleur) + grain, ouvert en modal depuis la Revue,
avec bascule avant/après (pas de côte-à-côte) et choix copie vs écraser-la-source —
conforme aux conventions du projet, ne pas y toucher. F3 de la roadmap (pro-level tool)
en fait un candidat à un éditeur avancé séparé, dans la continuité des ateliers
Produire/Pose/Scène.

## 7a — Modal simplifié : combler le trou dirty/fermeture

Le seul écart réel vs `CLAUDE.md` §1 : aucun indicateur "modifications non
enregistrées", et fermer (✕ ou "annuler") avec des réglages en attente ne demande
rien — perte silencieuse.

1. **État `dirty`** : `true` dès qu'un réglage (crop, ratio, straighten, flip, un des
   4 curseurs, grain) diffère de son état chargé. Afficher `<p>modifications non
   enregistrées</p>` près des actions de bas de panneau, comme l'Éditeur d'expression.
2. **Confirmation à la fermeture** : le clic sur ✕ ou "annuler" n'appelle plus
   directement le handler de fermeture — si `dirty`, ouvrir une confirmation modale
   ("Abandonner les modifications ?" / "Continuer l'édition" / "Abandonner") ; sinon
   fermer directement. Ne pas intercepter Échap différemment du clic ✕.
3. **Lien vers l'avancé** : ajouter "Éditeur avancé →" dans l'en-tête du panneau,
   à côté du titre "Éditer". Navigue vers le nouvel écran plein (7b) en passant l'id
   de la photo courante — le modal simplifié reste ouvert dessous ou se ferme
   (à la charge de Claude Code selon le routing existant ; la maquette n'impose que
   la présence du lien).

Pas de changement de payload ni d'appel serveur — uniquement du state local au
composant modal.

## 7b — Éditeur avancé : écran plein, inspiration Lightroom

Nouvel écran, même famille visuelle que Produire/Pose/Scène (SideNav commun, pas de
contrainte zéro-scroll — écran terminal, pas un hub de composition ; seule la barre
d'actions du haut reste sticky). Ouvert depuis 7a via "Éditeur avancé →", ou
directement depuis la Revue si un point d'entrée direct existe déjà pour le modal
simplifié (à trancher par Claude Code selon les routes existantes).

### Modèle de données — calques réels, pas la pile Lightroom pure

Choix explicite du produit (pas l'inspiration Lightroom par défaut) : garder de
vrais calques de composition, mais organiser le CONTENU de chaque calque à la
Lightroom.

```
Layer = {
  id, name, kind: 'photo' | 'reglage' | 'image' | 'retouche',
  visible: boolean, opacity: 0-100, locked: boolean,
  settings: {
    expo, contrast, sat, temp,               // basique, -50..50
    curveChannel: 'rgb'|'r'|'g'|'b',
    levelBlack, levelMid, levelWhite,        // -50..50
    hsl: { [bande]: { h, s, l } },           // 6 bandes : rouges/jaunes/verts/cyans/bleus/magentas
    sharpen,                                  // 0-100
    blurOn, blurMask, blurRadius, blurStrength,
    perspH, perspV,                           // -30..30°
    aiMask, aiBrushSize, aiPrompt,
  }
}
```

- Calque `photo` (base) toujours présent, verrouillé (pas de suppression, pas de
  masquage — seul son opacité éventuellement ignorée).
- Calques `reglage` / `image` / `retouche` ajoutables via "+ Ajouter un calque"
  (menu à 3 entrées), réordonnables (↑/↓), masquables (◉/◌), opacité individuelle,
  supprimables sauf le calque verrouillé.
- **Un seul calque sélectionné à la fois** (clic sur son nom). Les panneaux
  Colorimétrie avancée / Netteté-flou sélectif / Recadrage avancé / Retouche IA à
  droite affichent et modifient les `settings` du calque sélectionné, pas un état
  global — changer de calque change ce qu'affichent ces panneaux.
- Ajouter/supprimer un calque et appliquer un préréglage sont des actions
  d'historique groupées (un seul Ctrl+Z), même contrat que "copier une plage"
  sur l'Éditeur d'expression — ne pas laisser une suite de petites actions
  se fondre avec la frappe suivante (fenêtre de coalescence ~400 ms).

### Layout

- **Barre du haut (sticky)** : lien retour "← Éditeur simplifié", nom du fichier,
  indicateur dirty, undo/redo, bascule avant/après (toggle, pas côte-à-côte),
  "Enregistrer une copie", "Écraser la source…".
- **Panneau gauche (220px)** : deux onglets.
  - *Préréglages* : liste de préréglages (jeux de valeurs `expo/contrast/sat/temp`)
    appliqués au calque sélectionné en un geste d'historique. Remplace l'ancienne
    idée de section "Filtres" séparée.
  - *Historique* : liste des actions structurantes (ajout/suppression de calque,
    préréglage appliqué), clic = prévisualisation d'un retour à cet état.
  Lightroom a aussi des Instantanés — omis ici, hors périmètre de cette passe.
- **Centre** : aperçu de l'image (le calque de base, composité avec les calques
  visibles au-dessus).
- **Panneau droit (380px)** :
  1. Histogramme (lecture seule, live).
  2. Liste des calques (voir ci-dessus), toujours visible — pas un accordéon.
  3. Panneaux repliables appliqués au calque sélectionné, dans cet ordre :
     **Colorimétrie avancée** (basique 4 curseurs + courbes par canal R/V/B/RGB +
     niveaux point noir/moyen/blanc + HSL par bande, une ligne compacte par bande :
     teinte/saturation/luminance sur la même ligne), **Netteté / flou sélectif**,
     **Recadrage avancé** (perspective horizontale/verticale seulement — ratio et
     redressement fin restent dans le modal simplifié, ne pas les dupliquer),
     **Retouche IA**.

### Masquage à la Lightroom

Remplace le pinceau simple partout où une zone doit être ciblée (flou sélectif,
retouche IA) par un sélecteur à 6 options : **Sujet / Ciel / Arrière-plan**
(détection automatique, backend à fournir), **Pinceau** (rayon réglable, tracé
manuel), **Dégradé linéaire**, **Radial** (placés par glisser sur l'image).
Le mode choisi change le sous-panneau affiché (rayon pour Pinceau, rien de plus
pour les masques auto, message de placement pour dégradé/radial).

### Retouche IA — maquettée, volontairement inerte

Panneau complet (sélecteur de masque, taille de pinceau, champ prompt), mais le
bouton "Générer la retouche" reste désactivé avec un badge "bientôt" et la raison
exacte exposée en `data-hint-text` (pas `title` — cf. `CLAUDE.md` §3) :
"Backend d'édition IA pas encore branché (F5.2) — l'interface est prête à recevoir
le résultat". Ne pas construire de faux appel réseau ni de faux résultat.

## Dépendances pour Claude Code

- **Aucun changement serveur requis pour 7a** — état local au composant modal.
- **7b nécessite un backend nouveau**, hors périmètre de cette passe frontend :
  - Endpoint de composition de calques (rendu de la pile courbes/niveaux/HSL/
    netteté/flou/perspective par calque, compositing par opacité/visibilité/ordre).
  - Détection automatique de masque (sujet/ciel/arrière-plan) — modèle de
    segmentation à brancher.
  - Retouche IA (inpainting, F5.2) — pas encore disponible côté GPU ; le bouton
    "Générer la retouche" doit rester désactivé jusqu'à ce que ce backend existe,
    ne pas le débloquer prématurément côté frontend.
- Persistance des calques : à définir par Claude Code selon le modèle de données
  existant de la photo (nouveau champ ou table `layers` liée à la photo source) —
  la maquette ne prescrit que la forme du `Layer` ci-dessus, pas son stockage.
