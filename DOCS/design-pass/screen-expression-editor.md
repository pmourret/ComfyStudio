# Écran — Éditeur d'expression : refonte pro (one-page) + capacités + a11y

Périmètre validé par l'utilisateur. Fichiers concernés : `src/screens/expression-editor/*`
(`ExpressionEditorScreen.tsx`, `ExpressionSliders.tsx`, `useExpressionEditor.ts`,
`expressionBounds.ts`). Maquette validée : `Maquettes ecrans prioritaires.dc.html`,
turn 6 (`6a`). Direction : équilibre 50/50 aperçu/paramètres conservé, bascule
original/rendu conservée (pas de côte-à-côte), aucune barre de défilement —
tout tient dans le cadre.

## S — Structure : one-page, zéro scroll

`ExpressionEditorInner` borne déjà la hauteur (`h-[calc(100vh-24px)]`) pour que
CHAQUE colonne défile plutôt que la page entière — mais `ParamRow` empile 3
lignes par paramètre (case+label+bornes / curseur+champ essai / champ min+
bouton+champ max+bouton), ce qui force le scroll interne de `<aside>` dès
qu'on approche des 12 lignes. Remplacer par **une seule ligne compacte par
paramètre** : case (dans un vrai `<label>`, pas un `<span>` à côté — garder le
grand target de clic sur le nom), curseur, champ essai, champ min, bouton
"mn", champ max, bouton "mx" — tout sur une ligne, bornes en `title`. Réduire
aussi la zone d'aperçu à une hauteur fixe (`260px` dans la maquette, pas
`aspect-ratio` qui grandit avec le nombre de photos rendues). Avec ces deux
changements, les 12 paramètres + les photos + les aperçus tiennent sans
scroll à la hauteur de `ExpressionEditorScreen`'s `.wrap` actuel — vérifié
dans la maquette (aucun conteneur ne dépasse sa hauteur allouée).

## B — Capacités

### B1. Tester la plage sur plusieurs photos à la fois (jusqu'à 3)
`useExpressionEditor` n'a qu'un `photo`/`previewUrl`/`scoreAfter` unique — la
plage se valide sur UNE photo qu'on espère représentative. Étendre à une
sélection multiple (jusqu'à 3, refuser silencieusement une 4ᵉ n'est pas
suffisant — voir B4) : `selectedPhotos: GalleryItem[]`, `renderPreview()`
appelle `/api/expression/preview` une fois par photo sélectionnée (payload
`trial` identique, un appel par photo — pas de changement serveur), stocke
le résultat par photo (`Record<name, {previewUrl, scoreAfter} | {error}>`).
`renderError` doit devenir **par photo**, pas une chaîne globale : l'échec
d'une photo (ex. pas de visage détecté) ne doit pas bloquer l'affichage des
2 autres qui ont réussi — chaque carte affiche son propre message + un
bouton "réessayer" qui ne relance que cette photo.

### B2. Compteur d'inclusion par groupe
`ExpressionSliders` affiche `group.label` sans dire combien de ses
paramètres sont inclus. Ajouter, à côté du label, `N/${group.params.length}
inclus` (calculé depuis `params`, déjà disponible dans le composant parent).

### B3. Copier la plage d'un autre ton déjà réglé
Nouveau : un menu "Copier depuis…" listant les autres tons de
`creative.tones` qui ont déjà un `expression` sauvegardé (même source que
`tone.expression` utilisé par `initialParamState`), avec en sous-titre les
paramètres que ce ton inclut (`Object.keys(tone.expression)` → labels). Au
clic, applique min/max de ces paramètres sur l'état courant (`included:
true`) — **en un seul geste d'historique** : utiliser `applyParamsAction`
(comme `toggleIncluded`/`setAsMin`/`setAsMax`), jamais `updateParams`, pour
qu'un unique Ctrl+Z annule toute la copie plutôt que de la fusionner avec la
frappe qui suivrait dans la fenêtre de coalescence (400 ms).

### B4. Retour explicite à la limite de 3 photos
Aujourd'hui rien n'empêche de cliquer une 4ᵉ vignette autre que l'absence
d'effet — remplacer le clic mort par un toast ("3 photos maximum — décoche-
en une pour en ajouter une autre").

### B5. Indicateur de rendu périmé
Un curseur bougé APRÈS le rendu laisse les cartes d'aperçu affichées sans le
dire — trompeur en comparaison multi-photos. Garder un timestamp du dernier
rendu et un timestamp de la dernière modification de `params` ; si la
modification est plus récente, afficher sur chaque carte (hors vue
"original") "réglages modifiés depuis ce rendu".

### B6. Garder l'indicateur "modifications non enregistrées"
`dirty` existe déjà (`{dirty && <p>}`) — s'assurer qu'il survit à la
compaction de S : il reste indispensable une fois les lignes resserrées.

## A — a11y

### A1. Les vignettes de photo n'exposent scène/date/score qu'en `title`
`PhotoPicker` pose `title={[item.scene, item.date, item.score].filter(Boolean).join(' · ')}`
sur un `<button>` — hover souris seulement. Basculer sur `data-hint-text`
(le bouton est déjà focusable, pas besoin de `tabIndex`), même contrat que le
reste de l'application (`chrome/HintLayer.tsx`).

## Dépendances

Aucune côté backend : B1 réutilise `/api/expression/preview` tel quel (un
appel par photo) ; B3 lit `creative.tones[].expression`, déjà chargé par
`useTaxonomy`. Uniquement du remaniement frontend (`useExpressionEditor.ts`
passe de valeurs scalaires à des structures indexées par photo).
