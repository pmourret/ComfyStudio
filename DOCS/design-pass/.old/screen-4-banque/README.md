
# Écran 4 — Banque (`/bank/scenes`, `/bank/poses`, `/bank/tones`)

Dossier visé (refonte) : `AUTOMATION/web/ui/src/screens/bank/` — `BankScreen`, `SceneList`, `SceneInspector`, `WorldBanner`, `useSceneWorkbench`, plus `composer/` (`SceneComposer`, `PromptField`, `InfoHint`, `wardrobeCatalog`), `poses/` (`PosesView`, `PoseCard`, `usePoseBank`), `tones/` (`TonesView`, `ToneCard`, `useToneBank`). `Composer.tsx` (l'ancien compositeur LLM) est explicitement retiré de cet écran par son propre commentaire de code (« RETIRED FROM THIS SCREEN, not deleted ») — non monté sur aucune route actuelle, donc hors périmètre de ce livrable.

Source lue : les 16 fichiers ci-dessus, en entier.

## 0 — Constat, avant tout changement

Ce dossier est déjà le plus mûr des trois écrans revus jusqu'ici sur l'accessibilité : `role="group"`/`aria-pressed` déjà posés correctement sur les groupes à choix unique (densité de vignettes, mode Personnage/Monde de l'inspecteur), Échap + retour de focus déjà câblés sur l'inspecteur de scène et sur le menu d'actions d'une pose, navigation clavier déjà réfléchie (flèches dans la liste de scènes, ← → pour replier/déplier un groupe, roving tabindex dans le menu d'une pose), statuts déjà non-coloriels (bandeau de dérive du monde, badges de provenance). Ce livrable **ne redécrit pas** ce qui marche déjà — il porte sur les deux trous concrets trouvés en lisant le code, plus un état de chargement resté en texte nu.

1. **Raison d'un contrôle désactivé donnée uniquement en `title`** (`PoseCard.tsx`, actions « dupliquer »/« renommer » sur une pose sans points-clés) — même défaut que celui déjà corrigé sur l'écran Produire (§4.6 de son livrable), ici dans un composant différent.
2. **Deux grilles de sélection à choix unique sans groupe nommé** (`SceneComposer.tsx` — sélecteur de vêtement dans l'onglet Vêtements, sélecteur de squelette dans l'onglet Pose) : même motif de bouton `aria-pressed` que les deux groupes déjà corrects de cet écran (densité, mode Personnage/Monde), mais sans le `role="group"` + `aria-label` qui les accompagne ailleurs — une incohérence interne, pas une hypothèse.
3. **Chargement de l'onglet Tons resté en texte nu** (`TonesView.tsx`, `chargement…`) — même trou déjà corrigé sur les écrans 1 et 2.

## 1 — Tokens utilisés

Aucun token nouveau. Écran déjà entièrement sous la feuille active (Commune hors personnage résolu, sinon Léna/Abyssiaelle), déjà en modèle Poste de travail plein largeur (`--maxw` non utilisé, comme Produire et le Wizard).

| Zone | Tokens (déjà en place) |
|---|---|
| Bandeau du monde, cartes de scène/pose/ton, panneau réglages document | `--panel`, `--panel2`, `--line`, `--line2`, `--r` |
| Sélection active, onglets actifs du compositeur | `--acc`, `--on-acc` |
| Bandeau de dérive du monde | `--warn` (texte, jamais seul — phrase complète) |
| Confirmation de suppression, actions destructives | `--danger-bg`/`--danger-txt` (menu « retirer »), `.btn.danger` |
| Voile des badges sur vignette (pose imposée, bande de niveau) | `--scrim` |

## 2 — Les quatre états

### Chargement
- **Trou identifié** : `TonesView` affiche `chargement…` en texte nu tant que la taxonomie n'est pas là. Remplacé par un squelette de 3 cartes `--panel2` de la forme d'une `ToneCard` vide.
- Scènes et Poses n'ont pas ce trou : les deux dérivent de `drafts`/`poses`, déjà chargés avec le personnage au moment où l'écran devient atteignable — rien à corriger.

### Erreur
- Échecs de sauvegarde document (`onSave`), d'extraction de squelette, de suppression/duplication/renommage de pose : déjà remontés soit en `role="status"` transitoire (bandeau de sauvegarde), soit en toast, avec le message serveur verbatim — déjà actionnable, conservé à l'identique.
- Lieu introuvable dans le catalogue du monde (`PlaceInspector` non ouvert ici, mais son point d'entrée) : déjà un message textuel distinct de l'état « rien sélectionné » — conservé.

### Vide
- Banque sans scène, filtre sans résultat, aucun squelette, aucun ton déclaré : les quatre sont déjà des messages actionnables ou explicites (« Ajoute une première scène… », « le filtre ne cache rien du document… », etc.) — conservés à l'identique, rien à corriger.

### Rempli
- Disposition inchangée. Les trois corrections du §0 s'appliquent à l'intérieur de cet état.

## 3 — Inventaire commun vs pack

| Élément | Commun / Pack |
|---|---|
| Liste de scènes, compositeur (7 onglets), banque de poses, banque de tons, bandeau du monde | Commun — structure et comportement identiques quel que soit le pack |
| Contenu (scènes, squelettes, tons déclarés) | Donnée du personnage (`scenes.json`/`creative.json`), pas une variation de code par pack |
| Couleurs effectives | Pack, via la feuille active |

Aucun branchement conditionnel par pack trouvé dans les 16 fichiers lus.

## 4 — Clavier, focus, a11y

### 4.1 — Raison visible sur les actions désactivées d'une pose
`PoseCard.tsx` : les items de menu « dupliquer » et « renommer », désactivés quand la pose n'a pas de points-clés (squelette extrait avant l'ajout de cette fonctionnalité), n'exposent leur raison que via `title`. Remplacé par le contrat `data-hint-text` déjà utilisé partout ailleurs dans ce même fichier (le badge de provenance juste en dessous l'utilise déjà) — bulle au survol **et** au focus, fermable à Échap, au lieu d'un `title` invisible au clavier.

### 4.2 — Grouper les deux sélecteurs à choix unique du compositeur
`SceneComposer.tsx` :
- Grille du sélecteur de vêtement (`ClothingPanel`, boutons `aria-pressed` par pièce) → envelopper dans `role="group"` `aria-label="Pièces du catalogue de vêtements"`, même motif que le groupe densité de `PosesView` (`role="group" aria-label="Taille des vignettes"`).
- Grille du sélecteur de squelette (`PosePanel`, boutons `aria-pressed` « aucune » + poses) → `role="group"` `aria-label="Squelette de pose imposé"`.

Ni l'un ni l'autre ne change le comportement (`aria-pressed`, clic, mise à jour) — seule l'absence de nom de groupe est corrigée, pour que la navigation par lecteur d'écran annonce une limite et un intitulé au lieu d'une suite de boutons non reliés entre eux.

### Déjà correct, non modifié
- `role="group"` + `aria-pressed` du toggle densité (`PosesView`) et du toggle Personnage/Monde (`BankScreen`) : référence pour §4.2, pas à retoucher.
- Échap + retour de focus sur l'inspecteur de scène (`SceneInspector`) et sur le menu d'une pose (`PoseCard`), roving tabindex du menu et de la liste de scènes (`useSceneWorkbench`), navigation ← → pour (dé)plier un groupe : tous conformes, rien à changer.
- `InfoHint` : modèle exact du contrat `data-hint-text` que §4.1 étend à `PoseCard`.
- Statuts non-coloriels (bandeau de dérive du monde, badges de provenance, sauvegarde transitoire en `role="status"`) : déjà conformes.

## 5 — Emplacement

Refonte de `screens/bank/` existant. Fichiers touchés : `PoseCard.tsx` (§4.1), `composer/SceneComposer.tsx` (§4.2, `ClothingPanel`/`PosePanel`), `tones/TonesView.tsx` (§2, squelette de chargement). Aucun autre fichier du dossier modifié — `Composer.tsx` reste hors périmètre, non monté.

---

En attente de votre validation avant l'écran suivant.
