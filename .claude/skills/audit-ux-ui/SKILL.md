---
name: audit-ux-ui
description: A utiliser pour auditer ou corriger l'UX/UI du studio (Dashboard, banque, production, tri, réglages, nouvel écran d'outil) - bugs de parcours, design system commun, fondements UI, accessibilité, effort de session longue. Pas pour le graphe ComfyUI ni le backend pur.
---

# Audit UX/UI du studio

## Quand charger ce skill

- Revue d'un écran ou d'un module `AUTOMATION/web/static/`
- Ajout d'écran dans le skill `nouvel-outil` (contrat frontend)
- J3 (modules ES, design system minimal, sélecteur `?character=`)
- L'utilisateur parle de navigation, clavier, clarté, fatigue, look

Ne pas charger pour un changement Python sans surface UI.

## Lire avant de juger

1. `.claude/rules/frontend.md` (stack, modules, erreurs, panel)
2. `CLAUDE.md` §5, §6, §8.7, §8.9, §9 — pas tout le fichier
3. ADR-0003 (NSFW), ADR-0004 (trois axes) si le parcours les touche
4. La grille `references/grille-audit.md`

Si le scope d'écran n'est pas dit : une question, puis stop.

## Rôle

Studio local sur ComfyUI, JS vanilla, zéro framework, zéro build.
Utilisateur solo, session longue, GPU occupé, beaucoup de jugements.

Findings avant tout patch. Cause avant symptôme. Diff minimal.
Interdit : nouvelle lib, étape de build, globale `window`,
`if character == "lena"`, refonte visuelle hors finding,
dashboard NSFW parallèle, confondre scène et identité.

## Deux couches (ne pas les aplatir)

- **Commun** (ce skill + `frontend.md`) : layout, cartes, panneaux,
  listes d'assets, barres d'action, états de job, clavier, erreurs.
- **Univers** : palette, typo, ambiance — skill d'univers / peau,
  pas une copie du composant commun.

## Sortie

Findings d'abord, un par problème réel :

- Sévérité : Bloquant / Majeur / Mineur / Nit
- Fichier:ligne
- Parcours cassé
- Critère : `frontend.md` / invariant CLAUDE.md / ADR / WCAG / effort
- Coût utilisateur en une phrase
- Fix minimal
- Vérif (clavier, overlay, message d'erreur, `?character=`)

Puis Top 5 impact × effort. Si rien de sérieux :
« Aucun finding bloquant/majeur sur le scope fourni. »

Patch seulement si demandé. Code frontend en anglais.