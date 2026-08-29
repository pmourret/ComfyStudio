# ADR-0013 : Le graphe d'édition est un actif de pack, et peut manquer

## Statut

Accepté (2026-08-29)

## Contexte

L'ADR-0003 a posé que le NSFW est une composition de deux outils globaux
(modification live par IA + éditeur d'image), et que ça ne coûte aucun
travail NSFW spécifique par univers — **« tant que les deux outils globaux
existent pour lui »**. J7 a buté sur cette clause.

L'outil de modification live par IA est un graphe ComfyUI. Ses étages
d'édition (Qwen) et de refiner sont agnostiques, mais son étage « identité
restaurée » est **PuLID Flux + FaceDetailer** — lié à la famille de modèle,
comme le verrou d'identité l'est déjà (ADR-0002, ADR-0011). Il n'a pas
d'équivalent pour un pack SDXL/LoRA : l'écrire demande un graphe neuf, sa
validation `wf_check`, et une mesure par personnage.

Jusqu'ici ce graphe était un chemin en dur dans le runner, doublé d'une clé
`workflow` dans le `config.json` de Léna — donc un graphe attaché à un
personnage, ce que `CLAUDE.md` §8.11 interdit.

Tension : l'interrupteur NSFW est **par personnage** (ADR-0010), mais l'outil
qu'il active est **par pack**. Deux axes distincts, qu'on ne peut pas fondre
en un seul booléen sans mentir à l'utilisateur.

## Décision

`universe.json` déclare `edit_workflow`, **nullable**. Le graphe est résolu
depuis le pack du personnage, jamais depuis le personnage.

Le cran d'édition n'est proposé qu'à **deux conditions, jamais une seule** :
le personnage est armé (`character.json` / `nsfw`) **et** son pack déclare un
`edit_workflow`. Un pack sans graphe le dit en toutes lettres. Armer un
personnage d'un tel pack reste **permis** et ne fait apparaître aucun cran.

## Alternatives envisagées

- **Un seul graphe d'édition pour toute la plateforme** — écarté : son étage
  d'identité est lié à la famille de modèle. Le partager reviendrait à
  appliquer PuLID Flux à un personnage SDXL, c'est-à-dire à produire un
  visage qui n'est pas le sien.

- **Déclarer le palier pour tous les packs et laisser échouer au lancement** —
  écarté : un cran qui ne peut pas marcher est pire qu'un cran absent. Il se
  découvre après avoir choisi ses images et écrit son instruction.

- **Interdire l'armement quand le pack n'a pas l'outil** — écarté : ça fond
  deux axes indépendants en un. L'armement est une décision sur le
  *personnage*, qui reste vraie quand le pack gagnera son graphe ; refuser de
  l'enregistrer obligerait à la reprendre, et rendrait l'interrupteur
  incohérent d'un pack à l'autre.

- **Écrire le graphe SDXL dans la foulée** — écarté pour cette session : ce
  n'est pas une déclaration mais un chantier (graphe + `wf_check` + mesure par
  personnage), et J7 se valide sans lui.

## Conséquences

Ajouter un pack ne coûte toujours aucun travail NSFW — mais l'ADR-0003 est
désormais explicite sur ce que sa clause impliquait : **l'outil doit exister
pour le pack**, et son absence est un état déclaré et affiché, pas une panne
silencieuse ni un cran mort.

Le runner ne connaît plus aucun chemin de graphe ; `config.json` n'en porte
plus. Ce que `CLAUDE.md` §8.11 disait des graphes de production vaut
maintenant aussi pour celui d'édition.

Un personnage armé peut n'avoir aucun cran. C'est voulu, et c'est la raison
pour laquelle l'écran Application affiche **pourquoi** plutôt que de rester
muet ou de masquer l'interrupteur.

Coût accepté : deux conditions à tenir cohérentes entre le serveur
(`edit_tool_state`) et ce que l'interface montre. Une seule fonction les
calcule, et un test couvre le cas qui les distingue — armé, mais pack sans
graphe.
