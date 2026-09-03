# Écran 6 — Éditeur de pose : audit + capacités

Périmètre validé par l'utilisateur. Fichiers concernés : `src/screens/pose-editor/*`
(`PoseCanvas.tsx`, `PoseInspector.tsx`, `PoseEditorScreen.tsx`, `UndoRedoButtons.tsx`,
`usePoseEditor.ts`, `useSelection.ts`, `poseTopology.ts`).

## A — Corrections a11y

### A1. Sélection clavier des joints (Entrée/Espace)
Les cercles SVG (`BodyLayer`/`HandLayer` dans `PoseCanvas.tsx`) portent `tabIndex={0}`
mais ne réagissent qu'à `onPointerDown` — un utilisateur clavier peut *focus* un joint
(Tab) mais jamais le sélectionner, donc jamais atteindre le nudge aux flèches. Ajouter
`onKeyDown` sur chaque `<circle>` : Entrée/Espace = `onSelect(group, index)` (même
sémantique que le clic simple), Ctrl/Cmd+Entrée = `onToggleSelect` (équivalent
Ctrl/Cmd+clic). Ne pas déclencher de `preventDefault` sur Espace sans vérifier que la
page ne scrolle pas déjà via le SVG (`touch-none` sur le conteneur devrait suffire).

### A2. Raccourcis undo/nudge actifs hors focus canvas
Rough edge déjà noté dans `PoseCanvas.tsx` (`onKeyDown` du `<svg>`) : Ctrl+Z, Ctrl+Maj+Z,
et les flèches ne marchent que si le focus est resté dans le SVG. Cliquer
Annuler/Rétablir/Épingler/Miroir puis Ctrl+Z ne fait rien. Élever l'écoute au niveau du
conteneur de l'écran/modal (le `<div className="wrap...">` de `PoseEditorScreen.tsx` et
la `<Dialog>` de `PoseEditorModal.tsx`), pas seulement le `<svg>` — un seul
`onKeyDown` partagé, la logique de `PoseCanvas`'s `onKeyDown` peut être extraite en
fonction pure réutilisée aux deux endroits (elle prend déjà `pose`/`selected`/`pinned`/
`onChange`/`onUndo`/`onRedo` en paramètres, aucun état interne au canvas).

### A3. Nom + position annoncés par joint
`aria-label` porte aujourd'hui sur le `<svg>` entier, pas sur chaque `<circle>`. Ajouter
`aria-label` par joint : `` `${nameOf(group, index)} — ${placé ? `x ${x}, y ${y}` :
'non placé'}${isPinned ? ', épinglé' : ''}` ``. `nameOf` existe déjà dans
`PoseInspector.tsx` — l'extraire vers `poseTopology.ts` pour la partager avec
`PoseCanvas.tsx`. Recalculer le label à chaque render : la position change en direct
pendant un drag, donc mettre aussi `aria-live="polite"` n'a pas de sens sur un `<circle>`
(pas de live region native pour SVG focus) — l'annonce se fera naturellement à la
prochaine lecture du label par le lecteur d'écran (au prochain focus), ce qui reste
la bonne granularité : annoncer à chaque pixel de drag serait du bruit.

### A4. État épinglé accessible dans la liste
`JointRow` (`PoseInspector.tsx`) affiche 📌 avec `aria-hidden="true"` — aucun
équivalent texte. Ajouter `aria-label` complet au bouton de la ligne, incluant l'état :
`` `${label}${isPinned ? ', épinglé' : ''}${isSelected ? ', sélectionné' : ''}` ``,
et garder le glyphe visuel `aria-hidden` (décoratif une fois le label complet en place).

### A5. Live region sur « non enregistré »
Le texte `{dirty && <p className="tiny">Modifications non enregistrées</p>}` (dans
`PoseEditorScreen.tsx` et `PoseEditorModal.tsx`) apparaît/disparaît sans être annoncé.
Ajouter `role="status"` sur ce `<p>` — même pattern que `renderError` dans
`ExpressionEditorScreen.tsx`. Un seul ajout d'attribut, deux fichiers.

### A6. Repli non-couleur pour membres/doigts
`BODY_COLORS` et `handEdgeColor()` (`poseTopology.ts`) sont la seule différenciation
visuelle des membres/doigts — problème pour le daltonisme (rouge/vert adjacents sur le
corps, dégradé HSL continu sur les mains). Ajouter un second signal indépendant de la
teinte :
- Corps : `strokeDasharray` distinct par membre (plein / tirets longs / tirets courts —
  3 motifs suffisent, répétés, l'info redondante avec la couleur désambiguïse localement)
  sur les `<line>` de `BodyLayer`.
- Mains : `HAND_EDGES` regroupe déjà par doigt (5 groupes de 4 arêtes) — utiliser un
  `strokeDasharray` par doigt plutôt que par arête individuelle, cohérent avec le
  regroupement déjà en `HAND_JOINT_GROUPS`.
Ne pas toucher aux couleurs elles-mêmes (choix historique, miroir de
`pose_render.py`) — cette correction est additive.

## B — Capacités outil dense

### B1. Lecture angle/longueur en direct pendant le drag
`PoseInspector.tsx` calcule `angleAndLength()` mais seulement au *render*, donc après
relâchement du pointeur (le drag lui-même vit dans `PoseCanvas.tsx`'s `startDrag`, qui
appelle `onChange` — `pose` remonte et l'inspecteur se rafraîchit, mais avec un
tour de React entre le pixel déplacé et l'affichage). C'est déjà quasi instantané en
pratique (le state remonte à chaque `pointermove`) — donc pas de nouveau canal de
données requis. Le vrai gain : afficher ce même angle/longueur **sur le canvas**, à côté
du joint en cours de drag, pas seulement dans la barre latérale hors champ visuel
pendant que l'œil est sur le geste. Ajouter dans `startDrag`, pendant `move`, un `<text>`
SVG flottant (position = point courant + offset fixe) affichant `` `${angle}° ·
${length}px` `` quand `single !== null && parentPoint` — état local au composant
(`dragReadout`, un `useState` de plus dans `PoseCanvas`), effacé sur `stop`.

### B2. Alignement de la sélection (même X ou même Y)
Nouvelle fonction dans `poseFrame.ts` : `alignSelection(pose, keys, axis: 'x' | 'y')` —
prend la moyenne (ou la position du dernier point sélectionné — trancher pour la
moyenne, plus prévisible sans notion d'« ancre ») des points placés dans `keys` sur
l'axe demandé, et réaligne tous les points placés du groupe sur cette valeur, laissant
l'autre axe inchangé. Deux boutons dans `PoseInspector.tsx`, visibles seulement quand
`selectedKeys.length > 1` (juste au-dessus du bloc `N points sélectionnés` existant) :
« Aligner X » / « Aligner Y ». Passe par `applyAction` (pas `update`) — c'est une action
discrète, pas un drag continu, même raison que le miroir.

### B3. Décalage numérique (dx/dy) pour un groupe
Le bloc `N points sélectionnés` de `PoseInspector.tsx` n'offre aujourd'hui que
pin/miroir — aucun moyen d'entrer une valeur exacte pour une sélection multiple (contrairement
au joint unique, qui a `NumberField` x/y). Ajouter deux `NumberField` dx/dy dans ce bloc,
valeur affichée toujours à 0 (un décalage, pas une position absolue), qui au `onCommit`
appliquent `withPointsMoved(pose, origins, dx, dy)` — `origins` capturé au moment où le
champ prend le focus (snapshot des positions actuelles des points sélectionnés placés),
puis remis à 0 après application. Réutilise `withPointsMoved` déjà écrit pour le drag de
groupe dans `poseFrame.ts` — aucune nouvelle primitive de mutation.

### B4. Grille/snap optionnel
Toggle dans la barre d'outils du canvas (à côté des boutons zoom, `PoseCanvas.tsx`) :
« Grille ». État local (`showGrid`, `useState`). Rendu : un `<pattern>` SVG de lignes
tous les 20px (à l'échelle canvas, donc visuellement cohérent quel que soit le zoom),
posé sous les calques body/hand. Le snap lui-même : dans `startDrag`'s `move`, quand
`showGrid` est actif, arrondir `nx`/`ny` au multiple de 20 le plus proche avant
`onChange` (s'applique aussi bien au drag libre qu'à la rotation IK — arrondir le point
final, pas l'angle). Ne pas coupler grille visible et snap actif à deux toggles séparés
— la grille n'a pas d'utilité si elle n'aimante rien, un seul contrôle.

## Notes d'exécution
- A1/A2 touchent la même zone de code (`onKeyDown`) — les traiter dans le même commit
  évite de réécrire `startDrag`/`onKeyDown` deux fois.
- B1-B4 sont indépendants entre eux et des corrections A — peuvent atterrir dans
  n'importe quel ordre ou en parallèle.
- Aucune de ces capacités ne change le format `PoseFrame`/`RawPoseFrame` ni les endpoints
  `/api/pose/*` — tout est côté client.
