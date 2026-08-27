# Grille d'audit ComfyStudio

## A · Bugs de parcours
- Personnage affiché ≠ `character_id` réel après `?character=`
- Outil hors registre `tools.json`, ou `if` personnage/univers en dur
- Compteur / badge / vignette désync base ↔ disque
- Double-submit, spinner infini, erreur console-only
- Overlay sans Escape, focus perdu, tab order ≠ ordre visuel
- Action de production hover-only
- Mauvais argument `character_id` sur décliner / tri / export / NSFW arm

## B · Studio (pas un site)
- Un CTA primaire par vue
- États : idle, queued, running, done, error, empty, Comfy down
- Personnage + univers + sonde + job visibles sans ouvrir une autre vue
- L'UI mémorise le contexte (étape QC, bucket, sélection) — pas l'utilisateur
- Destructif confirmé (tri définitif, suppression, export)

## C · Fondements UI
- Contraste, répétition, alignement, proximité
- Hiérarchie par le type et l'espace, pas une card par bloc
- Densité : galerie dense ; réglages groupés et aérés
- Affordance des actions répétées (valider / rejeter / relancer)
- Interdit slop : gradient décoratif, hero, 3 cards clones, emoji-icônes,
  animation de fond pendant l'attente GPU

## D · Effort (session longue)
- Cibles généreuses sur le tri et la banque
- Clavier : Tab, Shift+Tab, Enter, Space, Escape
- Pas de drag obligatoire sans clic
- Job long n'efface pas le travail en cours
- Même verbe = même action dans tout le studio
- Timeouts / échecs GPU récupérables sans tout recommencer

## E · A11y pratique (WCAG 2.2 AA)
- HTML natif avant ARIA (`button`/`a`/`label`/`dialog`, pas des div cliquables)
- Focus visible, contrastes texte 4.5:1 / UI 3:1
- Label visible (placeholder ≠ label)
- Statut ≠ couleur seule
- `prefers-reduced-motion`

## F · Invariants à citer si violés
- §8.7 panel = `tools.json`
- §8.9 / ADR-0003 NSFW = recomposition d'outils
- §5 scène ≠ identité
- ADR-0004 Univers / Personnage / Registre de création ne se fusionnent
  pas dans un seul sélecteur fourre-tout
- ADR-0005 l'UI ne suppose pas `CHARACTERS/*` versionné