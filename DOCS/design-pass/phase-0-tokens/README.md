
# Phase 0 — Direction de tokens (identité commune + habillages Léna / Abyssiaelle)

Statut : **proposition à valider** — verrouillage requis avant d'ouvrir le premier écran (cadrage de session, non renégociable ici).

Source lue avant proposition : `CLAUDE.md`, `.claude/rules/frontend.md`, `AUTOMATION/web/ui/src/styles/DESIGN.md` + `tokens.css`/`theme.css`/`base.css` réels, ADR-0017 à 0021, `ROADMAP.md` (§ Studio IA), `PACKS/*/universe.json`, `WORLDS/*.json`.

## Portée

Trois feuilles de tokens, **mêmes noms** que le contrat existant (`DESIGN.md` § Contrat de tokens), aucune structure ni composant touché :

1. **Commune** (`tokens.commune.json`) — chrome/base : sas (`body.no-character`), écran Personnages, wizard avant que le pack soit résolu (étapes type/style). C'est la feuille par défaut, pas une troisième peau qui s'ajouterait aux deux packs.
2. **Léna / instagram-influenceur** (`tokens.instagram-influenceur.json`) — ambiance tirée du monde `slow-life` : *"calm and unhurried: natural light, lived-in interiors, quiet outdoor moments"*.
3. **Abyssiaelle / rpg-personnage** (`tokens.rpg-personnage.json`) — ambiance tirée du monde `terres-sauvages` : *"wilderness travel: forests and dusk, campfires, worn traveller's gear, low muted light"*.

Aucune des trois ne change `--maxw` (1180px partout) : c'est une valeur de layout, pas d'ambiance — la faire varier par pack violerait la contrainte « pas de mise en page par personnage » (CLAUDE.md §7).

## Méthode de génération et de contrôle

Palettes construites en OKLCH (lightness/chroma/hue) puis converties en sRGB — permet de garder chroma bas et constant sur toutes les surfaces neutres d'un même pack (évite l'écueil déjà tracé dans `tokens.css` : *"elles étaient chaudes et faisaient des taches brunes sur le fond froid"*). Seule la teinte neutre (`bg/panel/panel2/line/line2/txt/dim/dim2`) et la teinte d'accent changent d'un pack à l'autre ; les lightness/chroma de chaque rôle sont identiques, donc le rythme visuel (contraste relatif entre bg/panel/panel2) est le même dans les trois habillages — seule la couleur change, jamais la structure.

Contrastes calculés (luminance relative WCAG, formule officielle), pas estimés à l'œil. Chaque paire ci-dessous est vérifiée contre le **fond réel** où le token sert (même méthode que le `tokens.css` actuel : *"contre les fonds où elles servent réellement"*), pas un contrôle global.

## Décisions transverses (à valider explicitement)

1. **Teintes de statut constantes dans les 3 feuilles** — `warn-bg/-line/-txt`, `danger-bg/-line/-txt`, `mes-bg/-line`, et les teintes de `ok/warn/bad/high` sont **identiques** commune/Léna/Abyssiaelle. Rationale : un bandeau d'erreur ou un verdict QC doit se lire pareil quel que soit l'univers actif — c'est un signal de sécurité, pas une ambiance. Seule la teinte neutre/accent change par pack.
2. **Typographie inchangée** — `--font`/`--font-mono` restent à la valeur actuelle (`system-ui,'Segoe UI',Roboto,sans-serif`) dans les 3 feuilles. Un vrai changement de famille demanderait d'embarquer des fichiers de police (dépendance nouvelle, hors contrat "tokens seuls", et en tension avec la contrainte de portabilité — rien sous `%APPDATA%`, tout dans le dépôt). L'ambiance est déjà portée par palette + accent + forme ; dupliquer le signal dans la police ajouterait du bruit, pas un choix. **Point ouvert** : si vous voulez une vraie distinction typographique, ça implique de choisir et committer des fichiers de police — à trancher séparément, hors périmètre tokens-only de cette session.
3. **`--r` (rayon des cartes) varie, seul token de forme à le faire** — commune 10px (inchangé), Léna 12px (plus arrondi, registre lifestyle/réseau social), Abyssiaelle 6px (plus anguleux, registre outillage/RPG). `--maxw` ne varie jamais (layout, cf. portée ci-dessus).
4. **`--elev`/`--scrim` inchangés dans les 3 feuilles** — ombre et voile sont des primitives de profondeur neutres (noir translucide), pas une ambiance de palette ; les faire varier n'ajouterait rien de lisible.
5. **`--focus` varie** (teinte proche de l'accent de chaque pack, décalée pour rester distincte de `--acc` lui-même — même règle que l'anneau actuel) — vérifié ≥3:1 contre `--bg` et `--panel2`.

---

## 1. Commune

| Token | Valeur | Sert sur (réel, `DESIGN.md`) |
|---|---|---|
| `--bg` | `#0b1015` | corps de page |
| `--panel` | `#14191e` | cartes, `.rail`, `.sidenav` |
| `--panel2` | `#20252a` | inputs, dégradé composeur, surfaces secondaires |
| `--line` | `#2a3138` | bordures de carte |
| `--line2` | `#474e55` | bordures de contrôle (survol) |
| `--txt` | `#dfe5ec` | texte courant |
| `--dim` | `#9299a1` | `.muted` |
| `--dim2` | `#889099` | `.tiny`, `.brand-id`, crans verrouillés |
| `--acc` | `#90b0c4` | `.btn.primary`, `.link`, focus des contrôles |
| `--acc-d` | `#607f91` | survol de `.btn.primary` |
| `--on-acc` | `#050a0d` | texte posé sur `--acc` |
| `--ok` | `#639564` | verdict OK |
| `--warn` | `#b5943f` | verdict WATCH |
| `--bad` | `#cc6660` | verdict BAD |
| `--high` | `#42a878` | verdict HIGH |
| `--none` | `var(--dim2)` | pastille « aucun » |
| `--warn-bg` / `--warn-line` / `--warn-txt` | `#1d1503` / `#42330a` / `#e5d3a8` | `#dirtyBar` |
| `--danger-bg` / `--danger-line` / `--danger-txt` | `#270d0b` / `#642724` / `#f9bdb7` | `#panneBar`, `.btn.danger` |
| `--mes-bg` / `--mes-line` | `#07180b` / `#133c1f` | pastille « mesuré » du panneau de réglages |
| `--elev` | `0 14px 38px #00000099` | `.idmenu`, `#gearPanel`, `.launch .inner`, `#toast` |
| `--scrim` | `#0b0d10cc` | `::backdrop`, `#lightbox`, plaques sur vignette |
| `--focus` | `#8fcfff` | anneau `:focus-visible` |
| `--sb` / `--sb-h` / `--sb-l` | `#6b747d` / `#8d96a0` / `10px` | pouce de défilement (3 fonds) |
| `--font` | `15px/1.55 system-ui,'Segoe UI',Roboto,sans-serif` | texte courant |
| `--font-mono` | `12px ui-monospace,monospace` | `.kbd`, raccourcis |
| `--r` | `10px` | rayon des cartes |
| `--maxw` | `1180px` | largeur max du contenu centré |

### Contrôle WCAG — Commune

| Paire | Ratio | Seuil | Résultat |
|---|---|---|---|
| `--txt` / `--bg` | 15.06:1 | 4.5:1 | OK |
| `--txt` / `--panel` | 13.94:1 | 4.5:1 | OK |
| `--txt` / `--panel2` | 12.18:1 | 4.5:1 | OK |
| `--dim` / `--bg` | 6.64:1 | 4.5:1 | OK |
| `--dim` / `--panel` | 6.14:1 | 4.5:1 | OK |
| `--dim` / `--panel2` | 5.36:1 | 4.5:1 | OK |
| `--dim2` / `--panel` | 5.47:1 | 4.5:1 | OK |
| `--dim2` / `--panel2` | 4.78:1 | 4.5:1 | OK |
| `--on-acc` / `--acc` (texte de `.btn.primary`) | 8.71:1 | 4.5:1 | OK |
| `--warn-txt` / `--warn-bg` (`#dirtyBar`) | 12.25:1 | 4.5:1 | OK |
| `--danger-txt` / `--danger-bg` (`.btn.danger`) | 11.31:1 | 4.5:1 | OK |
| `--dim` / `--danger-bg` (`#panneBar span`) | 6.35:1 | 4.5:1 | OK |
| `--warn` utilisé en texte / `--warn-bg` | 6.26:1 | 4.5:1 | OK |
| `--acc` en texte (`.link`) / `--panel` | 7.74:1 | 4.5:1 | OK |
| `--acc` en texte / `--panel2` | 6.76:1 | 4.5:1 | OK |
| `--acc` en texte / `--bg` | 8.36:1 | 4.5:1 | OK |
| `--sb` / `--bg`, `--panel`, `--panel2` | 4.02 / 3.72 / 3.25 | 3:1 (1.4.11) | OK |
| `--sb-h` / `--bg`, `--panel`, `--panel2` | 6.37 / 5.90 / 5.15 | 3:1 | OK |
| `--focus` / `--bg`, `--panel2` | 11.41 / 9.22 | 3:1 | OK |

---

## 2. Léna / instagram-influenceur

| Token | Valeur | Sert sur |
|---|---|---|
| `--bg` | `#140e0a` |
| `--panel` | `#1d1713` |
| `--panel2` | `#29231f` |
| `--line` | `#372e29` |
| `--line2` | `#544b45` |
| `--txt` | `#ebe3dd` |
| `--dim` | `#a09690` |
| `--dim2` | `#978d86` |
| `--acc` | `#d5a051` (or chaud, lumière du monde `slow-life`) |
| `--acc-d` | `#a26f17` |
| `--on-acc` | `#0c0805` |
| `--ok` / `--warn` / `--bad` / `--high` / `--none` | `#639564` / `#b5943f` / `#cc6660` / `#42a878` / `var(--dim2)` *(identiques à Commune, décision transverse 1)* |
| `--warn-bg/-line/-txt`, `--danger-bg/-line/-txt`, `--mes-bg/-line` | identiques à Commune |
| `--elev` / `--scrim` | identiques à Commune |
| `--focus` | `#e5c379` |
| `--sb` / `--sb-h` / `--sb-l` | `#7c7069` / `#9e938b` / `10px` |
| `--font` / `--font-mono` | identiques à Commune *(décision transverse 2)* |
| `--r` | `12px` |
| `--maxw` | `1180px` *(inchangé)* |

### Contrôle WCAG — Léna

| Paire | Ratio | Seuil | Résultat |
|---|---|---|---|
| `--txt` / `--bg` | 15.10:1 | 4.5:1 | OK |
| `--txt` / `--panel` | 13.99:1 | 4.5:1 | OK |
| `--txt` / `--panel2` | 12.23:1 | 4.5:1 | OK |
| `--dim` / `--bg` | 6.62:1 | 4.5:1 | OK |
| `--dim` / `--panel` | 6.13:1 | 4.5:1 | OK |
| `--dim` / `--panel2` | 5.36:1 | 4.5:1 | OK |
| `--dim2` / `--panel` | 5.46:1 | 4.5:1 | OK |
| `--dim2` / `--panel2` | 4.78:1 | 4.5:1 | OK |
| `--on-acc` / `--acc` | 8.53:1 | 4.5:1 | OK |
| `--warn-txt` / `--warn-bg` | 12.25:1 | 4.5:1 | OK |
| `--danger-txt` / `--danger-bg` | 11.31:1 | 4.5:1 | OK |
| `--dim` / `--danger-bg` | 6.32:1 | 4.5:1 | OK |
| `--warn` en texte / `--warn-bg` | 6.26:1 | 4.5:1 | OK |
| `--acc` en texte / `--panel` | 7.58:1 | 4.5:1 | OK |
| `--acc` en texte / `--panel2` | 6.63:1 | 4.5:1 | OK |
| `--acc` en texte / `--bg` | 8.18:1 | 4.5:1 | OK |
| `--sb` / `--bg`, `--panel`, `--panel2` | 3.99 / 3.70 / 3.23 | 3:1 | OK |
| `--sb-h` / `--bg`, `--panel`, `--panel2` | 6.38 / 5.91 / 5.17 | 3:1 | OK |
| `--focus` / `--bg`, `--panel2` | 11.32 / 9.16 | 3:1 | OK |

---

## 3. Abyssiaelle / rpg-personnage

| Token | Valeur | Sert sur |
|---|---|---|
| `--bg` | `#091111` |
| `--panel` | `#121a1a` |
| `--panel2` | `#1d2626` |
| `--line` | `#273333` |
| `--line2` | `#445050` |
| `--txt` | `#dce7e8` |
| `--dim` | `#8f9b9c` |
| `--dim2` | `#859293` |
| `--acc` | `#f3896f` (braise/rouille, campfire du monde `terres-sauvages`) |
| `--acc-d` | `#bc5840` |
| `--on-acc` | `#0e0806` |
| `--ok` / `--warn` / `--bad` / `--high` / `--none` | identiques à Commune |
| `--warn-bg/-line/-txt`, `--danger-bg/-line/-txt`, `--mes-bg/-line` | identiques à Commune |
| `--elev` / `--scrim` | identiques à Commune |
| `--focus` | `#feb391` |
| `--sb` / `--sb-h` / `--sb-l` | `#677677` / `#899999` / `10px` |
| `--font` / `--font-mono` | identiques à Commune |
| `--r` | `6px` |
| `--maxw` | `1180px` *(inchangé)* |

### Contrôle WCAG — Abyssiaelle

| Paire | Ratio | Seuil | Résultat |
|---|---|---|---|
| `--txt` / `--bg` | 15.13:1 | 4.5:1 | OK |
| `--txt` / `--panel` | 14.00:1 | 4.5:1 | OK |
| `--txt` / `--panel2` | 12.26:1 | 4.5:1 | OK |
| `--dim` / `--bg` | 6.67:1 | 4.5:1 | OK |
| `--dim` / `--panel` | 6.17:1 | 4.5:1 | OK |
| `--dim` / `--panel2` | 5.40:1 | 4.5:1 | OK |
| `--dim2` / `--panel` | 5.49:1 | 4.5:1 | OK |
| `--dim2` / `--panel2` | 4.81:1 | 4.5:1 | OK |
| `--on-acc` / `--acc` | 8.16:1 | 4.5:1 | OK |
| `--warn-txt` / `--warn-bg` | 12.25:1 | 4.5:1 | OK |
| `--danger-txt` / `--danger-bg` | 11.31:1 | 4.5:1 | OK |
| `--dim` / `--danger-bg` | 6.39:1 | 4.5:1 | OK |
| `--warn` en texte / `--warn-bg` | 6.26:1 | 4.5:1 | OK |
| `--acc` en texte / `--panel` | 7.25:1 | 4.5:1 | OK |
| `--acc` en texte / `--panel2` | 6.35:1 | 4.5:1 | OK |
| `--acc` en texte / `--bg` | 7.84:1 | 4.5:1 | OK |
| `--sb` / `--bg`, `--panel`, `--panel2` | 4.03 / 3.73 / 3.27 | 3:1 | OK |
| `--sb-h` / `--bg`, `--panel`, `--panel2` | 6.44 / 5.96 / 5.22 | 3:1 | OK |
| `--focus` / `--bg`, `--panel2` | 10.97 / 8.89 | 3:1 | OK |

---

## Ce qui n'est pas dans ce livrable

- Pas de fichier `.css` : les trois JSON joints (`tokens.commune.json`, `tokens.instagram-influenceur.json`, `tokens.rpg-personnage.json`) donnent les valeurs exactes à transcrire dans les `tokens.css` réels — la transcription reste votre geste.
- Pas de proposition sur les valeurs « laissées brutes » du contrat (mouvement, détails de contrôle, voile du cadre de recadrage, liseré des pastilles, ambiances ponctuelles) : `DESIGN.md` les liste comme volontairement hors tokens, non rouvertes ici.
- Emplacement de navigation pour upscale/bench : hors Phase 0, viendra avec le livrable du premier des deux écrans (cadrage de session).

**En attente de votre validation avant d'ouvrir le premier écran.**
