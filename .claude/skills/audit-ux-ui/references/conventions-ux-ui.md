# Conventions UX/UI — Soulglade

Checklist de référence à **proposer et faire valider à chaque audit/refonte d'écran** — pas des règles à appliquer automatiquement sans validation utilisateur. Extraites des handoffs déjà rédigés (Éditeur d'expression, Phase 0b thème).

## 1. Règles d'interaction

- **One-page / zéro scroll** sur les outils de composition ("ateliers" : Éditeur d'expression, Éditeur de pose, Éditeur de scène). Chaque colonne borne sa hauteur (`h-[calc(100vh-24px)]`) et défile en interne si besoin — jamais la page entière. Une ligne compacte par paramètre (case + curseur + champs bornes sur une seule ligne, bornes en `title`), jamais 2-3 lignes empilées par paramètre. Les écrans terminaux (pas un hub de composition) peuvent déroger — à trancher par écran.
- **Comparaison avant/après** : bascule (toggle) par défaut sur les outils de retouche fine, pas de côte-à-côte — garde l'espace pour les paramètres. Réévaluer côte-à-côte seulement si la comparaison pixel-à-pixel est le cœur du geste.
- **Geste d'historique unique** : toute action qui modifie plusieurs paramètres à la fois (ex. "copier la plage d'un autre ton") passe par une action groupée dans l'historique (type `applyParamsAction`), jamais un enchaînement de `updateParams` qui se fondrait avec la frappe suivante (fenêtre de coalescence ~400ms). Un seul Ctrl+Z doit tout annuler.
- **Limites numériques** (ex. max 3 photos sélectionnées) : jamais un clic mort silencieux — toast explicite qui nomme la limite et l'action pour la lever.
- **Indicateur de rendu périmé** : si un résultat affiché peut devenir obsolète par une action ultérieure (curseur bougé après le rendu), comparer timestamp dernier rendu vs dernière modif et afficher un message explicite sur le résultat concerné (jamais un état global).
- **Échec isolé par élément** dans une collection traitée en parallèle (ex. test multi-photos) : l'échec d'un élément n'affecte pas l'affichage des autres réussis ; chaque carte porte son propre message + retry scoped à elle seule.
- **Indicateur "modifications non enregistrées"** (`dirty`) : à conserver systématiquement, même après compaction de layout.
- **Compteur d'inclusion par groupe** (ex. "3/5 inclus") quand des paramètres groupés sont individuellement activables.

## 2. Système de couleur / thème

- OKLCH partout. Fond ET accent détachés du pack de personnage — le pack ne fixe plus que la forme (`--r`, rayon des cartes), aucune couleur.
- Défaut identique pour tous (gris neutre + accent bleu-gris, teinte ≈220°), personnalisable **par personnage** sur deux axes indépendants : fond (teinte + intensité/chroma 0→0.05) et accent (teinte seule).
- `L` (luminosité OKLCH) fixe par rôle, jamais modifié par l'utilisateur — c'est lui qui porte le contraste :

  | Rôle | L |
  |---|---|
  | `--bg` | 0.15 |
  | `--panel` | 0.20 |
  | `--panel2` | 0.25 |
  | `--line` | 0.32 |
  | `--line2` | 0.44 |
  | `--dim2` | 0.62 |
  | `--dim` | 0.67 |
  | `--txt` | 0.90 |

- Dérivation : `oklch(L_rôle, intensité × facteur_rôle, teinte_fond)` — `facteur_rôle` = 1 pour `bg/panel/panel2/line/line2`, 0.35 pour `dim2/dim/txt` (le texte reste proche du neutre même à forte intensité de fond).
- Accent : `L=0.76 C=0.06` fixes, teinte seule variable. `--acc-d` = même C/H à `L=0.54`. `--on-acc` = le plus contrasté de `#050505`/`#f5f5f5`, revérifié ≥4.5:1. `--focus` = `oklch(0.90, 0.06, H+40°)`, revérifié ≥3:1 contre `--bg`/`--panel2` du fond personnalisé, `L` +0.02 par pas (max 0.97) si besoin.
- Garde-fou verdicts : avertir (texte) si la teinte d'accent choisie tombe à moins de 12° d'une teinte de verdict (`ok`≈145°, `warn`≈75°, `bad`≈22°, `high`≈165°). Pas d'avertissement sur la teinte de fond (le plafond d'intensité empêche la confusion).
- Toutes les valeurs recalculées à la volée, jamais figées au commit.
- Application : propriété inline sur `:root` posée par un hook, jamais un `data-attribute` dépendant du pack.

**Statut** : livré (commit `932728b`, 2026-09-03) — `chrome/theme/deriveTheme.ts`, `chrome/useCharacterTheme.ts`, panneau Apparence, tests d'isolation. `DOCS/design-pass/phase-0b-theme-utilisateur.md` garde son en-tête "proposition à valider" mais n'a pas été mis à jour après implémentation ; se fier à `git log`/au code, pas à ce doc, pour le statut.

## 3. Conventions a11y

- Toute info affichée seulement au hover (`title="…"`) sur un élément déjà focusable doit passer en `data-hint-text` (contrat `chrome/HintLayer.tsx`) — pas de `tabIndex` ajouté, il est déjà focusable.
- Case à cocher : le texte cliquable est le vrai label (`<label>`), jamais un `<span>` séparé à côté — garder le grand target de clic sur le nom.
- Focus visible : `--focus` recalculé pour rester ≥3:1 contre `--bg`/`--panel2` du fond personnalisé (voir §2).

## Exemples déjà tranchés

- Renommage "Banque" → "Ateliers", livré le 2026-09-04 : uniquement le libellé de nav et tout texte visible de l'écran (aria-label, data-hint-text, titres, messages de confirmation/erreur) — jamais les clés internes (`key: 'bank'`, routes `/bank/*`, ids `#bankView`/`#bankDocument`, noms de fichiers/composants `BankScreen.tsx`), jamais les commentaires de code, jamais les fichiers générés (`schema.d.ts`, `openapi.json`). Accord au singulier/pluriel à trancher au cas par cas : "Ateliers" (majuscule) quand le texte cite l'écran/la destination (nav, "retour aux ateliers", "écran Ateliers"), "atelier" (minuscule, singulier) quand le texte désigne CE document précis d'un personnage ("réglages de l'atelier", "cet atelier ne porte pas encore son monde").
- Éditeur d'expression : one-page (zéro scroll), bascule avant/après (pas de côte-à-côte), test multi-photos jusqu'à 3 avec échec isolé par carte.
