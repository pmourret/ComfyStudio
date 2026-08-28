---
name: nouveau-personnage
description: A utiliser pour onboarder un nouveau personnage sur un pack (ex-univers) deja existant - mesure du verrou d'identite, assembleur de prompt et son test a l'octet pres, curation de la banque : tout ce que le wizard « nouveau personnage » ne fait pas.
---

# Onboarder un nouveau personnage

Depuis J7bis, le **wizard « nouveau personnage »** (écran `#wizard`,
`create_character`) fait le scaffolding : parcours `type → style → monde →
base d'identité → écriture de la fiche`, `config.json` aux **défauts du
pack** (`UNIVERS/<pack>/character_defaults.json`). Ce skill reste la
référence pour tout ce que le wizard **ne fait pas** : mesurer le verrou
d'identité pour ce visage, écrire l'assembleur de prompt et son test à
l'octet près, curer la banque de scènes. Un personnage sorti du wizard est
**lançable mais non calibré** (`identity` et `qc` portent `measured: false`).

## Les quatre axes (ADR-0012)

Trois choix humains, figés à la création : **type de personnage**, **style
de sortie**, **monde**. Le **pack** (famille de modèle + mécanisme
d'identité + graphe de production — ex-« univers ») n'est **pas choisi** :
il se déduit de `(type, style)` par `universe.resolve()` /
`UNIVERS/resolution.json`. En changer l'un des trois = créer un autre
personnage.

## Prérequis

Le pack visé doit déjà exister (`universe.json` avec `identity` / `workflow`
/ `types`, implémentation `AUTOMATION/identity/` correspondante,
`character_defaults.json`, panel d'outils) **et au moins un monde
compatible** (`WORLDS/<id>.json` dont `compatible_families` inclut la
famille du pack). Sinon, suivre `nouvel-univers` d'abord — ce skill-ci ne
crée jamais de pack ni de monde en cours de route.

## Étape 1 — Base personnage (identité de référence)

Portrait de référence, composition centrée. Deux voies, toutes deux dans le
wizard : **fournie** (upload d'une image) ou **générée** — un portrait
produit par le graphe du pack, **verrou d'identité bypassé** puisqu'aucune
référence n'existe encore (`base_portrait=True`,
`AUTOMATION/base_portrait.py`). Le principe fondateur s'applique sans
exception : **personnage fictif entièrement généré — jamais basé sur une
personne réelle, aucune photo de tiers**, y compris à l'upload.

Le candidat retenu est gelé dans `ComfyUI/input/` sous `<CID>_BASE.<ext>` et
inscrit dans `config.json` / `base_gelee`. Ne jamais régénérer la base à
chaque contenu produit — c'est la cause n°1 de dérive de personnage.

## Étape 2 — Mesurer le verrou d'identité pour CE personnage

L'implémentation du verrou d'identité vient du **pack** (voir
`workflow-comfyui/references/modeles-par-univers.md`), mais ses **réglages
sont propres à ce personnage** — ne jamais copier les seuils/poids d'un
autre personnage du même pack, même famille de modèle.

À mesurer et documenter avant la première production :
- La bande de score d'identité (scoring contre la base gelée) qui définit
  "conforme" pour ce visage précis — elle n'a aucune raison de coïncider
  avec celle d'un autre personnage
- Les poids du mécanisme d'identité — ils vont dans `config.json` / `identity`,
  jamais en dur dans le workflow (ADR-0011). Pour un verrou PuLID-Flux :
  `{ "weight", "start_at", "end_at" }`, injectés par
  `AUTOMATION/identity/pulid_flux.py`. Pour un LoRA SDXL : mot déclencheur +
  poids (contrat figé à l'onboarding du premier personnage rpg, J6).

## Étape 3 — Structure de dossiers

Créée par le wizard (`create_character`). Ne pas la monter à la main.

```
CHARACTERS/<nom>/
  character.json    # registre : type, world, universe (= pack résolu),
                     #            output_style, content_types, nsfw
  config.json       # défauts du pack (wizard) + valeurs mesurées (étapes 2 et 4),
                     #            dont `identity` et `base_gelee`
  scenes.json        # this character's scene bank (amorcée depuis le monde)
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
esthétique, pas des constantes de la plateforme. Le wizard part des
**défauts du pack** (`UNIVERS/<pack>/character_defaults.json`, `identity` et
`qc` marqués `measured: false`) : les valider par la mesure et **retirer le
marqueur** avant de les considérer acquis.

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

`CHARACTERS/<nom>/character.json` (git-ignoré, ADR-0010). Écrit par le
wizard ; champs (`CLAUDE.md` §7, ADR-0010/0011/0012) :
- `type` : type de personnage, **figé à la création**
- `output_style` : style de sortie, choisi dans `output_styles` du pack,
  **figé à la création**. Un pack mono-style n'a qu'un choix.
- `world` : monde, choisi parmi les `WORLDS/` compatibles avec la famille du
  pack, **figé à la création**
- `universe` : le **pack résolu** de `(type, style)` — écrit par le wizard,
  jamais choisi à la main, jamais modifié ensuite
- `content_types` : types de contenu actifs — `image` seul en V1,
  `video`/`voice`/`staging` déclarés inactifs (voir `ROADMAP.md`)
- `nsfw` : **off par défaut**, armé explicitement dans le paramétrage si
  souhaité (l'interrupteur vit ici, pas dans `config.json`)

## Étape 8 — Validation avant première production

`wf_check.py --roles` puis `wf_check.py --essai` sur tout workflow touché
ou créé pour ce personnage (voir skill `workflow-comfyui`) — avant tout
batch réel, pas après.

## Checklist finale

- [ ] Base personnage gelée (fournie ou générée), aucune photo de tiers
- [ ] Bande d'identité mesurée et documentée pour ce personnage
- [ ] `config.json` : `identity` et `qc` mesurés, marqueur `measured: false` retiré
- [ ] `build_jobs` + test byte-exact en place
- [ ] `character.json` : `type` / `output_style` / `world` figés, `universe` =
      pack résolu, `content_types`, NSFW off
- [ ] `wf_check.py --roles` et `--essai` passés sur le graphe du pack s'il est touché
