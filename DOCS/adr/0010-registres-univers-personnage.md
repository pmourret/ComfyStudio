# ADR-0010 : Registre univers et registre personnage — fichiers par entité, découverte par scan

## Statut

Accepté (2026-08-27)

## Contexte

J4 introduit les deux registres exigés par `CLAUDE.md` §3–§5 et §7 : un
registre **univers** (famille de modèle, mécanisme de verrou d'identité, panel
d'outils) et un registre **personnage** (univers associé, types de contenu
actifs, indicateur NSFW off par défaut). Jusqu'ici `character_id` n'était qu'une
chaîne qui valait `"lena"` partout et aucune notion d'univers n'existait dans le
code.

Trois tensions à trancher :

1. **Où stocker chaque registre.** Un fichier central par axe
   (`UNIVERS/registry.json`, `CHARACTERS/registry.json`) est simple à lire d'un
   coup, mais devient un point de conflit au merge et une liste qui grossit.
2. **Le versionnement.** `CHARACTERS/*` est explicitement de la donnée
   personnelle, jamais versionnée (ADR-0005, `.gitignore`, hook pre-commit). Le
   registre univers, lui, ne contient que des choix d'architecture.
3. **Qui porte l'interrupteur NSFW on/off.** Il vivait dans
   `CHARACTERS/lena/config.json` (`nsfw.enabled`), alors que `config.json` est
   par ailleurs réservé aux réglages *mesurés* d'un personnage.

## Décision

**Un fichier par entité, découverte par scan de dossier — pas de fichier
registre central.**

- Univers, **versionné** : `UNIVERS/<id>/universe.json` (id, `model_family`,
  `identity`, `posing`, `output_styles`) + `UNIVERS/<id>/tools.json` (panel
  d'outils). Chargé par `AUTOMATION/universe.py` (`list_universes`,
  `load_universe`, `load_tools`, `exists`).
- Personnage, **git-ignoré** : `CHARACTERS/<id>/character.json` (id, `name`,
  `universe`, `content_types`, `nsfw`), au même régime que les
  `config/scenes/creative.json` déjà là. Chargé par `AUTOMATION/runner/prompt.py`
  (`load_character`, `character_universe`, `content_type_active`).

`shared_state.character(request)` valide, avant tout accès disque, que le
dossier contient un `character.json` lisible dont `universe` existe dans le
registre univers — sinon 400 JSON.

**L'interrupteur NSFW on/off passe dans `character.json`** (`nsfw`, `false` par
défaut). `config.json` ne garde que les réglages de workflow NSFW (`workflow`,
`steps`, `cfg`, `face_denoise`, `max_pixels`, `chainer_si`).
`nsfw_batch.is_armed()` prend désormais un `character_id` et lit le registre.

**`model_family` / `identity` / `posing` sont déclaratifs en J4** — des chaînes,
pas encore du code. Ils seront câblés à `AUTOMATION/identity/` en J5.

**`content_types` est un axe indépendant de l'univers** (§3, renvoi ADR-0004) :
`image` actif partout en V1 ; `video` / `voice` / `staging` déclarés inactifs
pour *tous* les univers, pour que V2 soit un changement de valeur, pas de schéma.

## Alternatives envisagées

- **Fichier registre central par axe** — écarté : conflit au merge dès qu'on
  onboarde deux personnages en parallèle, et pour l'axe personnage il faudrait
  soit versionner une liste de données personnelles (interdit ADR-0005), soit
  maintenir un fichier git-ignoré que rien ne régénère.
- **Table SQLite pour le registre** — écarté pour J4 : `CLAUDE.md` §7 autorise
  « fichier ou table », et un fichier relu à chaque requête se diff, se
  commente (`_notes`) et se répare à la main. La base reste la source de vérité
  pour ce qui *se mesure* (historique, scores), pas pour ces choix d'archi.
- **Laisser `nsfw.enabled` dans `config.json`, le refléter en lecture dans le
  registre** — écarté : deux sources de vérité pour un même booléen, et §7 dit
  explicitement que le registre personnage porte l'indicateur NSFW.
- **Onboarder Abyssiaelle dans J4** — écarté : `ROADMAP.md` place son
  implémentation d'identité en J5 et son `build_jobs` en J6, et interdit de
  réordonner les jalons. `rpg-personnage` en J4 est une **entrée de registre
  seule**, qui prouve que le registre généralise (famille de modèle distincte de
  celle de Léna).

## Conséquences

- Onboarder un personnage dans un univers existant (skill `nouveau-personnage`)
  = déposer un `CHARACTERS/<id>/` complet, `character.json` compris — aucun
  fichier partagé à éditer, aucun merge.
- Créer un univers (skill `nouvel-univers`) = ajouter un dossier `UNIVERS/<id>/`
  versionné — le scan le découvre, rien d'autre à enregistrer.
- Le panel d'outils du Dashboard a une source de données (`tools.json` via
  `/api/universe/tools`) avant même qu'un écran ne le consomme — l'invariant
  §8.7 (« jamais un `if character == "lena"` ») est tenable dès qu'un second
  personnage existe.
- `is_armed` prend un `character_id` : le chemin d'exécution NSFW
  (`NsfwRunner`, `editer`, `run`, `chainage_nsfw`) enfile ce paramètre, comme le
  runner SFW le fait depuis J2.
- Un `character.json` absent ou pointant vers un univers inconnu est une erreur
  remontée explicitement (400 côté web), pas un 500 ni un accès disque hasardeux.
