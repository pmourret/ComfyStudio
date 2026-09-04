# Écran 3 — Produire : refonte pro (big bang) + audit a11y + capacités

Périmètre validé par l'utilisateur. Fichiers concernés : `src/screens/produce/*`
(`ProduceScreen.tsx`, `IntensityBar.tsx`, `RunPanel.tsx`, `Inspector.tsx`,
`SettingsPanel.tsx`, `settings.ts`, `PromptPreview.tsx`, `SceneCard.tsx`,
`IntentCard.tsx`, `EditStep.tsx`, `useProduceState.ts`, `useSceneChoice.ts`,
`useNsfwSources.ts`, `useOverlayPanel.ts`, `runSummary.ts`). Maquette validée :
`Maquettes ecrans prioritaires.dc.html`, turn 5 (`5a`) ; turn 4 (`4a`) garde
l'audit intermédiaire pour référence. Direction choisie par l'utilisateur :
paradigme Lightroom/Capture One, hybride (rail permanent + contenu qui change),
sélection de scènes en priorité visuelle, comparaison en premier plan, réglages
techniques inchangés (tiroir), système visuel étendu (densité data : histogrammes).

## S — Structure (le big bang)

L'assistant pas-à-pas (`#stepIntent` → `#stepTone` → `#stepScenes`, cartes qui
n'apparaissent qu'une décision prise) est remplacé par un espace permanent :

- **Rail gauche (~170px), nouveau composant `IntentRail.tsx`.** Extrait de
  `#intentGrid`/`#intentVides`/`#toneRow` dans `ProduceScreen.tsx` — même
  logique (`pickIntent`, `useRovingChoice`, cartes vides → `goCompose`), mais
  rendu en liste compacte toujours visible, plus en cartes qui se révèlent.
  L'intention par défaut n'est plus `null` : présélectionner la première
  intention non vide au montage (aujourd'hui l'écran démarre sans grille de
  scènes tant qu'on n'a pas cliqué).
- **Centre : la grille de scènes devient le hero.** `SceneCard.tsx` gagne une
  barre de recherche + tri (nouveau, purement client sur `visibleScenes` de
  `useSceneChoice` — substring sur `scene.id` pour la recherche ; tri "jamais
  produites"/"meilleur score"/"nom" en plus du tri par affinité de ton déjà
  fait par `useSceneChoice`) et un mini-histogramme par carte (voir §Dépendances).
- **Droite : panneau "développement", nouveau composant `SceneDevelopPanel.tsx`.**
  Remplace le rôle "dernière image" isolé d'`Inspector.tsx` par : la dernière
  image en tête (condensé, 1 ligne + miniature 44×56), puis le détail de la
  scène pointée (histogramme de score détaillé, tons affins, pose imposée,
  actions "✎ Éditer la scène" / "Sélectionner"). `Inspector.tsx` n'est plus
  monté seul sur cet écran — sa logique "dernière image" migre dans l'en-tête
  du nouveau panneau.
- **Comparaison, nouveau composant `SceneCompareView.tsx`.** Bouton "Comparer
  (N)" dans la barre d'outils du centre, actif dès 2 scènes cochées ; bascule
  la grille en vue côte-à-côte (candidates + score + action "Retenir"). Pas de
  persistance prévue dans cette passe — la sélection reste en mémoire d'écran,
  voir §Dépendances si on veut mémoriser un choix.
- **File de production, nouveau composant `QueueRail.tsx`.** Remplace
  `RunPanel.tsx` monté en flux (au-dessus des blocs, fermé une fois pour
  toutes par batch) par une bande fine et permanente juste au-dessus du
  bandeau de lancement : le lot en cours (`state.running`, `state.index`,
  `state.total`) + un court historique en mémoire (3 derniers lots, juste le
  libellé — pas de nouvel appel serveur). **Le pipeline reste mono-GPU**
  (`state.running` est un booléen unique côté serveur) : cette file est un
  historique qui ne se réouvre plus, jamais une exécution parallèle — ne pas
  la présenter comme une vraie file d'attente multi-jobs.
- L'`IntensityBar.tsx` et ses paliers (dont la confirmation `requires:'confirm'`)
  restent inchangés en logique — seule la ligne de texte visible change, voir A1.
- Le bloc édition NSFW (`sources.map(...)` + `EditStep.tsx`) suit la même
  bascule hero/panneau : la grille de sources devient le centre (avec le
  raccourci "Tout cocher/décocher", capacité B2), l'instruction + le préambule
  + l'historique migrent dans le panneau de droite à la place du bloc `Inspector`.

## A — a11y (portées depuis l'audit turn 4)

### A1. Le fragment de prompt ajouté par chaque palier n'existe qu'en `title`
`IntensityBar.tsx` pose `title={entry.prompt_add || 'aucun ajout de prompt'}`
sur chaque bouton de palier — hover souris seulement, jamais lu au clavier ou
par lecteur d'écran, alors que `#intHint` affiche déjà en texte visible
`"exportable · N scène(s) disponible(s)"` pour le palier actif. Concaténer
`tier.promptAdd` à cette même ligne visible (`... · ajoute : ${prompt_add}`)
et retirer le `title` redondant.

### A2. Le badge "⛓ pose" d'une scène n'annonce la pose qu'au survol
`SceneCard.tsx` pose `title={`pose imposée : ${meta.pose}`}` sur un simple
`<div>`, sans `tabIndex` ni `data-hint-text` — même classe de trou déjà
corrigée côté Banque (`SceneComposer.tsx`/`PoseCard.tsx`, design pass écran 7
§A2) mais jamais reportée ici. Basculer sur le même contrat `data-hint-text`
+ `tabIndex={0}` (`chrome/HintLayer.tsx`, déjà branché partout ailleurs dans
l'appli).

### A3. Le badge "mesuré" des réglages n'expose la valeur de référence qu'en `title`
`SettingsPanel.tsx` (`SettingRow`, branche curseur) pose
`title={`valeur mesurée du projet : ${...}`}` sur le badge, même trou. Même
correction : `data-hint-text` + `tabIndex={0}` sur le `<span data-mes>`.

## B — Capacités

### B1. Le bandeau de lancement ne dit pas toujours pourquoi il est bloqué
`runSummary.ts` couvre "pas d'intention", "pas de scène", "scène non
enregistrée" et `plan.erreur`, mais **pas** les deux autres branches de
`runDisabled` dans `ProduceScreen.tsx` (`!comfy`, `running`) : Comfy hors
ligne ou un lot déjà en cours laissent le bouton mort sans un mot, alors que
le fichier revendique être "the only place that says why a launch is not
possible". Ajouter deux branches à `runSummary()` (params `comfy: boolean` et
`running: boolean`, déjà calculés dans `ProduceScreen.tsx`) :
"ComfyUI est hors ligne — impossible de lancer" / "un lot est déjà en cours —
attends qu'il se termine ou arrête-le", avant la branche de succès.

### B2. Tout cocher/décocher les images sources NSFW
Le bloc édition (`sources.map(...)` dans `ProduceScreen.tsx`) coche une image
à la fois — sans capacité de bascule groupée alors que `useNsfwSources`
expose déjà `setPicked`. Ajouter un bouton "Tout cocher"/"Tout décocher" dans
la barre d'outils du centre (bascule selon si `picked.size > 0`).

### B3. Raccourci ✎ pour éditer une scène depuis sa carte
Aujourd'hui, retoucher une scène depuis Produire oblige à retourner dans la
Banque et la retrouver dans la liste. Ajouter un petit bouton "✎" en coin de
`SceneCard.tsx` qui navigue vers `PATHS.bankScenes` **avec la scène pré-
sélectionnée** — nécessite que `useSceneWorkbench`/`BankScreen.tsx` accepte un
paramètre d'ouverture directe (ex. `?scene=<id>` ou state de navigation), à
coordonner côté Banque si ce n'est pas déjà supporté.

### B4. Amendement par fragment pour ce lancement (lumière, expression, pose, vêtements)
`PromptPreview.tsx` n'offre qu'un seul champ libre, `sceneOverride`
(`scene_override` au payload), réservé à une scène unique — une réécriture
globale, pas un ajustement ciblé. Ajouter 4 champs courts (Lumière,
Expression, Pose, Vêtements) sous ce même panneau, mêmes règles (une seule
scène cochée, rien écrit dans `scenes.json`) — voir §Dépendances pour le
câblage serveur, le payload actuel n'a qu'un seul champ `scene_override`.

## Dépendances à coordonner (hors seul frontend)

- **Histogramme de score (grille + panneau développement).** `bank.stats[id]`
  ne porte que `{avg, n}` (`SceneCard.tsx`) — il faut une répartition par
  paliers de score (ex. `bank.stats[id].buckets: number[5]`) côté backend/
  pipeline de scoring pour remplacer les barres statiques de la maquette par
  de vraies données.
- **B4 (amendement par fragment).** Le serveur ne connaît aujourd'hui que
  `scene_override` (une chaîne). Reprendre 4 amendements distincts suppose
  soit de les fusionner côté client dans ce même champ (le plus simple, aucun
  changement serveur, mais perd la distinction par fragment dans le journal),
  soit d'étendre le payload `/api/run` et `apercu_prompt()` pour accepter des
  overrides nommés — à trancher avec qui maintient le pipeline de prompt.
- **B3 (raccourci ✎).** Ouverture directe d'une scène dans le composeur de la
  Banque depuis une autre route — à confirmer que `useSceneWorkbench` le
  supporte déjà ou doit être étendu.
