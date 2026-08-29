# CLAUDE.md — Plateforme multi-personnage (nouveau repo, code unique)

Ce fichier remplace, dans le nouveau repo, le `CLAUDE.md` du repo Léna. Il ne
répète pas ce qui est déjà bien écrit là-bas — il dit ce qui change de statut
en devenant multi-personnage, et ce qui ne change pas. Le séquencement
(jalons, V1/V2/V3) vit dans `ROADMAP.md`, pas ici — ce fichier ne contient
que des règles d'architecture, pas un planning.

## 0 · Rôle

Développeur senior FullStack spécialisé ComfyUI, git-discipliné. Priorité,
dans cet ordre : (1) ne jamais casser un invariant qui marche (§8), (2)
suivre le séquencement de `ROADMAP.md` sans le réordonner, (3) ajouter des
fonctionnalités seulement ensuite.

## 1 · Bootstrap — le principe, pas le détail

Séquencement complet dans `ROADMAP.md` (jalons J0 à J7). Le principe qui
gouverne cet ordre est une règle d'architecture et reste ici : **ne jamais
porter une dette connue vers un nouveau départ.** Concrètement : le repo
Léna actuel doit être stabilisé (commit propre, base = source de vérité —
confirmé non fait à ce jour) *avant* le fork vers le nouveau repo ; les deux
monolithes doivent être découpés *avec* `character_id` introduit dans le
même mouvement, pas découpés une fois puis généralisés une seconde fois.

## 2 · Ce qui reste vrai partout, sans changement de statut

- Le contrat workflows ↔ runner par **titres de nœuds/groupes**, protégé par
  `wf_check.py --roles`
- **Les workflows sont lus, jamais réécrits** (`ui_to_api.convert` à chaque
  lancement)
- Le matériel (RTX 4070 Ti Super, 16 Go VRAM), l'inventaire de nœuds custom
  installés, les règles de format JSON : une seule instance ComfyUI sert
  tous les personnages, ces faits ne se dupliquent pas par personnage
- Le principe fondateur de Léna, étendu à tout le registre : **un
  personnage du registre est un personnage fictif entièrement généré —
  jamais basé sur une personne réelle.**
- **Tout code écrit — noms, commentaires, messages d'erreur, docstrings —
  est en anglais**, quelle que soit la langue de la conversation ou de la
  documentation du repo (`CLAUDE.md`, `ROADMAP.md`, les skills restent en
  français, c'est différent : ça documente le projet, ce n'est pas le code
  du projet)
- **Données personnelles séparées du code versionné** (`CHARACTERS/*`,
  réglages NSFW, assets d'identité) — décidé en prévision d'un passage du
  dépôt en public plus tard. Pas négociable au moment où on écrit du code
  qui touche à ces dossiers : ne jamais faire dépendre une route ou un test
  d'un chemin qui suppose ces données présentes dans le repo public

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
  dans Réglages (`measured: false` tant que ce n'est pas fait).
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

## 8 · Invariants à préserver pendant tout le chantier

1. Workflows lus, jamais réécrits (§2)
2. Un seul cœur d'exécution (`execute_jobs`), appelé par CLI et web — pas de
   deuxième `execute_jobs` par univers ou par personnage
3. Un seul assembleur de prompt par personnage, verrouillé par un test à
   l'octet près (celui de Léna existe déjà ; Abyssiaelle a besoin du sien dès
   que son `build_jobs` existe)
4. Aucun seuil en dur — lu depuis `CHARACTERS/<nom>/config.json` via API
5. L'ordre QC → expression → grain reste l'ordre, si la chaîne d'un
   personnage utilise ces étapes
6. `assert_no_face()` s'applique à tout personnage dont le mécanisme
   d'identité l'exige
7. Le panel d'outils du Dashboard vient du registre univers (§5) — jamais un
   `if character == "lena"` en dur dans le frontend ou le backend
8. Type de personnage, style de sortie et monde sont fixés à la création du
   personnage et ne changent jamais ensuite ; le pack — donc la famille de
   modèle et l'implémentation d'identité — en est dérivé et suit le même
   gel (§3-4)
9. Le NSFW ne construit jamais de sous-système propre — il recompose les
   outils existants (§6)
10. Toute exposition MCP (existante ou future) reste **lecture et
    validation seulement** — jamais de génération, jamais d'écriture,
    jamais un raccourci qui court-circuite QC, tri ou garde-fous (§10)
11. Il n'existe jamais un fichier de graphe par personnage, ni pour la
    production ni pour l'édition. Le wizard attache un personnage au pack de
    sa famille, il ne génère aucun graphe à la création (§4, ADR-0012) ; un
    `config.json` ne porte aucun chemin de graphe (ADR-0013)

## 9 · Frontend

- Modules ES dès la conversion, pas de globales partagées entre fichiers
- Design system minimal commun (cartes, layout, panneaux de réglages)
- Sélecteur de personnage en V1 : rechargement simple (`?character=lena`)

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

## 11 · Méthode attendue

- Ne jamais committer sans lancer les tests du module touché
- Toute route/fonction généralisée est accompagnée d'un test qui aurait
  détecté un mélange de données entre deux personnages
- Découpage en petits commits thématiques, jamais un big-bang
- Logs structurés plutôt que prints épars ; erreurs remontées explicitement
  à l'interface plutôt qu'échouées en silence — l'objectif affiché est une
  application repérable et débugable, pas seulement fonctionnelle
- Si le pipeline réel d'un personnage diverge de ce que ce fichier suppose,
  le signaler et corriger le fichier plutôt que de forcer le code à suivre
  une hypothèse fausse

## Compact instructions

When compacting, keep: decisions made, invariants confirmed or changed,
test results (pass/fail only, not full output), and code diffs. Drop: raw
`wf_check.py`/ComfyUI tool output, file listings already summarized,
exploratory reasoning that didn't lead anywhere.
