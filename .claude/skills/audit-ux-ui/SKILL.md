---
name: audit-ux-ui
description: A utiliser pour auditer ou corriger l'UX/UI du studio (Dashboard, banque, production, tri, reglages, nouvel ecran d'outil) - bugs de parcours, design system commun, fondements UI, accessibilite, effort de session longue. Se declenche SYSTEMATIQUEMENT en fin de construction d'un ecran neuf (skill nouvel-outil, patron 2), pas seulement sur demande. Pas pour le graphe ComfyUI ni le backend pur.
---

# Audit UX/UI du studio

## Quand charger ce skill

- Revue d'un écran ou d'un composant `AUTOMATION/web/ui/src/`
- **Systématique** en fin de construction d'un écran/module neuf (skill
  `nouvel-outil`, patron 2) — fait partie du « fini », comme les tests,
  pas une passe optionnelle qu'on déclenche à part
- L'utilisateur parle de navigation, clavier, clarté, fatigue, look

Ne pas charger pour un changement Python sans surface UI.

## Lire avant de juger

1. `.claude/rules/frontend.md` (stack, découpage d'écran, erreurs, panel)
2. `CLAUDE.md`, invariants #7 (panel d'outils) et #9 (NSFW) — le détail vit
   dans `DOCS/architecture.md` §5/§6, à n'ouvrir que si le parcours touche
   un univers/pack, l'identité ou le NSFW (la règle est déjà dans
   `CLAUDE.md` lui-même)
3. ADR-0003 (NSFW), ADR-0004 (trois axes) si le parcours les touche
4. La grille `references/grille-audit.md`
5. `references/conventions-ux-ui.md` — checklist d'interaction, couleur/thème
   et a11y extraite des handoffs (Éditeur d'expression, Phase 0b thème). Ce
   sont des conventions à **proposer et faire valider avec l'utilisateur**,
   pas des invariants à appliquer d'office : citer l'écart en finding comme
   les autres, jamais patcher un écran pour s'y conformer sans que
   l'utilisateur l'ait validé pour cet écran précis.

Si le scope d'écran n'est pas dit : une question, puis stop.

## Rôle

Studio local sur ComfyUI. React + TypeScript + Vite, étape de build
assumée (`.claude/rules/frontend.md` — ce n'est plus « zéro framework, zéro
build » depuis le 30/08/2026). Utilisateur solo, session longue, GPU
occupé, beaucoup de jugements.

Findings avant tout patch. Cause avant symptôme. Diff minimal.
Interdit : nouvelle lib, globale `window`, `if character == "lena"`,
refonte visuelle hors finding, dashboard NSFW parallèle, confondre scène
et identité.

## Vérifier EN VRAI, pas seulement à la lecture

Un audit qui ne fait que relire le JSX manque ce qui ne se voit qu'à
l'exécution — vécu deux fois de suite (2026-09-02, 2026-09-03) : le cache
d'exécution de ComfyUI, l'aperçu périmé après un changement de photo, et le
Lightbox partagé sans AUCUN style depuis la migration React étaient tous
invisibles en lisant le code, et tous trouvés en cliquant pour de vrai.
Avant de conclure un finding (surtout Bloquant/Majeur) ou de clore un
audit sans rien trouver :

- **Démarrer un dashboard réel** : `python AUTOMATION/tools/toolchain.py
  build` d'abord (le serveur sert le bundle construit, pas les sources —
  un écran neuf reste invisible si seul `typecheck` a tourné), puis
  `python AUTOMATION/web/app.py --no-comfy --no-browser --port <libre>`
  (ou via `run_browser_tests.py` pour une fumigation existante).
- **Capturer et regarder** : un script Playwright minimal (`page.goto`,
  `page.screenshot({path: ...})`), puis lire le PNG avec l'outil de lecture
  de fichiers — une capture révèle un chevauchement, un contraste, une
  mise en page cassée qu'aucune lecture de JSX ne révèle.
- **Mesurer le DOM plutôt que deviner** : `getComputedStyle(...)`,
  `getBoundingClientRect()`, `element.disabled` — pour un contraste
  suspect, une hauteur qui devrait être bornée, un état `disabled` qui
  devrait s'afficher.
- **Rejouer l'interaction réelle**, pas juste l'ouvrir : cliquer deux fois
  de suite un bouton qui déclenche un appel réseau, changer de sélection
  après une action, naviguer puis revenir — c'est ce genre de séquence qui
  a révélé le cache ComfyUI et l'aperçu périmé, jamais visibles sur un
  seul passage.
- **Utiliser l'interpréteur ComfyUI réel** (`python_embeded`, pas le venv
  de dev qui n'a pas `cv2`) dès que le parcours touche l'identité ou un
  rendu — sinon toute mesure d'identité échoue pour une raison qui n'a
  rien à voir avec l'UI, et masque ce qu'on cherche à vérifier.

Un finding qui cite une mesure réelle (« opacité 1 sur les deux, mesuré »,
« 4/4 essais échouent, 4/4 réussissent en variant un paramètre ») pèse plus
qu'une intuition de lecture — et se corrige avec plus de confiance.

## Deux couches (ne pas les aplatir)

- **Commun** (ce skill + `frontend.md`) : layout, cartes, panneaux,
  listes d'assets, barres d'action, états de job, clavier, erreurs.
- **Univers** : palette, typo, ambiance — skill d'univers / peau,
  pas une copie du composant commun.

## Sortie

Findings d'abord, un par problème réel :

- Sévérité : Bloquant / Majeur / Mineur / Nit
- Fichier:ligne
- Parcours cassé — la mesure ou la séquence réelle qui le prouve, pas
  seulement une lecture du code
- Critère : `frontend.md` / invariant CLAUDE.md / ADR / WCAG / effort /
  `conventions-ux-ui.md` (préciser que c'est une convention à faire
  valider, pas un invariant, si l'utilisateur n'a pas déjà tranché pour cet
  écran)
- Coût utilisateur en une phrase
- Fix minimal
- Vérif (clavier, overlay, message d'erreur, `?character=`) — refaite EN
  VRAI après le correctif, pas supposée corrigée

Puis Top 5 impact × effort. Si rien de sérieux :
« Aucun finding bloquant/majeur sur le scope fourni. »

Patch seulement si demandé. Code frontend en anglais.
