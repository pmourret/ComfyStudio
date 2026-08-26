---
name: nouveau-personnage
description: A utiliser pour onboarder un nouveau personnage dans un univers deja existant de la plateforme - creation de son identite, de sa structure de dossiers, de sa config mesuree et de son enregistrement dans le registre personnage.
---

# Onboarder un nouveau personnage

## Prérequis

L'univers du personnage doit déjà exister (registre univers, implémentation
`identity/` correspondante, panel d'outils). Si ce n'est pas le cas, c'est
le skill `nouvel-univers` qu'il faut suivre d'abord — ce skill-ci ne crée
jamais de nouvel univers en cours de route.

## Étape 1 — Base personnage (identité de référence)

Portrait de référence, composition centrée, généré depuis la famille de
modèle de l'univers. Le principe fondateur de la plateforme s'applique sans
exception : **personnage fictif entièrement généré — jamais basé sur une
personne réelle, aucune photo de tiers en entrée de cette étape.**

Une fois validée : geler la sortie en fichier et la recharger comme
référence pour tout le reste. Ne jamais régénérer la base personnage à
chaque contenu produit — c'est la cause n°1 de dérive de personnage.

## Étape 2 — Mesurer le verrou d'identité pour CE personnage

L'implémentation du verrou d'identité vient de l'univers (voir
`workflow-comfyui/references/modeles-par-univers.md`), mais ses **réglages
sont propres à ce personnage** — ne jamais copier les seuils/poids d'un
autre personnage du même univers, même famille de modèle.

À mesurer et documenter avant la première production :
- La bande de score d'identité (scoring contre la base gelée) qui définit
  "conforme" pour ce visage précis — elle n'a aucune raison de coïncider
  avec celle d'un autre personnage
- Les poids du mécanisme d'identité (ex. `weight`/`start_at`/`end_at` pour
  un verrou type PuLID, ou le mot déclencheur + poids pour un LoRA de
  personnage)

## Étape 3 — Structure de dossiers

```
CHARACTERS/<nom>/
  config.json       # measured settings (step 2 + step 4)
  scenes.json        # this character's scene bank
  creative.json        # this character's tone/intention taxonomy
  INPUTS/
    CHARACTER/          # frozen base(s) and reference views
    SCENE/                # composition references
    REALISME/              # realism reference corpus (texture/grain)
    POSE/                    # skeletons, if the univers uses posing
  PROD/{OK,A_REVOIR,REJET,ARCHIVE}/
  EXPORT/
```

## Étape 4 — Réglages mesurés, pas hérités

`config.json` (guidance, denoise refiner, denoise FaceDetailer, seuils
QC `threshold_ok`/`threshold_watch`/`threshold_high`, grain) se mesure pour
ce personnage — ce sont des observations empiriques sur son visage et son
esthétique, pas des constantes de la plateforme. Repartir des réglages d'un
personnage existant du même univers comme point de départ raisonnable, mais
les valider par la mesure avant de les considérer acquis.

## Étape 5 — `build_jobs` et assembleur de prompt

Chaque personnage a son propre assembleur de prompt, verrouillé par un test
à l'octet près dès sa création — pas après coup une fois la production
lancée (invariant `CLAUDE.md` §8.3).

## Étape 6 — Collecte des scènes de référence

Dépend de l'outillage de l'univers (`CLAUDE.md` §5) : banque curée à la main
via les outils du Dashboard. Si une référence de composition part d'une
**vraie photo montrant une personne**, voir
`references/scene-anonymisation.md` — ne jamais charger cette photo
directement comme référence visuelle dans un workflow.

## Étape 7 — Enregistrement dans le registre personnage

Champs à renseigner (`CLAUDE.md` §7) :
- Univers associé (fixé, non modifiable ensuite)
- Registre de création : types de contenu actifs — `image` seul en V1,
  `vidéo`/`voix` déclarés mais inactifs (voir `ROADMAP.md`)
- NSFW : **off par défaut**, à activer explicitement dans le paramétrage si
  souhaité

## Étape 8 — Validation avant première production

`wf_check.py --roles` puis `wf_check.py --essai` sur tout workflow touché
ou créé pour ce personnage (voir skill `workflow-comfyui`) — avant tout
batch réel, pas après.

## Checklist finale

- [ ] Base personnage gelée, aucune photo de tiers utilisée
- [ ] Bande d'identité mesurée et documentée pour ce personnage
- [ ] Structure de dossiers créée
- [ ] `config.json` mesuré (pas copié tel quel d'un autre personnage)
- [ ] `build_jobs` + test byte-exact en place
- [ ] Registre personnage renseigné (univers, registre de création, NSFW off)
- [ ] `wf_check.py --roles` et `--essai` passés sur les workflows touchés
