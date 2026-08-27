# ADR-0011 : Verrou d'identité et style de sortie — interfaces choisies par l'univers

## Statut

Accepté (2026-08-27)

## Contexte

J4 a fait de `universe.json` un registre déclaratif : `identity`
(`"pulid_flux"` / `"lora_sdxl"`) et `output_styles` étaient des chaînes que
rien dans le code ne consommait. J5 doit les rendre effectifs.

Deux tensions :

1. **Où vit le verrou d'identité.** Pour Léna, les poids PuLID
   `weight/start_at/end_at = [0.85, 0.10, 1.00]` vivaient **en dur dans le
   widget** du nœud `ApplyPulidFlux` du workflow, et l'image de référence dans
   un widget `LoadImage`. `config.json` n'avait aucun bloc `identity` — entorse
   à `CLAUDE.md` §8.4, et le skill `nouveau-personnage` (étape 2) demande ces
   poids en config **mesurée par personnage**.

2. **Style de sortie.** `CLAUDE.md` §3 : le style (réaliste / fantastique /
   cartoon / manga) est fixé à la création du personnage, non modifiable
   ensuite — « changer de style reviendrait à changer d'univers » (§4). Rien
   ne le stockait ni ne l'appliquait.

## Décision

**Le verrou d'identité est une interface choisie par l'univers**
(`AUTOMATION/identity/`, `CLAUDE.md` §4), pas une fonction par personnage :

- `universe.json` / `identity` nomme l'implémentation ;
  `identity.for_universe(uid)` la résout.
- Contrat : `REQUIRED_ROLES` (nœuds du graphe pilotés) +
  `apply(api, roles, character_config, job)` qui **modifie le graphe converti
  en place**, comme `WorkflowRunner.api_for` le fait déjà pour guidance/seed.
- `pulid_flux.py` (réel, univers `instagram-influenceur`) : injecte
  `weight/start_at/end_at` depuis `config.json` / `identity` et l'image de
  référence depuis `config.json` / `base_gelee`.
- `lora_sdxl.py` (univers `rpg-personnage`) : **stub** levant
  `NotImplementedError` — implémenté en J6 avec le premier personnage rpg et
  son workflow SDXL (contrat figé à l'aveugle = contrat faux).

**Les poids d'identité passent dans `config.json`** (bloc `identity`), valeurs
identiques au widget d'origine — l'injection est transparente, vérifiée par
une génération réelle (§8.1).

**Le style de sortie est figé dans `character.json`** (`output_style`), validé
à la lecture contre `universe.style_names(uid)`, écrit par **aucune** route
(gelé par construction, comme `universe`). L'**effet** de chaque style est
déclaré par l'univers (`output_styles` : map `name -> {prompt_add, checkpoint}`)
et appliqué dans `api_for`. Pour `instagram-influenceur` / `realiste` :
`prompt_add` vide, pas de swap → graphe inchangé.

**La couche de mesure d'identité reste commune** (`AUTOMATION/qc_identity.py`,
InsightFace antelopev2) — `identity/` est côté génération uniquement (§4).

## Alternatives envisagées

- **Laisser les poids PuLID dans le widget du workflow, `identity/` = simple
  couture** — écarté : J5 se terminerait sans implémentation réelle, et §8.4 +
  le skill demandent explicitement ces poids en config mesurée.
- **`identity.apply(job, personnage) -> job`** (signature du skill
  `nouvel-univers`) — écarté : le travail réel est de la manipulation de
  nœuds du graphe converti, pas du dict de job. La signature réelle est
  `apply(api, roles, character_config, job)` ; les skills sont corrigés
  (`CLAUDE.md` §11).
- **Implémenter `lora_sdxl.py` pour de vrai en J5** — écarté : aucun workflow
  SDXL ni personnage rpg n'existe pour valider le contrat.
- **Style dans `config.json`** — écarté : `config.json` porte les réglages
  *mesurés* ; le style est un choix d'identité figé à la création, au même
  titre que `universe` → `character.json`.
- **Câbler le style au pipeline seulement en J6** — écarté (choix
  utilisateur) : la table style → effet et son application dans `api_for`
  sont posées dès J5, même si seul `realiste` (inerte) est exercé avant J6.

## Conséquences

- Onboarder un personnage Flux = mesurer et renseigner `config.json` /
  `identity` + `character.json` / `output_style` ; aucune retouche de graphe.
- `WorkflowRunner(cfg, character_id)` : résout l'univers du personnage pour
  choisir l'implémentation d'identité et l'effet de style. `execute_jobs` et
  la CLI enfilent `character_id`.
- **Asymétrie assumée** : la branche NSFW (`nsfw_batch.NsfwRunner`) garde son
  propre `ApplyPulidFlux` baké (poids `[0.9, 0.05, 1.0]` — tuning délibéré,
  différent de la passe SFW). À replier dans `identity/` quand le NSFW est
  généralisé comme outil (J7), pas avant.
- `job["output_style"]` est estampillé par `build_jobs` : donnée disponible
  pour le runner de J6 (choix de checkpoint / fragment de prompt d'un
  personnage rpg), n'entre pas dans le prompt assemblé (`test_build_jobs.py`
  byte-exact reste vert).
