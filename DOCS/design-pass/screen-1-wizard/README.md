
# Écran 1 — Wizard « nouveau personnage »

Dossier visé (refonte) : `AUTOMATION/web/ui/src/screens/wizard/` (`WizardScreen.tsx`, `StepBody.tsx`, `OptionCard.tsx`, `shared.ts`).

Source lue : les 4 fichiers ci-dessus + `chrome/{Shell,Header,ProbeStrip,FaultBar}.tsx` (pour la partie chrome héritée) + `DESIGN.md` (modèles de largeur, inventaire).

## 0 — Ce qui change de fond, et pourquoi

**Modèle de largeur : Article centré → Poste de travail.** Le wizard passe du `.wrap` centré actuel au modèle déjà posé par Créer — `.wrap.split` → `.cr-main` (stepper + contenu d'étape, inchangés) / `.cr-side` (nouveau : panneau **« Fiche en construction »**, sticky, colonne `clamp(280px,22vw,420px)` comme Créer). Aucune classe inventée : réutilisation du couple `.cr-main`/`.cr-side` déjà partagé par Créer — c'est ce que `DESIGN.md` appelle « ce que plusieurs écrans partagent », pas une peau propre à cet écran.

**Pourquoi** : les quatre choix (type/style/monde/base) sont aujourd'hui résumés en une ligne de texte dans la barre de lancement (`wizSumN`/`wizSumT`), relue seulement au moment de cliquer Suivant. Un outil de niveau Photoshop/Unreal montre en permanence ce qu'on est en train de composer — la fiche se construit sous les yeux, pas révélée à la fin. La barre de lancement perd ce texte (redondant avec le panneau) et ne garde que Retour/Suivant/Créer.

**Aucun token nouveau** : l'écran reste entièrement sous la feuille **Commune** verrouillée en Phase 0 — voir §3.

## 1 — Tokens utilisés (feuille Commune uniquement)

| Zone | Tokens |
|---|---|
| Fond d'écran / `<main>` | `--bg` |
| Champs Nom / Identifiant (`label.f`, `input`) | `--panel2` (fond input, composant commun), `--line2` (bordure), `--txt`, `--dim` (libellé), `--dim2` (`.tiny` du hint identifiant) |
| Stepper (`.step`) | `todo`: `--line` / `--dim2` · `on`: `--acc` / `--txt` · `done`: `--line` / `--dim` ; puce : `todo` `--line2`/`--txt` · `on` `--acc`/`--on-acc` · `done` `--ok`/`--on-acc` |
| Cartes d'option (`.it`) | `--panel2` (fond), `--line` (bordure repos), `--acc` (bordure sélectionnée), `--txt`/`--dim` (titre/sous-titre) |
| Grille de candidats (base d'identité) | `--panel2`, `--line` (repos), `--line2` (survol), `--acc` (choisi), `--danger-txt` (échec), spinner `--acc`/`--line2` |
| Panneau « Fiche en construction » (`.cr-side`) | `--panel`, `--line` (bordure), `--txt` (valeurs renseignées), `--dim2` (placeholders « — ») |
| Note d'aide / erreur (`NOTE_OK`/`NOTE_ERR`) | `--panel`, `--line`/`--txt` ou `--danger-line`/`--danger-txt` |
| Barre de lancement (`.launch`) | `--elev` (flottante), `--panel`, `--line` |
| Focus clavier | `--focus` |
| `--r` | rayon des cartes, du panneau latéral, des miniatures |
| `--maxw` | **non utilisé** sur cet écran depuis le passage au modèle Poste de travail (comme Créer) |

Aucune valeur en dur : tout ce tableau pointe des noms déjà verrouillés en Phase 0 (`specs/phase-0-tokens/tokens.commune.json`).

## 2 — Les quatre états

### Chargement
- Nom/Identifiant et le stepper s'affichent immédiatement (ils ne dépendent pas de `/api/wizard/options`).
- La zone de contenu d'étape affiche un **squelette structurel** : 3 blocs de la forme exacte d'une carte `.it` (mêmes dimensions, `--panel2`/`--line`, sans texte), pas un simple « chargement des choix… ». `prefers-reduced-motion` : blocs statiques, aucun effet de balayage/pulsation ajouté s'il est actif ; sinon un fondu discret est acceptable.
- Le panneau « Fiche en construction » s'affiche déjà, tous les champs à l'état placeholder (« — »).

### Erreur
- **Régression corrigée** : l'état actuel (`loadFailed`) affiche un texte sans aucune action — contraire à la règle « message actionnable, jamais un échec silencieux ». Ajout d'un bouton **Réessayer** (`.btn.sm`, même intitulé que celui de `FaultBar`) qui relance `/api/wizard/options`.
- Erreur de génération de portrait (timeout de polling, échec serveur) : déjà actionnable de fait (le bouton « Générer 4 portraits » reste disponible) — conservé tel quel, message inchangé.
- Échec d'un candidat individuel : la carte affiche déjà le mot « échec » (texte, pas seulement une couleur) — conservé.

### Vide
- **Trou non couvert aujourd'hui** : si `/api/wizard/options` répond `types: []` (aucun pack déclaré), l'étape Type affiche silencieusement une grille vide et un bouton Suivant éternellement désactivé, sans explication. Remplacé par un message actionnable : « Aucun type de personnage n'est déclaré. Vérifie `PACKS/resolution.json` et les `universe.json` des packs. » (`NOTE_ERR`, ton neutre — c'est une donnée manquante côté studio, pas une faute de l'utilisateur).
- Étape Style avec un seul style déclaré, étape Monde sans monde déclaré : déjà traités (message `NOTE_OK`) — conservés à l'identique.

### Rempli
- Stepper + carte d'étape courante (inchangés dans leur contenu, changent de sémantique clavier — §4) + panneau « Fiche en construction » à droite, mis à jour à chaque choix : Nom, Identifiant, Type, Style, Monde, Base (miniature 60×60 une fois gelée, sinon rectangle pointillé `--line`).
- Barre de lancement : Retour / Suivant (ou « Créer *nom* ») uniquement.

## 3 — Inventaire commun vs pack

**100 % commun. Aucun élément propre à un pack sur cet écran.**

Justification : le personnage n'existe pas avant le clic sur Créer (`POST /api/characters`) — tant qu'aucune fiche n'est écrite, aucun habillage de pack ne s'applique. Le premier écran à porter la peau du pack résolu est la Fiche personnage, qui suit immédiatement (`selectCharacter` navigue dessus). Construire un mécanisme de bascule de tokens à l'intérieur du wizard (par ex. pour prévisualiser l'ambiance du pack avant de créer) serait une fonctionnalité neuve, non demandée, et risquerait de faire percevoir un choix comme déjà engageant avant le clic final — **écarté explicitement**, pas oublié.

## 4 — Clavier, focus, annotations a11y

**Ordre de focus (Tab)** : Nom → Identifiant → groupe d'options de l'étape (un seul arrêt Tab) → *(étape Base)* Choisir un fichier → Générer 4 portraits → grille de candidats (un seul arrêt Tab) → Retour → Suivant/Créer. Le panneau « Fiche en construction » est une zone de lecture, jamais un arrêt Tab. Le stepper est déjà non focusable (décoratif) — conservé, ajout de `aria-label="Étapes de création"` sur le `<ol>`.

**Correction de sémantique** — les groupes de cartes d'option (Type/Style/Monde) et la grille de candidats sont des **choix mutuellement exclusifs**, pas des boutons à bascule indépendants : `aria-pressed` sur chaque `OptionCard` est remplacé par un vrai motif **radiogroup** :
- Conteneur : `role="radiogroup"` + `aria-label` (« Type de personnage » / « Style de sortie » / « Monde » / « Portraits générés »).
- Chaque option : `role="radio"` `aria-checked={actif}`, **tabindex baladeur** (roving tabindex) — seule l'option sélectionnée (ou la première si aucune) porte `tabIndex=0`, les autres `-1`.
- Flèches ← → (et ↑ ↓ pour la grille de candidats) déplacent le focus **et sélectionnent immédiatement** (même comportement qu'un groupe de boutons radio natif — l'utilisateur clavier voit la Fiche en construction se mettre à jour en naviguant). `Home`/`End` → première/dernière option. `Entrée`/`Espace` confirment (déjà le cas, ce sont des `<button>`).
- Les cartes non sélectionnables (candidat en échec ou en attente) restent des `<div>` hors du groupe de tabindex baladeur — inchangé, déjà correct.

**Statut jamais par la couleur seule** — la carte d'option et la miniature de candidat sélectionnées portent aujourd'hui **seulement** une bordure `--acc` : ajout d'un glyphe de coche (`Icon name="check"`, `aria-hidden="true"`, coin supérieur droit, 14px) en plus de la bordure et de `aria-checked`/`aria-pressed`. Le candidat en échec garde son texte « échec » (déjà non-coloriel).

**Échap** : cet écran n'est pas une overlay (pas de `<dialog>`, pas de voile) — la règle « Échap ferme une overlay » ne s'applique pas ici, à dessein.

**État visible permanent** (personnage/univers actifs, sonde ComfyUI, job/erreur) : hérité du chrome (`Header`/`FaultBar`, montés par `Shell` pour toutes les routes) — rien à ajouter sur cet écran. En mode sas (`body.no-character`, actif ici puisqu'aucun personnage n'est encore chargé), le bandeau d'identité reste réduit au nom de l'application, conforme à `DESIGN.md`.

**`aria-label`** : aucun bouton icône-seule sur cet écran après cette révision (le glyphe de coche est décoratif, `aria-hidden`) — rien à annoter au-delà des `aria-label` de radiogroup ci-dessus.

## 5 — Emplacement

Refonte de `screens/wizard/` existant, pas un écran neuf. Fichiers concernés : `WizardScreen.tsx` (modèle de largeur, panneau latéral, état vide/erreur+retry), `StepBody.tsx` (squelette de chargement, message vide), `OptionCard.tsx` (motif radio, coche non-colorielle), `shared.ts` (classes du panneau latéral, du squelette, de la coche).

---

En attente de votre validation avant de passer à l'écran suivant.
