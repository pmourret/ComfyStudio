# ComfyStudio

> Studio de création de personnages IA construit au-dessus de ComfyUI —
> orchestration multi-personnage et multi-univers, pensée comme une couche
> supplémentaire au-dessus de ComfyUI plutôt qu'un remplacement.

## Statut

Projet personnel, en développement actif. Voir [`ROADMAP.md`](ROADMAP.md)
pour l'avancement (V1 en cours — fondations et généralisation à deux
univers réels).

## Ce que c'est

Une plateforme qui gère plusieurs personnages IA, chacun rattaché à un
**univers** (un monde créatif avec sa propre famille de modèle et son
propre panel d'outils), avec pour chaque personnage un outil de travail
complet plutôt qu'un pipeline à usage unique.

Univers en place ou en cours :
- **Instagram / influenceur** — cohérence de personnage, création de
  publications, contenu lifestyle
- **RPG / personnage** — personnage ancré dans un univers narratif

D'autres univers (art pur, monde RPG complet) sont sur la feuille de route
mais pas encore construits — voir `ROADMAP.md`.

## Structure du repo

```
CHARACTERS/<nom>/     # données de chaque personnage — non versionnées
UNIVERS/<nom>/          # panel d'outils par univers (tools.json)
AUTOMATION/                # moteur partagé : exécution, conversion de
                              # workflows, verrous d'identité, base
DOCS/
  adr/                        # historique des décisions d'architecture
  cadrage/                      # sessions de cadrage brutes (archivé)
.claude/
  skills/                        # connaissances de domaine pour Claude Code
CLAUDE.md                          # règles pour Claude Code
ROADMAP.md                           # séquencement du développement
```

## Prérequis

Une instance ComfyUI locale avec les nœuds custom listés dans
`.claude/skills/workflow-comfyui/references/modeles-par-univers.md`. GPU
recommandé : 16 Go de VRAM ou plus (développé sur RTX 4070 Ti Super).

## Documentation

| Besoin | Où |
|---|---|
| Comprendre les règles actuelles de la plateforme | `CLAUDE.md` |
| Voir où en est le développement | `ROADMAP.md` |
| Comprendre pourquoi une décision structurante a été prise | `DOCS/adr/` |
| Retrouver la réflexion d'origine, session par session | `DOCS/cadrage/` |
| Connaissances de domaine (ComfyUI, conventions de code) | `.claude/skills/` |

## Contenu

Les personnages de cette plateforme sont des personnages fictifs
entièrement générés — jamais basés sur une personne réelle. Chaque
personnage peut activer un mode de contenu mature, **désactivé par
défaut**, à activer explicitement dans le paramétrage.

## Contribuer

Projet solo pour le moment. Le dépôt a vocation à devenir public une fois
la base validée — voir la Mission et `DOCS/adr/0005-separation-donnees-code.md`.

## Licence

À définir avant le passage en public.
