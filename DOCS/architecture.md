# Architecture — plateforme multi-personnage

Document de fond. Pas chargé automatiquement par Claude Code.
À lire seulement pour une tâche qui change création, packs, identité, outils ou NSFW.
Les invariants à respecter en code restent dans CLAUDE.md.

La numérotation des sections suit celle de l'ancien CLAUDE.md, pour que les
renvois internes restent valides. Les renvois à « §8 » désignent la liste des
invariants, restée dans CLAUDE.md.

## 3 · Quatre axes de création + le registre de création

La création d'un personnage se décrit par **quatre axes**, plus un axe
**transversal** — le registre de création. Le code ne doit jamais les
confondre, ni dériver l'un de l'autre autrement que par la table de
résolution (§4, ADR-0012).

| Axe | Ce qu'il décide | Qui le choisit | Mutabilité |
|---|---|---|---|
| **Type de personnage** | métier, panel d'outils (§5), empty states, taxonomie de scènes | l'humain | figé à la création |
| **Style de sortie** | rendu (réaliste / fantastique / cartoon / manga…), `prompt_add`, checkpoint à l'intérieur de la famille | l'humain | figé à la création (ADR-0006) |
| **Monde / cadre** | LoRA de monde, `prompt_add`, banque de scènes de départ, ton, peau UI | l'humain | figé à la création (§4) |
| **Pack / famille technique** | graphes de rôle, verrou d'identité, ControlNet de posing, `tools.json`, famille de modèle | **le système** | dérivé, jamais choisi à la main |

- **Type**, **style** et **monde** sont trois choix humains, figés à la
  création : en changer, c'est créer un autre personnage (§8.8).
- Le **pack** n'est pas un choix. Il se résout depuis `(type, style)` par
  `universe.resolve()`, lu dans `UNIVERS/resolution.json` (table de
  données, ni `if` ni dictionnaire en dur). Aucune règle applicable →
  erreur explicite, **jamais de repli silencieux sur un pack par défaut**
  (ADR-0012).
- Le monde ne choisit **ni** la famille de modèle **ni** le mécanisme
  d'identité ; ses assets doivent être compatibles avec le pack déjà
  résolu par `(type, style)`. C'est pourquoi le monde est le troisième
  choix, pas le premier.
- Le mot « univers » portait ces notions ensemble. La clé
  `character.json` / `universe` **reste** et désigne désormais le pack
  résolu ; `universe.json` gagne un champ `types` — une **liste dès le
  premier jour**, même si la relation reste 1-1 en V1.
- Le **wizard « nouveau personnage »** (`create_character`, écran
  `#wizard`) est le seul à écrire une fiche : il résout le pack, stampe
  `config.json` aux défauts du pack (`UNIVERS/<pack>/character_defaults.json`),
  amorce la banque depuis le monde, et n'édite jamais un des trois axes
  figés. Les valeurs mesurées du personnage remplacent ensuite les défauts
  dans Réglages (`measured: false` tant que ce n'est pas fait). Cet écran
  demandera une **route d'écriture conçue pour `identity` et le retrait du
  marqueur** : l'ancienne `POST /api/config`, supprimée le 30/08/2026 faute
  d'appelant, ne couvrait ni l'un ni l'autre — ne pas la ressusciter.
- **Registre de création** : types de contenu actifs pour un personnage
  (image / vidéo / voix / mise en scène à plusieurs). Axe **transversal**,
  orthogonal aux quatre autres et **commun** à tous les packs — pas une
  caractéristique propre à un pack en particulier (ADR-0004, inchangé). En
  V1, seul `image` est actif partout ; `vidéo` et `voix` existent comme
  types déclarés mais inactifs, pour tous les types de personnage, afin que
  les activer plus tard (V2, voir `ROADMAP.md`) soit un changement de
  valeur, pas une modification de schéma

## 4 · Le verrou d'identité appartient au pack, pas au personnage

Léna et Abyssiaelle relèvent de deux packs différents, aux familles de
modèle différentes (Flux + PuLID pour le pack servant
`instagram-influenceur`, SDXL/Pony + LoRA pour celui servant
`rpg-personnage`) — c'est le **pack** qui porte ce choix, résolu depuis
`(type, style)` (§3), pas chaque personnage. Détail des modèles/nœuds par
pack : `workflow-comfyui/references/modeles-par-univers.md`.

Conséquence : le « verrou d'identité » est une **interface choisie par le
pack** (`AUTOMATION/identity/`), pas une fonction par personnage. Tous les
personnages d'un même pack partagent la même implémentation
(`pulid_flux.py`, `lora_sdxl.py`…) ; `identity.apply()` injecte des valeurs
dans le graphe au lancement, il ne réécrit jamais de JSON (§8.1). Même
logique pour le posing : outil global (§5), mais modèle ControlNet
dépendant de la famille technique du pack.

### Trois étages de spécialisation — un seul graphe de rôle

Un même graphe de rôle sert les trois personnages d'un pack, quels que
soient leur style, leur monde et leurs mesures. Ce qui varie, et où :

| Ce qui varie | Porté par | Édité depuis |
|---|---|---|
| **Topologie** — nœuds, chaîne, verrou, ControlNet, ordre des étages | le pack (`universe.json` / `workflow`) | l'auteur du pack |
| **Assets de style et de monde** — LoRA, `prompt_add`, checkpoint compatible | l'entrée `output_styles` du pack, l'entrée `WORLDS/<id>` | Réglages d'univers |
| **Valeurs mesurées du personnage** — base gelée, LoRA perso + mot déclencheur, poids du verrou, seuils | `character.json` / `config.json` | le studio (création, puis Réglages) |

Il n'existe jamais un fichier de graphe par personnage (§8.11) : le wizard
attache `config.json` / `workflow` au graphe du pack, il n'en génère aucun.
La base gelée est fournie ou générée à la création (le portrait généré passe
par le graphe du pack, **verrou bypassé** — aucune référence n'existe
encore), puis ne change plus. Un personnage qui rend mal se règle par la
mesure, pas par un graphe parallèle.

### La mesure reste par personnage (leçon J6)

Le pack donne une topologie et une implémentation d'identité ; il ne donne
pas de poids. Abyssiaelle l'a prouvé : le mécanisme d'identité de son pack
(IPAdapter FaceID) **dégradait** son identité — le poids a été mesuré à 0.0
et c'est son LoRA de personnage qui la porte. Ce n'est pas une règle de
pack, c'est une mesure par personnage ; un autre personnage du même pack
peut très bien mesurer un poids non nul. Reste commune la couche de
*mesure* (scoring InsightFace, `qc_identity.py`), indépendante de la
méthode qui a généré le visage.

## 5 · Univers : le panel d'outils dépend du monde du personnage

C'est l'utilisateur qui crée lui-même ses scènes et intentions depuis le
Dashboard — l'outillage disponible change selon l'univers du personnage
(Léna → `instagram-influenceur`, outils lifestyle/Instagram ; Abyssiaelle →
`rpg-personnage`, outils orientés monde/lore). L'utilisateur peut ajouter
des outils à un univers via le paramétrage — le panel n'est pas figé à ce
qui existe au lancement. Structure et exemple : skill `nouvel-univers`
(`UNIVERS/<nom>/tools.json` + `CHARACTERS/<nom>/config.json` référençant
son univers).

- Un **outil** est un module autonome (route(s) backend + écran/composant
  frontend) qui déclare pour quel(s) univers il est pertinent — s'enregistre
  dans `tools.json`, ne modifie jamais le Dashboard au cas par cas
- Pas de chargeur de plugins dynamique pour la V1 — un registre déclaratif
  suffit tant qu'un seul développeur ajoute les outils
- Les outils peuvent servir à plusieurs univers (édition d'image,
  modification live par IA, posing sont **globaux**, pas propres à un
  univers) — seule l'isolation des données compte, pas le code
- La banque de scènes reste un outil parmi d'autres, pas LE mécanisme
  central. `compose.py` en est un exemple pour Léna
- Invariant : **une référence de scène sert à la composition, jamais à
  l'identité** — le visage vient toujours du verrou d'identité (§4)

## 6 · NSFW : composition d'outils existants, pas une branche à part

Le flux est le même quel que soit l'univers, et ne demande **aucun
sous-système dédié** :

1. Génération du personnage (pipeline normal de son univers, §4)
2. Sélection manuelle de l'image par l'utilisateur — jamais automatique
3. Reprise en NSFW via l'outil de modification live par IA (édition par
   prompt sur le résultat)
4. Retouche si nécessaire via l'éditeur d'image

Ces deux outils (modification live par IA, éditeur d'image) sont déjà des
outils globaux (§5) — le NSFW n'ajoute pas d'outil, il en réutilise deux
dans un ordre précis.

- Réglage dans le paramétrage de l'app, **off par défaut** — un personnage
  nouvellement créé n'a jamais le NSFW actif tant que l'utilisateur ne l'a
  pas explicitement activé. Précisé en J7 : le *geste* vit à un seul
  endroit, la section « Contenu adulte » de l'écran Application ; ce qu'il
  écrit est l'interrupteur **du personnage courant** (`character.json` /
  `nsfw`, ADR-0010). Pas d'interrupteur global — il n'y a rien qui vaille
  pour tous les personnages à la fois. Jamais de porte d'armement dans le
  flux de production
- L'outil de modification live par IA est un **graphe de pack**
  (`universe.json` / `edit_workflow`, nullable) : son étage d'identité est
  lié à la famille de modèle, comme le verrou (§4). Le cran d'édition n'est
  proposé que si le personnage est armé **et** que son pack déclare ce
  graphe — sinon il est **absent**, jamais grisé, et l'interface dit
  pourquoi (ADR-0013)
- La vidéo NSFW suit la même logique une fois la vidéo SFW disponible (V2,
  voir `ROADMAP.md`) — pas de conception anticipée avant que la vidéo SFW
  existe

## 7 · Registre de personnages et base de données

- Un registre explicite (fichier ou table) : id, nom, univers associé
  (§3-4), type(s) de contenu actifs (registre de création, §3), indicateur
  NSFW (off par défaut, §6), chemin `CHARACTERS/<nom>/`
- **Une seule base SQLite**, schéma commun, colonne `character_id` — jamais
  une base par personnage
- La base doit être source de vérité **avant** la bascule multi-personnage
  (J0, `ROADMAP.md`) — pas après


## 9 · Frontend

- Modules ES dès la conversion, pas de globales partagées entre fichiers
- Design system minimal commun (cartes, layout, panneaux de réglages)
- Sélecteur de personnage : state React — changer de personnage ne
  recharge plus la page ; `?character=` ne fait que synchroniser l'URL

## 10 · Explicitement hors scope pour ce chantier

- Le pipeline audio/vidéo lui-même (les types sont déclarés en V1, §3, mais
  pas branchés — voir `ROADMAP.md`, V2)
- Mise en scène de plusieurs personnages ensemble (plusieurs verrous
  d'identité simultanés) — V2
- Univers "art pur" et univers "monde RPG" complet — V2 et V3
- Un chargeur de plugins dynamique / marketplace d'outils — le registre
  déclaratif simple (§5) suffit tant qu'un seul développeur ajoute les
  outils
- **Exposition MCP** des actions de la plateforme — hors scope V1/V2 (V3,
  `ROADMAP.md`). Un serveur MCP existe déjà (`AUTOMATION/
  mcp_server.py`, JSON-RPC sur stdio) : **lecture et validation seulement,
  aucune génération, rien de la branche NSFW exposé, jamais d'écriture**.
  Ce n'est pas un chantier à démarrer de zéro en V3 — c'est un principe déjà
  posé (§8.10) à généraliser au reste de la plateforme, pas à réinventer
- **L'éditeur de graphe d'univers est une surface séparée** (`web/graph/`),
  jamais un module du cockpit. `wf_check` reste la porte unique de toute
  écriture d'un graphe, humaine ou agentique. Lever ADR-0007 (MCP lecture
  seule) exige une ADR dédiée
- Un 3ᵉ personnage — le chantier se valide avec deux

