# Écran 5 — Revue / Galerie (`/review`, `/gallery`)

Dossier visé (refonte) : `AUTOMATION/web/ui/src/screens/review/` — `ReviewScreen`, `Tile`, `FullFrame`, `ReviewActions`, `FlagButtons`, `DeclineDialog`, `PhotoEditor`, `EmptyState`, `ScoreBars`, `useReviewKeys`, `useSortActions`, `useTriage`, `actionStyles`. Nouveaux fichiers proposés : `Filmstrip.tsx`, `SurveyMode.tsx`, `useSelection.ts` (sélection multiple), extension de `useSortActions` (action groupée) et de `PhotoEditor.tsx` (avant/après).

Source lue : les 13 fichiers existants, en entier. Statut : **proposition à valider**, à déposer dans `DOCS/design-pass/` avant exécution — même séquence que les écrans 1-4. Portée élargie sur demande explicite : au-delà de l'audit d'accessibilité (§0-§4.1-4.5 ci-dessous, inchangés), cinq capacités de studio professionnel (§0bis, §4.6-4.10), toutes cinq à livrer avant validation.

## 0 — Constat, avant tout changement (audit a11y — inchangé)

Écran déjà très mûr : deux silences distincts dans `EmptyState` (dossier vide vs filtre qui masque), `ArmingNotice` de `DeclineDialog` qui dit où armer plutôt que de proposer un second chemin, garde-fous complets de `useReviewKeys`, confirmation à triple conséquence avant suppression définitive, bouton « Poster sur Instagram » inerte qui dit pourquoi en texte visible. Ce livrable ne redécrit rien de tout ça — six trous concrets trouvés en lisant le code :

1. **Quatre groupes segmentés sans rôle ni état exposés** : `#spaceSel`, `#bucketSel`, `#scoreSel`, `#viewSel` — boutons `.seg` avec seulement une classe `on`, aucun `role`/`aria-checked`. Même motif déjà corrigé sur le Wizard (écran 1) et Produire (écran 3), manqué ici.
2. **`#edRatio`** dans `PhotoEditor` (format de recadrage) — cinquième groupe du même type.
3. **Jugements de réalisme sans état exposé** (`FlagButtons`, ◉/◌) : l'état actif ne tient qu'à une classe de couleur, pas de `aria-pressed`.
4. **Vignette visée par le clavier non annoncée** (`Tile.tsx`, `data-cur`) : marqueur en bordure colorée seulement.
5. **Seuil exact du filtre de score en `title` seulement** (`#scoreSel`).
6. **Deux « chargement… » restés en texte nu** (`DeclineDialog`, `PhotoEditor`).

## 0bis — Cinq capacités ajoutées, esprit studio professionnel

L'audit ci-dessus ne change rien à l'*expérience* de triage. Cinq manques concrets face aux outils de référence (Lightroom/Bridge pour le tri de lots, Resolve pour la comparaison de versions, Photoshop pour l'inspection) :

### A. Filmstrip persistant en plein cadre
**Constat** : `FullFrame` (vue « Revue ») affiche une seule image + deux flèches ‹ › + un compteur texte (`props.index+1 / props.total`) — on navigue à l'aveugle, sans jamais revoir le dossier pendant qu'on juge. Lightroom et Resolve gardent toujours une bande de vignettes visible, quel que soit le mode d'affichage.
**Design** : nouveau composant `Filmstrip.tsx`, monté par `ReviewScreen` sous `FullFrame` quand `view==='revue'` — bande de ~64px, une vignette (`api.image({...item, thumb:true})`, déjà chargée pour la grille, aucun appel réseau supplémentaire) par image de `shown`, largeur fixe ~48px, défilement horizontal. La vignette courante porte l'anneau `--acc` + `aria-current` (même motif que §4.3 du Tile). Clic = `setCursor(index)`. Défilement automatique pour garder la vignette courante visible : calcul manuel de `scrollLeft` sur changement de `safeCursor` (pas de `scrollIntoView`, proscrit dans ce projet). Les flèches ‹ › restent — un pas, quand la bande n'a pas le focus.

### B. Mode Comparer / Survey
**Constat** : Galerie et Revue sont strictement une-image-à-la-fois ; réduire un lot de variantes du même sujet à une seule passe par des allers-retours en plein cadre.
**Design** : troisième option dans `#viewSel` (Grille / Revue / **Comparer**), nouveau composant `SurveyMode.tsx`. Sélection multiple dans la grille (case à cocher au coin haut-gauche des vignettes, par-dessus le score) puis passage en Comparer : jusqu'à 4 images côte à côte, chacune avec son score, ses jugements ◉/◌, et un bouton « Garder cette version » — qui `act('valider', index)` sur celle-ci et propose (confirmation groupée, jamais silencieuse) de rejeter les autres. S'appuie entièrement sur `shown`/`act()` déjà là — aucune route serveur nouvelle pour cette V1. Le banc de comparaison dédié de l'ADR-0021 (variantes d'une même scène, mesures détaillées côte à côte) est une capacité serveur plus riche, à brancher plus tard sur ce même mode — pas un doublon.

### C. Loupe / zoom in-place
**Constat** : la seule inspection fine passe par la lightbox plein écran (`useLightbox`), qui fait quitter le contexte (panneau de mesures, actions). Repérer un défaut IA (mains, yeux, arrière-plan) puis agir dessus demande d'aller-retour entre deux vues.
**Design** : sur `FullFrame`, `#stageImg` devient zoomable en place — molette ou boutons +/− entre 100/150/200 %, pan par glisser une fois zoomé (`cursor:grab`→`grabbing`), double-clic remet à 100 %. Indicateur de niveau visible en texte (« 150 % »), pas seulement le curseur. La lightbox existante reste pour un examen hors contexte ; le zoom in-place garde mesures et actions à côté pour juger ET agir sans changer de vue.

### D. Sélection multiple + actions groupées
**Constat** : le tri se fait une image à la fois (`act(action, index?)` ne prend qu'un index).
**Design** : en vue Grille (hors mode Comparer), nouveau `useSelection.ts` — clic sur case à cocher, Maj-clic pour une plage, Ctrl/Cmd-clic pour ajouter une image isolée. Une barre d'actions apparaît (remplace temporairement la ligne de filtres) avec le compte sélectionné et les mêmes boutons de tri (Garder/Rejeter/Archiver), appliqués à toute la sélection : extension de `useSortActions` avec un `actMany(action, names)` qui enchaîne les appels `/api/action` déjà utilisés un par un, un seul toast récapitulatif (« 6 images archivées ») plutôt que six. Échap vide la sélection (même règle que toute overlay/état transitoire du studio).

### E. Avant/après dans l'éditeur photo
**Constat** : `PhotoEditor` applique tous les réglages en direct, sans bascule pour revoir l'original.
**Design** : un bouton dédié (pas seulement une touche maintenue, pour rester découvrable et utilisable par tous) qui, activé, remplace temporairement le rendu par `NEUTRAL` (déjà la constante « aucun réglage » du fichier) sans recadrage ni rotation — l'image telle qu'ouverte. Un second clic revient aux réglages en cours. Le message d'état (`edMsg`) indique lequel des deux est affiché.

## 1 — Tokens utilisés

Aucun token nouveau, pour l'audit comme pour les cinq capacités. La sélection (case cochée, anneau du mode Comparer) réutilise `--acc`/`--on-acc` ; l'overlay de case à cocher réutilise `--scrim` ; le filmstrip et les séparateurs de la barre d'actions groupées réutilisent `--line`/`--panel2`. Écran déjà en modèle Poste de travail plein largeur, déjà sous le thème actif (Phase 0b, aucune dépendance à un pack).

## 2 — Les quatre états

### Chargement
- `DeclineDialog`/`PhotoEditor` : voir §0.6.
- Filmstrip et mode Comparer suivent le même `loading` que la grille — pas d'état de chargement séparé, les deux dérivent de `shown`.

### Erreur
- Inchangé — voir version précédente de ce document : tout est déjà remonté par toast/bandeau global avec message serveur verbatim.
- Nouveau cas : `actMany` (§0bis.D) doit distinguer un échec partiel d'un échec total — le toast récapitulatif dit combien ont réussi (« 4/6 archivées, 2 échecs : *raison* ») plutôt qu'un succès ou un échec unique qui mentirait sur le reste du lot.

### Vide
- Inchangé (`EmptyState` déjà correct).
- Mode Comparer avec 0 ou 1 sélection : message actionnable (« Sélectionne au moins deux images pour comparer ») plutôt qu'un écran de comparaison vide.

### Rempli
- Disposition de base inchangée. Les six corrections d'audit (§0) et les cinq capacités (§0bis) s'appliquent à l'intérieur de cet état.

## 3 — Inventaire commun vs pack

| Élément | Commun / Pack |
|---|---|
| Grille, cadre plein, filmstrip, mode Comparer, sélection groupée, éditeur photo, dialogue de déclin | Commun — structure et comportement identiques quel que soit le pack |
| Contenu (scènes, scores, prompts) | Donnée du personnage/de la production |
| Couleurs effectives | Thème actif (Phase 0b), jamais une branche de code |

Aucun branchement conditionnel par pack, ni dans le code existant ni dans les cinq ajouts.

## 4 — Clavier, focus, a11y

### 4.1 — Cinq groupes à choix unique → radiogroup
`#spaceSel`, `#bucketSel`, `#scoreSel`, `#viewSel` (désormais 3 options, voir §0bis.B) et `#edRatio` : `role="radiogroup"` + `aria-label`, chaque bouton `role="radio"` `aria-checked={actif}`.

### 4.2 — `aria-pressed` sur les jugements de réalisme
`FlagButtons.tsx` : `aria-pressed={item.flag === 'ok'}` / `aria-pressed={item.flag === 'ia'}`.

### 4.3 — Vignette visée, annoncée
`Tile.tsx` : `aria-current={props.current ? 'true' : undefined}` en plus de la bordure.

### 4.4 — Seuil du filtre de score, en `aria-label`
`#scoreSel` : `aria-label={\`${entry.label} — ${scoreFilterTitle(entry.key, qc)}\`}`, `title` conservé pour la souris.

### 4.5 — Deux `chargement…` en texte nu
`DeclineDialog.tsx`/`PhotoEditor.tsx` : texte qui dit ce qui charge.

### 4.6 — Filmstrip : clavier et rôle
`role="listbox"` `aria-label="Images du dossier"`, chaque vignette `role="option"` `aria-selected={courante}`. Flèches ← → déplacent la sélection ET le curseur (même comportement que les flèches ‹ › existantes — pas un second système, une seconde surface pour le même geste). La bande elle-même n'est jamais un piège au clavier : `Tab` la traverse comme un seul arrêt (tabindex baladeur sur l'option courante), pas une vignette par arrêt.

### 4.7 — Mode Comparer : cases à cocher et sortie
Chaque case : vrai `<input type="checkbox">` visuellement stylé (jamais un `<div>` cliquable), libellé accessible (« Sélectionner {nom} pour comparer »). Passage en mode Comparer et retour : `Échap` revient à la Grille en conservant la sélection (elle n'est pas perdue, contrairement à une fermeture de dialogue) — cohérent avec la règle « Échap ferme une overlay », le mode Comparer EST une overlay de traitement, pas un dialogue modal classique.

### 4.8 — Zoom in-place : découvrable et annoncé
Boutons +/− avec `aria-label` (« Zoomer », « Dézoomer ») en plus de la molette (la molette n'est jamais le seul moyen). Niveau affiché en texte, `aria-live="polite"` sur ce texte pour qu'un changement de zoom soit annoncé sans voler le focus. Le pan au glisser n'a pas d'équivalent clavier dédié — acceptable ici car il ne fait que repositionner une vue déjà zoomée, jamais une action destructive ou irréversible (même principe que le drag du cadre de recadrage de `PhotoEditor`, déjà accepté tel quel dans l'audit initial).

### 4.9 — Sélection multiple : annonce du compte et de l'issue
La barre d'actions groupées affiche le compte en texte visible (« 6 sélectionnées ») et le confirme via `role="status"` à chaque ajout/retrait — pas seulement une coche qui change de couleur. `Échap` vide la sélection et rend le focus à la grille.

### 4.10 — Avant/après : bouton, jamais une touche seule
Le bouton avant/après est un vrai `<button aria-pressed>` (état « affiche l'original » vs « affiche l'édition ») — la touche `Alt` maintenue reste un raccourci additionnel, jamais le seul chemin.

### Déjà correct, non modifié
- `EmptyState`, `ArmingNotice`, gardes de `useReviewKeys`, confirmation de suppression définitive, `aria-label` de toutes les actions icône-seule existantes, raison visible du bouton Instagram inerte, `aria-pressed` déjà présent sur `edFlip`.

## 5 — Emplacement

**Audit (§0, 4.1-4.5)** : `ReviewScreen.tsx`, `PhotoEditor.tsx` (`#edRatio` + §4.5), `FlagButtons.tsx`, `Tile.tsx`, `DeclineDialog.tsx` (§4.5).

**Capacités ajoutées (§0bis, 4.6-4.10)** : nouveaux `Filmstrip.tsx`, `SurveyMode.tsx`, `useSelection.ts` ; extensions de `ReviewScreen.tsx` (montage du filmstrip et du mode Comparer, 3ᵉ option de `#viewSel`), `useSortActions.tsx` (`actMany`), `Tile.tsx` (case à cocher du mode sélection), `FullFrame.tsx` (zoom in-place), `PhotoEditor.tsx` (bouton avant/après). Aucun autre fichier du dossier touché.

---

En attente de votre validation avant l'écran suivant.
