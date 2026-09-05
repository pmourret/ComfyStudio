# DOCS/cadrage/ — Sessions de cadrage

Un fichier par session de cadrage, daté : `AAAA-MM-JJ-sujet-court.md`.
Chaque fichier capture une session telle qu'elle s'est déroulée — jamais
réécrit après coup, au même titre qu'un ADR. Une session qui revient sur
un sujet déjà cadré ouvre un nouveau fichier, elle ne modifie pas
l'ancien.

Sessions à ce jour :
- `2026-08-25-vision-initiale.md` — document de vision macro
- `2026-08-26-univers-personnage-nsfw.md` — passage point par point
  (univers, personnage, registre de création, NSFW, style)
- `2026-09-04-architecture-quatre-couches.md` — modèle de responsabilités
  plateforme/pack/monde/personnage, découpage du chantier J8 en 5 étapes
- `2026-09-05-cadrage-v1-et-discipline.md` — refonte du cadrage
  stratégique, cinq règles de discipline, fichiers `PROJET.md`/
  `BACKLOG.md`/`DOCS/retros/` créés à partir de cette session
- `2026-09-05-phase-2-cloture-v1.md` — découpage de la clôture réelle de
  V1 en 4 étapes testables (tests verts, périmètre du parcours nominal,
  audit UX/UI, décision Abyssiaelle/SDXL)

**Ce ne sont pas des documents de référence à jour.** Ils capturent la
réflexion telle qu'elle s'est déroulée, y compris des formulations depuis
corrigées par une session suivante (exemple : la vision initiale évoquait
un NSFW « actif par défaut », corrigé en « off par défaut » dans la
session du 26/08). Les décisions qui en sortent sont formalisées et
tenues à jour ailleurs :

- Les règles actuelles de la plateforme : `CLAUDE.md`
- Le séquencement (quoi, quand) : `ROADMAP.md`
- Le pourquoi de chaque décision structurante, avec les alternatives
  écartées : `DOCS/adr/`

**En cas de divergence entre une session de cadrage et `CLAUDE.md` /
`DOCS/adr/`, ces derniers font foi.**