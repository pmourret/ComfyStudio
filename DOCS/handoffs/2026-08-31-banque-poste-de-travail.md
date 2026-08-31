# Handoff — La Banque devient un poste de travail

**Date** : 31/08/2026 · **Base** : `f0f5de9` (verrou de monde, étape 1)
**Portée** : `/bank/scenes` + le store des scènes. Workflows non touchés.
**Statut** : clos. Fumigations banque / produire / revue vertes, `tsc -b` vert.

Skill `audit-ux-ui` chargé d'abord : sept findings, patch sur les cinq du top.

## Ce qui n'allait pas

Vingt formulaires empilés de douze champs — cinq mille pixels avant de savoir
ce que le personnage possède. Impossible de comparer deux scènes, de retrouver
« celle du café », ou de compter celles qui portent une pose. Et **Produire
lisait déjà les mêmes scènes en grille** : la Banque était le seul écran où
une scène n'avait pas de vignette.

## Ce que ça devient

**Grille | inspecteur**, dans la géométrie de poste de travail que Produire
utilise déjà (`grid-cols-[minmax(0,1fr)_clamp(320px,26vw,460px)]`, colonne
droite collante, passage sous 1100 px).

- **La carte** porte ce qui identifie une scène : vignette, identifiant,
  format, compte, produite ou non, pose imposée, plafond de niveau. Même
  vocabulaire que la carte de Produire — mêmes scènes, deux métiers.
- **L'inspecteur** reçoit le détail. Les douze `data-f` n'ont pas changé de
  nom, seulement de maison.
- **Sans sélection**, l'inspecteur tient les réglages du document : ancre
  d'identité et note de direction, qui occupaient 250 px en haut d'écran pour
  être modifiées une fois par mois.
- **Un filtre** (nom, prompt, tag) rétrécit la grille, jamais le document.

**Bandeau monde en lecture seule** : le monde de la fiche, plus une phrase
d'alerte si le fichier en porte un autre — ou aucun. Aucun contrôle dedans :
le monde est figé à la création.

**Rangés, pas refondus** : le composeur et le JSON brut passent en `<details>`
sous la grille. Le composeur perd son `btn primary` — une vue, un CTA primaire,
et c'est Enregistrer. Les poses restent leur propre route.

## Bug trouvé en chemin, et corrigé

« Ajouter et enregistrer » du composeur perdait la scène en silence.
`addScene()` puis `await save()` dans le même tick : `save` était un
`useCallback` fermé sur le document du rendu précédent, il postait la banque
**sans** la scène, puis `load()` écrasait le draft. Le toast disait
« enregistrée dans scenes.json ». Le store tient maintenant ses drafts dans une
ref et `save` lit l'état vivant.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `bank/BankScreen.tsx` | composition : bandeau, deux colonnes, panneaux rangés, barre |
| `bank/useSceneWorkbench.tsx` | sélection par `uid`, filtre, Échap, ajout, retrait confirmé |
| `bank/SceneGrid.tsx` | grille : carte essentielle + carte « ajouter » |
| `bank/SceneInspector.tsx` | le détail (ex-`SceneCard.tsx`) + le volet document |
| `bank/WorldBanner.tsx` | le monde, en lecture seule |
| `bank/Composer.tsx` | inchangé, sauf le bouton qui n'est plus primaire |
| `state/ScenesStoreContext.tsx` | `uid`, `stampWorld`, `world`/`documentWorld`, refs vivantes |
| `tests/test_bank.js` | fumigation étendue |

`SceneCard.tsx` est supprimé — son contenu est l'inspecteur.

## Ce que la fumigation couvre en plus

Le monde est dit et non éditable · la carte ne porte aucun champ · **ouvrir**
une carte remplit l'inspecteur (les douze champs) · Échap referme et rend le
focus à sa carte · le filtre · **ajouter** une scène → elle ouvre, reste un
draft tant qu'on n'enregistre pas, puis atteint le disque **tamponnée du monde
du personnage** avec `origin: manual` · le monde traverse l'aller-retour · et
la scène créée par le test disparaît à la remise en état.

18 sections, toutes vertes. `test_produce` et `test_review` re-passés : ils
consomment le même store.

## Ce qui reste ouvert

- **Deux findings non patchés**, mineurs et hors de la ligne « grille |
  inspecteur » : le `role="tablist"` du sélecteur de sous-vue n'a pas de
  `tabpanel` en face, et la grille n'a pas de navigation aux flèches (Tab
  natif suffit sur des `<button>`, mais vingt tabulations restent vingt
  tabulations).
- `/api/compose` marque toujours ses propositions `origin: manual` au lieu de
  `compose` — un une-ligne côté serveur, laissé de l'étape 1.
- Le `ui_skin_token` du monde reste déclaratif : le bandeau dit le monde, il
  n'en porte pas la peau.
