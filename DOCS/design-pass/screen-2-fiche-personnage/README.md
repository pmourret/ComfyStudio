
# Écran 2 — Fiche personnage (`/character`)

Dossier visé (refonte) : `AUTOMATION/web/ui/src/screens/CharacterSheetScreen.tsx` (écran plat, pas de sous-dossier — pas de découpage Screen/useXxx/Xxx à créer ici : la logique tient dans `CharacterContext`, déjà séparée en amont ; le fichier unique est la présentation pure de cette lecture).

Source lue : `CharacterSheetScreen.tsx`, `CharacterContext.tsx`, `styles/{screens.css,base.css,chrome.css,tokens.css,DESIGN.md}` réels (classes `.fiche`/`.meta`/`.empty`/`.tiny` déjà posées et déjà sur tokens).

## 0 — Ce qui change, et pourquoi

**Aucun changement de structure.** Le commentaire d'en-tête du fichier (« ONE CALL, AND IT IS ALREADY MADE », « WHAT IT DOES NOT DO ») fixe un périmètre déjà juste : lecture seule, une seule porte de changement de personnage (le menu d'identité), une seule porte pour armer le contenu adulte (Application). La refonte porte sur trois trous d'état et sur le fait que **c'est le premier écran où l'habillage de pack est réellement visible** — pas sur la disposition.

**Premier écran à porter la peau du pack.** Contrairement au Wizard (100 % commun, personnage pas encore résolu), ici `sheet.universe` est connu : `--acc`/`--bg`/`--panel`/… sont ceux du pack (`instagram-influenceur` ou `rpg-personnage`) chargés par le shell une fois `pack.id` connu. La fiche elle-même ne code aucune bascule — elle hérite, comme tout le reste, de la feuille de tokens déjà active. C'est le bon endroit pour le noter explicitement dans ce dossier de specs, car c'est la première fois que ça se voit à l'écran.

## 1 — Tokens utilisés (déjà en place, aucun ajout)

| Zone | Tokens |
|---|---|
| Badge initiale | `--panel2` (fond), `--line2` (bordure), `--acc` (lettre) — **seule valeur de l'écran qui change visuellement avec le pack** |
| Nom / identifiant | `--txt` (nom), `--dim2` (`<code>` de l'id, via `.font-code`) |
| Cartes `.meta` (×2) | `--panel` (fond), `--line` (bordure), `--r` (rayon) |
| Libellés `dt` / valeurs `dd` | `--dim` (libellé, majuscules), `--txt` (valeur, taille 14px) |
| Notes `.tiny` | `--dim2` |
| Lien « Tous les personnages » | `.link` commun → `--acc`, survol `--acc-d` |
| État vide/erreur `.empty` | `--dim` (corps), `--txt` (`<b>` du titre) |
| Focus clavier | `--focus` (hérité, rien de spécifique à ajouter) |

Zéro token nouveau, zéro valeur en dur : cet écran valide que le contrat Phase 0 tient sans changement de code au-delà des feuilles déjà livrées.

## 2 — Les quatre états

### Chargement
- **Trou actuel** : `chargement de la fiche…` est un texte nu (`.tiny`), sans forme — l'écran passe du vide au plein sans étape intermédiaire lisible.
- Remplacé par un **squelette de `.fiche`** : badge rond `--panel2` vide, deux barres `--line` (nom/id), deux blocs `.meta` vides (mêmes dimensions que remplis). `prefers-reduced-motion` : blocs statiques ; sinon fondu discret seul.
- Ce squelette n'a **pas encore de pack résolu** (le nom du personnage n'est pas encore connu) : reste sur la feuille active au moment de l'arrivée (celle du personnage précédent, ou Commune si c'est la première navigation) — pas de flash neutre imposé.

### Erreur
- **Trou corrigé** : `sheetError` affiche aujourd'hui *« Le serveur n'a pas rendu la fiche de `id` : {erreur} »* sans aucune action — silencieux au sens de la règle du cadrage. Ajout d'un bouton **Réessayer** (`.btn.sm`) qui appelle `refreshSheet()` (déjà exposé par `CharacterContext`, juste jamais câblé ici).
- Le message garde l'id exact et le texte d'erreur serveur tels quels (déjà factuels, rien à reformuler).

### Vide
- `claimed === null` (« Aucun personnage ouvert ») : déjà actionnable — lien vers le registre. **Conservé à l'identique**, c'est le seul état vide réel de cet écran (pas de fiche sans personnage).

### Rempli
- Disposition actuelle inchangée : identité + lien, deux cartes `.meta` (choix figés / pack+base+contenus), bloc Contenu adulte. Les trois états de `AdultContent` (désactivé / activé sans outil / activé avec outil) restent tels quels — déjà non-silencieux, déjà à double phrase (état + effet sur Produire).

## 3 — Inventaire commun vs pack

| Élément | Commun / Pack |
|---|---|
| Structure `.fiche`, cartes `.meta`, lien, bloc Contenu adulte | Commun — mêmes classes, même comportement dans les deux habillages |
| Couleurs effectives (`--acc` du badge, `--bg`/`--panel` du fond) | Pack — déterminées par `sheet.universe`, sans branche de code dans cet écran |
| Libellés (« Type de personnage », « Pack », etc.) | Communs — aucun texte propre à Léna ou Abyssiaelle |

Aucun `if character/pack ==` sur cet écran, conforme à la contrainte transverse — la variation est entièrement portée par la feuille de tokens active, jamais par une condition ici.

## 4 — Clavier, focus, a11y

Écran très majoritairement en lecture : pas d'action à haute fréquence à spécifier (pas de tri, pas de validation répétée). Deux points concrets :
- Le bouton **Tous les personnages** est déjà un `<button>` natif, déjà focusable, déjà activable au clavier — rien à changer. Le focus qu'il ouvre (menu d'identité) est spécifié par le chrome, pas par cet écran.
- Le badge d'initiale est déjà `aria-hidden="true"` (décoratif, l'information est répétée en texte à côté) — correct, conservé.
- Nouveau bouton **Réessayer** (état erreur) : `<button>` natif, focus visible par `--focus` hérité, pas d'icône seule → pas d'`aria-label` requis (texte visible « Réessayer » suffit).
- Aucune overlay sur cet écran : la règle Échap ne s'applique pas ici (elle s'applique au menu d'identité qu'il ouvre, hors périmètre de cette fiche).
- Statut jamais par la couleur seule : déjà le cas (`state`/`effect` de `AdultContent` sont du texte, pas des puces colorées) — rien à changer.

## 5 — Emplacement

Refonte de `screens/CharacterSheetScreen.tsx` existant. Changement unique : câblage du bouton Réessayer sur `refreshSheet()` + remplacement du texte de chargement par le squelette décrit en §2. Aucun autre fichier touché.

---

En attente de votre validation avant l'écran suivant.
