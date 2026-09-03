
# Écran 3 — Créer / Produire (`/produce`)

Dossier visé (refonte) : `AUTOMATION/web/ui/src/screens/produce/` — 14 fichiers (`ProduceScreen`, `IntensityBar`, `RunPanel`, `Inspector`, `IntentCard`, `SceneCard`, `EditStep`, `PromptPreview`, `SettingsPanel`, `runSummary`, `settings`, `useNsfwSources`, `useProduceState`, `useSceneChoice`).

Source lue : les 14 fichiers en entier + `DESIGN.md` (modèle Poste de travail, inventaire des composants déjà partagés).

## 0 — Ce qui change, et pourquoi

Aucune refonte de disposition : le modèle Poste de travail (`.cr-main`/`.cr-side`, sortie du centrage `--maxw`) est déjà en place et déjà la référence que le Wizard a reprise (écran 1). Ce qui change ici, ce sont des **trous d'accessibilité et d'état concrets**, trouvés en lisant le code — pas une hypothèse :

1. Trois groupes à **choix unique** (intensité, qualité, ton) sont de simples `<button>` avec une classe `.on` — **aucun `aria-pressed`/`aria-checked` nulle part**. Un lecteur d'écran ne sait pas lequel est actif. Le Wizard (écran 1) avait au moins `aria-pressed` (imparfait, corrigé en radiogroup) ; ici, il n'y a rien du tout.
2. La bibliothèque d'instructions déjà employées (`EditStep`, `#biblioList`) est une liste de `<div onClick>` — **pas focusable, pas activable au clavier**. Le commentaire du fichier dit lui-même que c'est l'action la plus répétée du flux NSFW (« l'instruction la plus fréquente retapée 6 fois ») : c'est une action à haute fréquence au sens du cadrage, et elle est aujourd'hui inatteignable au clavier.
3. Le bouton **⚙ Réglages** (`#btnGear`) n'a pas d'`aria-label` — un bouton icône-seule sans libellé, contraire à la règle du cadrage.
4. Les vignettes du panneau d'exécution (`RunPanel`, bande de résultats) portent le verdict **uniquement par la couleur de bordure** — `alt=""` sur chaque image, rien de lisible au clavier/lecteur d'écran pour « validée / à revoir / rejetée ».
5. `PromptPreview` et `SettingsPanel` sont deux panneaux flottants ouverts par bouton — ni l'un ni l'autre ne se ferme à **Échap**, contrairement à la règle du cadrage sur les overlays.
6. Les cases désactivées de `SettingsPanel` (ex. « Sans contrôle d'identité » au niveau NSFW) expliquent pourquoi **uniquement via `title`** — un survol souris, invisible au clavier.

Tout le reste (grille de scènes, grille de sources NSFW, curseurs de réglages, aperçu de prompt, panneau d'exécution) est déjà correctement structuré — sélection multiple en vrais `<button aria-pressed>`, statuts déjà doublés d'un texte, curseurs déjà nativement clavier. Ce livrable ne les redécrit pas, il corrige les six points ci-dessus.

## 1 — Tokens utilisés

Aucun token nouveau. Tout l'écran vit déjà sous la feuille active (Commune hors personnage résolu ; Léna ou Abyssiaelle une fois un personnage chargé — comme la Fiche, écran 2). Rappel des zones déjà sur tokens, sans changement :

| Zone | Tokens |
|---|---|
| Barre d'intensité, cartes intention/scène/source, panneau réglages, panneau d'exécution | `--panel`, `--panel2`, `--line`, `--line2`, `--r` |
| Sélection active (bordure, coche, segmentés) | `--acc`, `--on-acc` |
| Teintes de palier (`TIER_TINT`) | `--ok`, `--warn`, `--bad` + `--bg` en texte sur fond plein (contraste déjà mesuré ≥ AA dans le commentaire du code) |
| Bandeaux d'alerte (mots échos, instruction) | `--warn-bg`/`--warn-line`/`--warn-txt` |
| Voile / ombre des panneaux flottants | `--scrim`, `--elev` |
| Confirmé/pas confirmé (« mesuré ») | `--mes-bg`/`--mes-line`, `--ok` (texte) |
| `--maxw` | **non utilisé** (poste de travail plein largeur, comme documenté dans le code) |

## 2 — Les quatre états

### Chargement
- **Trou identifié** : tant que `creative` (taxonomie) n'est pas chargé, `tiers = []` — la barre d'intensité affiche le seul libellé « Intensité » sans aucun bouton, un segmenté vide et déroutant. Remplacé par un squelette : 3 pastilles `--panel2` de la largeur d'un bouton de palier, sans texte.
- Le reste du flux (Intention/Ton/Scènes) ne s'affiche déjà qu'une fois les données présentes — pas de changement là.

### Erreur
- Échec de chargement de la taxonomie/config : remonté par le bandeau de faute global (chrome, `FaultBar`) — c'est déjà la couche qui porte « job en cours ou dernière erreur » en permanence (contrainte transverse), rien à dupliquer ici.
- Échec du plan (`plan.erreur`) : déjà actionnable — remonté texte dans `sumT` de la barre de lancement (« au moins une image source », message serveur verbatim, etc.). Conservé à l'identique.
- Échec du lancement (`POST /api/run`) : déjà un toast avec le message serveur. Conservé.

### Vide
- Aucune scène à ce niveau, aucune image source éditable, bibliothèque d'instructions vide, aucune dernière image (Inspector) : les quatre sont déjà des messages textuels actionnables ou explicites (« aucune image à éditer — produis d'abord au cran Soft », « le journal d'édition est vide », « rien encore pour *nom* »). Conservés à l'identique — rien à corriger.

### Rempli
- Disposition et enchaînement des blocs inchangés. Les six corrections du §0 s'appliquent à l'intérieur de cet état.

## 3 — Inventaire commun vs pack

| Élément | Commun / Pack |
|---|---|
| Barre d'intensité, blocs Intention/Ton/Scènes/Édition, panneau Réglages, panneau d'exécution, inspecteur | Commun — structure et comportement identiques quel que soit le pack |
| Contenu des paliers (`tiers`), intentions, tons, scènes, réglages exposés | Commun dans leur **mécanique** ; leur **contenu** (labels, seuils, presets) vient de `creative.json`/`scenes.json` du personnage — une donnée de personnage, pas une variation de code par pack (`if character == x` reste absent) |
| Couleurs effectives (`--acc`, fonds) | Pack, comme toute la feuille active |

Aucun branchement conditionnel par pack dans le code lu — conforme à la contrainte transverse.

## 4 — Clavier, focus, a11y (le cœur de ce livrable)

### 4.1 — Trois groupes à choix unique : passage en radiogroup
Concerne `IntensityBar` (paliers), le sélecteur Qualité de la barre de lancement (Réalisme/Rapide/Brut), et la rangée de Tons (`#toneRow`). Même correction que l'écran 1, appliquée indépendamment ici car ce sont trois implémentations de boutons distinctes, pas `OptionCard` :
- Conteneur : `role="radiogroup"` + `aria-label` (« Niveau d'intensité », « Qualité de rendu », « Ton »).
- Chaque bouton : `role="radio"` `aria-checked={actif}`, tabindex baladeur (seul l'actif à `tabIndex=0`).
- Flèches ← → sélectionnent immédiatement (cohérent avec le geste actuel — un clic simple change déjà le palier/qualité/ton sans confirmation, sauf le palier qui déclenche une confirmation modale à certains seuils : le comportement de confirmation est conservé, la flèche déclenche le même chemin que le clic).
- `Home`/`End` → premier/dernier palier ou ton.

### 4.2 — Bibliothèque d'instructions : rendre le clic clavier-opérable
`#biblioList` (`EditStep.tsx`) : chaque ligne passe de `<div onClick>` à un vrai `<button type="button">` pleine largeur (mêmes styles), conservant `title` (alertes en info-bulle, en plus — pas à la place — d'un indicateur visible : le point `!` d'alerte est déjà du texte). Rejoint le radiogroup logique de la liste ? Non — c'est une liste d'**actions** (chaque clic remplit le champ, ce n'est pas un état qui reste sélectionné) : `<button>` simple dans l'ordre de tabulation naturel suffit, pas de rôle spécial.

### 4.3 — `aria-label` sur le bouton Réglages
`#btnGear` (`⚙` seul) → `aria-label="Réglages de génération"`. C'est le seul bouton icône-seule sans libellé trouvé sur cet écran (`#btnRunFermer` et `apFermer` en ont déjà un, ou du texte visible).

### 4.4 — Statut non-couleur sur les vignettes du panneau d'exécution
Chaque `<img>` de la bande de résultats (`RunPanel`) passe de `alt=""` à un texte réel : `` `${VERDICT_LABEL[entry.bucket] ?? 'statut inconnu'}${entry.scene ? ' · ' + entry.scene : ''}` ``. La bordure colorée reste (renfort visuel), mais l'information n'est plus portée qu'elle seule — corrige directement la règle « statut jamais par la couleur seule », qui s'appliquait déjà au texte de `AdultContent` (écran 2) et n'était pas tenue ici.

### 4.5 — Échap ferme `PromptPreview` et `SettingsPanel`
Les deux panneaux (aperçu de prompt au-dessus de la barre de lancement, réglages ancrés en bas à droite) sont de vraies overlays fonctionnelles (ils se superposent au contenu, ouverts/fermés par bouton) : ajout d'un gestionnaire clavier commun — `Échap` appelle `onClose`/`toggleGear(false)` quand le panneau concerné est ouvert. Focus : à l'ouverture, focus déplacé sur le premier contrôle du panneau (le champ d'amendement pour l'aperçu ; le premier réglage pour les réglages) ; à la fermeture, focus rendu au bouton qui a ouvert le panneau (`#btnApercu` / `#btnGear`) — ni l'un ni l'autre n'est géré aujourd'hui dans le code lu.

### 4.6 — Raison des réglages désactivés, en texte visible
`SettingRow` (`SettingsPanel.tsx`) : le cas désactivé (`noqc` au niveau NSFW) n'expose sa raison que via `title`. Ajout d'un texte visible sous le contrôle quand `disabled` est vrai — même gabarit que `HELP` (`.text-dim`), teneur : *« indisponible au niveau NSFW — protège l'enchaînement automatique »* (texte déjà écrit dans le `title` actuel, simplement rendu visible et donc perceptible au clavier/lecteur d'écran).

### Déjà correct, non modifié
- Grilles de scènes et de sources NSFW : vrais `<button aria-pressed>`, coche visible en plus de la bordure — conforme, rien à changer.
- Curseurs de réglages (`type="range"`) : nativement opérables aux flèches — conforme.
- `<details>` (préambule, journal technique, bibliothèque, sections repliables) : disclosure natif, déjà clavier-opérable ; Échap ne s'y applique pas (ce n'est pas une overlay) — à dessein, pas un oubli.
- Dots de score QC : toujours accompagnés du chiffre en texte — conforme.

## 5 — Emplacement

Refonte de `screens/produce/` existant. Fichiers touchés par ce livrable : `IntensityBar.tsx` et le sélecteur Qualité + rangée de Tons dans `ProduceScreen.tsx` (radiogroup, §4.1), `EditStep.tsx` (bibliothèque en boutons, §4.2), `ProduceScreen.tsx` (`aria-label` du bouton Réglages, §4.3), `RunPanel.tsx` (`alt` des vignettes, §4.4), `PromptPreview.tsx` + `SettingsPanel.tsx` + `ProduceScreen.tsx` (Échap + gestion de focus, §4.5), `SettingsPanel.tsx` (raison visible, §4.6). Aucun autre fichier du dossier modifié.

---

En attente de votre validation avant l'écran suivant.
