# Phase 0b — Thème détaché du pack, personnalisable par personnage

Amendement à `DOCS/design-pass/phase-0-tokens/` avant verrouillage. Statut : **proposition à valider**, à fusionner dans ce dossier avant d'ouvrir/relancer les écrans 1-3. Remplace la première version de cet amendement (qui ne portait que sur l'accent) — la demande porte sur le **thème entier**, fond compris.

## Ce qui change

Le pack fixait jusqu'ici toute la palette de couleur (neutres + accent) : `tokens.instagram-influenceur.json`, `tokens.rpg-personnage.json` donnaient chacun leur `--bg/--panel/…/--acc`. **La couleur est désormais entièrement détachée du pack.** Le pack ne prescrit plus que la forme (`--r`, rayon des cartes) — plus aucune couleur. Tous les personnages démarrent avec **le même thème de plateforme par défaut** (gris neutre + accent bleu-gris, la teinte de la feuille Commune actuelle), quel que soit leur pack. L'utilisateur personnalise ensuite librement, **par personnage**, deux dimensions indépendantes :

1. **Fond** — teinte + intensité (chroma) appliquées à `--bg/--panel/--panel2/--line/--line2` (et à `--txt/--dim/--dim2` avec une intensité réduite ×0,35, pour que le texte reste proche du neutre même à forte intensité de fond).
2. **Accent** — teinte seule (`--acc/--acc-d/--on-acc/--focus`), comme dans la première version de cet amendement.

Le mécanisme reste une **capacité de plateforme** (même panneau « Apparence », même code, agnostique du pack) qui écrit une donnée **au niveau personnage** — conforme aux quatre couches de l'ADR-0017, au même rang que l'upscale (ADR-0020) ou le banc de comparaison (ADR-0021).

## Pourquoi une intensité, pas seulement une teinte, pour le fond

La Phase 0 fige `L`/`C` par rôle et ne fait varier que la teinte d'un pack à l'autre — bon principe pour des skins d'auteur (garder le même rythme de contraste). Pour un contrôle **utilisateur**, une teinte seule à chroma fixe produirait toujours un fond visiblement teinté, même pour qui veut un gris pur : on ajoute donc un curseur d'intensité (chroma, 0 → 0,05) à côté de la roue de teinte. À l'intensité 0, la teinte n'a aucun effet — c'est ce qui garantit que le défaut est identique pour tout le monde. Plafond bas et volontaire : au-delà, le risque de retomber sous les seuils WCAG déjà validés en Phase 0 augmente sans bénéfice d'ambiance supplémentaire.

## Dérivation exacte

Échelle de luminosité (`L`, OKLCH) fixe par rôle, jamais modifiée par l'utilisateur — c'est elle qui porte le contraste :

| Rôle | `L` |
|---|---|
| `--bg` | 0.15 |
| `--panel` | 0.20 |
| `--panel2` | 0.25 |
| `--line` | 0.32 |
| `--line2` | 0.44 |
| `--dim2` | 0.62 |
| `--dim` | 0.67 |
| `--txt` | 0.90 |

Pour chaque rôle : `oklch(L_rôle, intensité × facteur_rôle, teinte_fond)` — `facteur_rôle` = 1 pour `bg/panel/panel2/line/line2`, 0,35 pour `dim2/dim/txt`.

Accent (inchangé depuis la v1 de cet amendement), `L=0.76 C=0.06` fixes, teinte seule variable :
- `--acc` = `oklch(0.76, 0.06, H)`
- `--acc-d` = `oklch(0.54, 0.06, H)`
- `--on-acc` = le plus contrasté de `#050505`/`#f5f5f5` contre `--acc`, revérifié ≥ 4.5:1
- `--focus` = `oklch(0.90, 0.06, H+40°)`, revérifié ≥ 3:1 contre `--bg`/`--panel2` du fond personnalisé ; `L` augmenté par pas de 0,02 (max 0,97) si besoin

Toutes les valeurs sont recalculées à la volée, jamais figées au commit — même garantie que la Phase 0, appliquée en direct au lieu d'être vérifiée une fois pour trois feuilles fixes.

## Garde-fou : accent vs verdicts

Inchangé : le sélecteur de teinte d'accent avertit (texte) quand la teinte choisie tombe à moins de 12° d'une teinte de verdict (`ok`≈145°, `warn`≈75°, `bad`≈22°, `high`≈165°). N'avertit pas sur la teinte de fond : à l'intensité plafonnée (0,05), un fond ne peut pas se confondre avec un verdict plein.

## Mécanique d'application

Toujours une propriété inline sur `:root`, posée par un hook sœur de `usePackTheme.ts` (ex. `useCharacterTheme(character.appearance)`) — mais désormais sur **huit** tokens, pas quatre, et sans dépendance à `data-pack` :

```js
const root = document.documentElement
;['--bg','--panel','--panel2','--line','--line2','--txt','--dim','--dim2','--acc','--acc-d','--on-acc','--focus']
  .forEach((p) => root.style.setProperty(p, computed[p]))
```

Personnage sans personnalisation (`appearance` absent/vide) → `computed` vaut exactement le thème de plateforme par défaut (teinte 220°, intensité 0) : aucune différence visible avec aujourd'hui tant que l'utilisateur n'a rien touché.

**Conséquence sur `tokens.css`** : les trois feuilles de la Phase 0 (`Commune`/`instagram-influenceur`/`rpg-personnage`) perdent toute couleur — elles ne gardent que `--r`. `--bg/--panel/…/--acc/--acc-d/--on-acc/--focus` déménagent sur `:root` nu, à la valeur de plateforme par défaut, et ne varient plus qu'en inline via ce hook.

## Donnée persistée

Sur le personnage : `appearance: { neutralHue: number, neutralIntensity: number, accentHue: number }`, tous optionnels (absents = défaut de plateforme). `--acc-d/--on-acc/--focus` et les 5 autres neutres restent dérivés, jamais stockés.

## Emplacement du contrôle

Panneau **« Apparence »** dans l'écran Application, deux roues côte à côte (Fond, Accent) + le curseur d'intensité du fond — identique quel que soit le pack du personnage ouvert.

## Hors périmètre

- La forme (`--r`) reste la seule chose que le pack continue de fixer — non demandé, non touché.
- Pas d'implémentation React/CSS livrée ici — ce document fixe la mécanique ; `Prototype accent personnalisable.dc.html` (ce projet) donne le comportement à l'écran ; le geste dans le repo reste séparé, côté Claude Code.

En attente de validation avant de reprendre les écrans 1 (Wizard), 2 (Fiche) et 3 (Produire) — les trois consomment ces tokens sans changement de leur côté, seule la Phase 0 (tokens.css) et le nouveau panneau Apparence sont concernés.
