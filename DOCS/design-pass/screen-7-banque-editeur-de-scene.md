# Écran 7 — Banque / Éditeur de scène : refonte visuelle validée + audit a11y + capacités

Périmètre validé par l'utilisateur. Fichiers concernés : `src/screens/bank/*`
(`BankScreen.tsx`, `SceneInspector.tsx`, `SceneList.tsx`, `useSceneWorkbench.tsx`,
`WorldBanner.tsx`, `composer/{SceneComposer,PromptField,InfoHint,wardrobeCatalog}.tsx`,
`poses/{PosesView,PoseCard,usePoseBank}.tsx`, `tones/{TonesView,ToneCard,useToneBank}.tsx`).
Structure retenue : les 7 onglets actuels du composeur, resserrés (maquette `2a` —
`Maquettes ecrans prioritaires.dc.html`, turn 2/3). Poses et Tons audités, aucun
trou trouvé — voir §C.

## V — Améliorations visuelles validées (maquettes turn 3, `3a`/`3c`/`3d`/`3e`/`3g`)

Lumière (`3b`) et Amélioration IA (`3f`) restent **tels quels** — décision utilisateur :
Lumière sera retravaillé avec le futur outil de templates de lumière ; IA reste un
onglet séparé en attendant d'être branché à un modèle, pas replié.

### V1. Général — badge de bande visuel
`GeneralPanel` calcule déjà `band = bandOf(...)` et l'affiche en texte
(« niveau minimum — jusqu'à **N** »). Remplacer par une jauge 0→3 compacte (4
segments, les `band[0]`..`band[1]` remplis en accent) cliquable, qui saute
l'utilisateur sur l'onglet Vêtements — le lien entre « pourquoi ce plafond » et
« où le changer » n'existe pas aujourd'hui.

### V2. Vêtements — lignes structurées par niveau
`ClothingPanel` édite `draft.wardrobe` comme du texte libre préfixé
(`"0: description"`, parsé par `textToWardrobe`). Remplacer la zone de texte
unique par 4 champs, un par niveau (0 à 3), chacun un simple texte ; sérialiser
vers la même syntaxe `"N: ..."` en dessous (donc `composePrompt`/`bandOf`
inchangés côté état). Le sélecteur-catalogue (`WARDROBE_CATALOG`) écrit alors
directement dans le champ du niveau actif plutôt que dans une ligne appendée à
l'aveugle — supprime la classe d'erreur « faute de frappe dans le préfixe = 
niveau perdu silencieusement ».

### V3. Pose — raccourci "+ Nouvelle pose" inline
`PosePanel` n'offre aujourd'hui d'éditer une pose déjà assignée (crayon) ou de
choisir dans la grille — créer une pose DEPUIS la scène oblige à sortir vers
`PATHS.bankPoses` ou l'éditeur de pose. Ajouter une tuile "+ Nouvelle pose" dans
la grille elle-même (même modal que `NewPoseModal` utilisé par `PosesView`),
qui assigne le résultat à `draft.pose` à la fermeture au lieu de revenir à la
liste des poses.

### V4. Prompt global — fragments reliés par couleur
`RecapPanel` empile 3 `PromptField` (base/lumière/pose) puis le textarea
`composePrompt(draft)` en lecture seule, sans lien visuel entre les deux :
éditer ici modifie aussi Lumière/Pose (même state) mais rien ne le montre.
Donner à chacun des 3 champs une teinte de bordure distincte (ex. `--acc`,
un vert doux, un violet doux) et surligner le segment correspondant dans le
textarea composé avec la même teinte — la relation devient visuelle, plus
seulement énoncée dans le label ("même champ que l'onglet Lumière").

### V5. JSON final — bouton copier
`JsonPanel` n'a que "Sauvegarder" ; ajouter une icône copier à côté du titre
"JSON final" (`navigator.clipboard.writeText(json)`), utile en support/debug
sans quitter l'écran.

## A — a11y

### A1. Le sélecteur de pose du composeur annonce des noms de fichier bruts
`PosePanel` (`SceneComposer.tsx`) reçoit `poses: string[]` — juste des noms de
fichier, sans le `label` humain que `usePoseBank`/`PoseCard` résolvent déjà côté
écran Poses. Chaque tuile est `<button title={name}><img alt={name}></button>` :
un utilisateur de lecteur d'écran entend le nom de fichier
(`leaning-doorway-standing-01`), jamais un libellé lisible. Fait remonter le
même `label` que `PoseCard` affiche (déjà stocké côté squelette, lu par
`usePoseBank`) jusqu'à ce composant — `poses` doit devenir
`{ name: string; label: string | null }[]`, pas juste `string[]`.

### A2. Badges de scène : l'explication complète n'existe qu'en `title` (survol)
`SceneHeader` pose deux badges sur la miniature — pose imposée (`⛓ pose`,
`title="pose imposée : ${draft.pose}"`) et bande de niveaux (`n{lo}–{hi}`,
`title="niveaux ... déduits des tenues"`) — sur des `<div>` non interactifs, pas
de `tabIndex`, pas de `data-hint-text` (le mécanisme `HintLayer` déjà en place
partout ailleurs dans l'appli n'est pas branché ici). Le fait de base est
visible en texte, le détail ne l'est qu'au survol souris : basculer ces deux
badges sur le même contrat `data-hint-text`/`tabIndex={0}` que `InfoHint` et le
badge de provenance des poses (`PoseCard.tsx`), pour qu'ils soient lisibles au
clavier et par lecteur d'écran.

## B — Capacités

### B1. Dupliquer une scène
`useSceneWorkbench` n'a que `add`/`remove` — pas de `duplicate`, alors que
`usePoseBank.duplicate` existe déjà pour les squelettes et que la scène est
l'objet qu'on itère le plus (une variante de lumière ou de tenue à partir
d'une scène existante). Ajouter `duplicate(index)` : clone le draft avec un
nouveau `uid`, un `id` suffixé (`-copie`, ou `-2`/`-3` en cas de collision),
sélectionne le clone.

### B2. Scène suivante/précédente sans repasser par la liste
Une fois le composeur ouvert, "Suivant"/"Précédent" ne naviguent qu'entre les 7
ONGLETS de la scène courante — changer de SCÈNE oblige à Échap (retour focus
sur la liste, `useSceneWorkbench.close`) puis flèche puis ré-ouvrir. Ajouter
deux chevrons discrets près de l'id dans `SceneHeader` (◂ ▸), qui avancent
`bench.selectedIndex` dans `bench.shown` sans fermer le composeur — mêmes
raccourcis clavier que `onListKeyDown` (Haut/Bas) mais actifs même quand le
focus est dans le composeur, pas seulement dans la liste.

### B3. Annuler un patch de scène en cours d'édition
`onPatch` écrit directement dans le draft (`patchDraft`), sans historique — un
champ vidé par erreur (ex. Prompt de base effacé par un Ctrl+A/Suppr distrait)
n'a pas de rattrapage avant "Enregistrer". L'éditeur de pose a déjà ce
mécanisme (`usePoseEditor`'s undo stack). Ajouter la même pile d'annulation
(bornée, en mémoire, par scène ouverte) sur `patchDraft`, Ctrl+Z/Ctrl+Maj+Z
actifs quand le composeur a le focus — même contrat que `handlePoseKeyDown`
dans `PoseCanvas.tsx` (garde `isTextEntry`, n'intercepte pas la frappe dans un
champ).

## C — Poses / Tons

Audités (`PosesView`, `PoseCard`, `usePoseBank`, `TonesView`, `ToneCard`,
`useToneBank`) : menu à focus roulant déjà correct (`PoseCard`'s
`onMenuKeyDown`), libellés natifs (jamais `sr-only` là où un vrai `<label>`
suffit), état de provenance exposé par `data-hint-text` déjà branché, aucune
dépendance à la seule couleur trouvée. **Aucune action nécessaire.**
