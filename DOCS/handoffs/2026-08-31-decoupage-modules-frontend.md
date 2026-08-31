# Handoff — Découpage du frontend en modules

**Date** : 31/08/2026 · **Base** : `d4ca556` (découpage backend en services)
**Portée** : les quatre écrans lourds. Aucun changement de parcours.
**Statut** : clos. 9/9 fumigations navigateur, build TypeScript vert.

Même geste que côté backend, transposé : l'écran ne garde que la composition,
les hooks portent l'état et les gestes, les sous-composants sortent en fichiers
et n'appellent jamais l'API.

## Le constat

`useTriage` et `useProduceState` avaient déjà sorti **le chargement**. Ce qui
restait dans les écrans, c'était l'autre moitié du même métier — les mutations,
le clavier, les dérivations — noyée dans 300 à 650 lignes de JSX, plus les
sous-composants dans le même fichier.

| Écran | Avant | Après | Sorti en |
| --- | --- | --- | --- |
| Revue | 1051 | **363** | 6 composants + 2 hooks |
| Produire | 966 | **605** | 3 composants + 2 hooks + 1 fonction pure |
| Éditeur photo | 827 | **673** | pixels + chaînes de style |
| Wizard | 689 | **436** | `StepBody`, `OptionCard`, `shared` |

## La règle posée

```text
Screen.tsx   composition et mise en page — il rend, il ne décide pas
useXxx.ts    l'état et les gestes
Xxx.tsx      présentation pure — props + callbacks, aucun appel API
```

Deux conséquences qui ne se devinent pas, écrites dans `.claude/rules/frontend.md` :

- ce qui est **partagé par deux fichiers et possédé par aucun** (`actionStyles.ts`,
  `shared.ts`) prend son fichier. L'exporter depuis l'un ferait dépendre le
  second du premier pour une raison étrangère à son rôle ;
- une **fonction pure** sort en fonction, pas en hook. `runSummary.ts` se lit et
  se teste sans monter React.

## Ce qui n'a pas été découpé, et pourquoi

- **La géométrie de recadrage de `PhotoEditor`** (rotatedDims, safetyMargin,
  sizeCanvas, centredCrop, le glisser) : une machine à états tenue par quatre
  refs. L'enfiler dans une signature de hook serait moins lisible que le fichier.
- **Les quatre étapes du wizard en un seul `StepBody`** : elles partagent une
  mise en page et une façon de dire « ce choix est figé à la création » (§8.8).
  Quatre fichiers copieraient ce cadre quatre fois.
- **Le corps de `ProduceScreen`** reste à ~300 lignes de logique : c'est une
  seule machine à états (niveau, intention, sélection, plan, lancement) dont
  les morceaux se lisent mutuellement.

## L'accessibilité, findings d'abord

Skill `audit-ux-ui` chargé avant tout patch, cinq findings sur le périmètre
déplacé. Corrigés dans des commits **séparés** des déplacements, pour qu'un
diff dise une seule chose.

| # | Sév. | Corrigé |
| --- | --- | --- |
| 1 | Majeur | Les 9 boutons du tri n'avaient qu'un glyphe + `title` : « Garder » s'annonçait « cœur noir ». `aria-label` sur chacun. |
| 2 | Majeur | Les 6 curseurs de l'éditeur n'avaient pas de `<label htmlFor>` — « curseur, -60 à 60 », sans dire de quoi. Les `id` existaient déjà. |
| 3 | Mineur | `aria-hidden` sur les glyphes qui accompagnent un libellé texte. |
| 4 | Mineur | `🗑` en emoji sur l'action la plus destructive — **non patché** : maintenant que le bouton est nommé, changer le glyphe est un choix de style, pas d'accessibilité. À trancher. |
| 5 | Nit | **Clos sans patch, mesuré** : la bordure de la tuile visée est à 7,07:1 sur le panneau et 5,23:1 contre la bordure au repos, pour 3:1 exigés (WCAG 1.4.11). |

Preuve qu'aucun pixel n'a bougé sur les deux commits d'a11y : la feuille sort
avec **le même hash** (`index-DoT1EI7s.css`).

## Vérifications

- **9/9 fumigations navigateur** après chaque commit, et en bloc à la fin.
- Build TypeScript vert à chaque étape — c'est lui qui a rattrapé les imports
  morts et les symboles non exportés, un par un.
- Les fumigations sélectionnent sur `data-a=` / `data-tacts`, jamais sur le
  texte : c'est ce qui a rendu l'ajout de libellés cachés sans risque.
- Côté Python : `serveur_http`, `build_jobs`, `valider_banque`,
  `scenes_categories`, `apercu_prompt`, `tri_export` — verts.

## Ce qui reste ouvert

- Le glyphe `🗑` (finding 4).
- `test_coherence_base` : 4 mesures NSFW sur disque absentes de la base.
  Antérieur aux deux chantiers, décalage de données, pas de code.
- Le skill `audit-ux-ui` dit encore « JS vanilla, zéro framework, zéro build »
  dans son rôle : périmé depuis la migration React du 30/08. `frontend.md` fait
  foi, mais le skill devrait être corrigé avant de servir de brief à quelqu'un
  qui ne le sait pas.

## Prochaine étape attendue

Le découpage est fini, backend et frontend. La file reprend à `ROADMAP-finition-studio.md`,
session 1 : F1.1 + F1.3.
