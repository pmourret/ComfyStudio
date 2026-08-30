# Flux d’usage global — Soulglade

Document de cadrage produit. Ce n’est pas `CLAUDE.md` (règles) ni `ROADMAP.md` (jalons) : c’est ce que l’humain *fait* dans le studio.

Lecture unique : objets du studio. Les graphes ComfyUI restent en coulisse.

- Un personnage n’est pas un workflow.
- Une famille technique possède un **pack** de graphes de rôle.
- Deux modes seulement : **Studio** (gérer, produire, juger) et **Éditeur** (ce qui est ouvert).
- « Avancé » n’est pas un écran cible.

---

## Carte mentale

```mermaid
flowchart TB
  ON["Onboarding"] --> Q{"Personnage existant ?"}
  Q -->|Oui| ST["Studio"]
  Q -->|Non| WIZ["Wizard : type → style → monde"]
  WIZ --> BASE["Base visage fournie ou générée, puis gelée"]
  BASE --> FICHE["Fiche personnage"]
  FICHE --> ST

  ST --> P["Produire"]
  ST --> J["Juger"]
  ST --> E["Éditer"]
  P --> GPU["File GPU / santé Comfy"]
  J --> GPU
  E --> GPU

  ST -.->|plus tard| PACK["Ouvrir le pack d'univers"]
```

---

## 1. Entrée

L’app s’ouvre sur un **sas**, pas sur l’écran de production d’un personnage par défaut.

```mermaid
flowchart TD
  START["Ouverture de l'app"] --> LIST{"Des personnages existent ?"}
  LIST -->|Oui| PICK["Liste : nom, type, monde, dernière prod, santé du verrou"]
  PICK --> CHOIX{"Action"}
  CHOIX -->|Choisir un perso| STUDIO["Entrer dans le Studio"]
  CHOIX -->|Nouveau| WIZ["Wizard Nouveau personnage"]
  LIST -->|Non| WIZ
```

Dès qu’un personnage est chargé, le chrome affiche :

| Zone | Contenu |
|---|---|
| Identité | Personnage actif |
| Contexte | Type + monde |
| Système | Comfy joignable ou non |
| Travail | File de jobs |
| Vérité | Dernière erreur, message actionnable |

Sans ce chrome, on n’est pas dans le studio.

---

## 2. Naissance d’un personnage

L’humain choisit une intention. La famille technique se **résout** en coulisse (table déclarative, pas un `if` personnage). Aucune étape « attribuer un workflow ».

```mermaid
flowchart TD
  NEW["Nouveau personnage"] --> TYPE["Type : influenceur / perso RPG / plus tard art pur"]
  TYPE --> STYLE["Style de sortie : réaliste, fantastique, cartoon, manga…"]
  STYLE --> WORLD["Monde / cadre : post-apo, slow-life, cosplay…"]
  WORLD -.->|suggéré par le style, pas imposé| WORLD
  WORLD --> RESOLVE["Système : résoudre le pack famille technique + outils + graphes de rôle"]
  RESOLVE --> REF{"Image de référence ?"}
```

Le style de sortie est **figé** à la création. En changer = créer un autre personnage.

Le monde est un cadre narratif (banque, ton, peau). Il ne choisit pas le checkpoint.

### Base visage

Toujours un **choix humain**. Jamais de gel automatique.

```mermaid
flowchart TD
  REF{"Image de référence ?"} -->|Oui| CHK["Contrôle : personnage fictif, pas une photo d'identité réelle"]
  CHK --> COH["Cohérence avec le style choisi"]
  COH --> GEL

  REF -->|Non| PR["Prompt utilisateur enrichi : type + style + monde"]
  PR --> GEN["Générer quelques propositions"]
  GEN --> PICK["L'utilisateur en choisit une"]
  PICK --> GEL["Base gelée"]

  GEL --> WRITE["Écrire character.json + CHARACTERS/id/"]
  WRITE --> FLAGS["NSFW off · registre de création : image on"]
  FLAGS --> STUDIO["Studio, ce personnage chargé"]
```

Mesure du verrou d’identité (poids LoRA / PuLID, seuils) :

- **V1 honnête** — défauts du pack, recalibrage plus tard dans Réglages.
- **V1 complète** — première série de tests dans le wizard (plus long, GPU).

Leçon déjà apprise : la mesure est **par personnage**. Le mécanisme du pack peut dégrader l’identité ; on ne « répare » pas ça en créant un graphe parallèle.

---

## 3. Journée type dans le Studio

Une fois un personnage chargé, le quotidien est une boucle courte. On peut juger pendant qu’un job tourne.

```mermaid
flowchart LR
  B["Banque : scènes et intentions"] --> PR["Production : lancer un job du pack"]
  PR --> WAIT["Attente : file visible"]
  WAIT --> RV["Revue : valider / rejeter / décliner / exporter"]
  RV --> B
  RV --> PR
```

Règle d’or : une **référence de scène sert à la composition, jamais à l’identité**. Le visage vient du verrou du pack, paramétré par le personnage.

### Carte du Studio

```mermaid
flowchart TB
  CHROME["Chrome : perso · type/monde · Comfy · file · erreur"]

  CHROME --> ST["Mode Studio"]
  CHROME --> ED["Mode Éditeur"]

  ST --> PERS["Personnages"]
  ST --> BANQUE["Banque / scènes"]
  ST --> PROD["Production / file"]
  ST --> REVUE["Revue / tri"]
  ST --> REGL["Réglages"]

  ED --> IMG["Objet ouvert : image"]
  ED --> SCENE["Objet ouvert : scène"]
  ED --> GRAPH["Objet ouvert : graphe de pack — plus tard"]
```

Les outils du panel viennent du `tools.json` de la famille, jamais d’un `if character == "…"`.

| Portée | Exemples |
|---|---|
| Globaux | Édition d’image, modification live par IA, posing |
| Métier | Outils lifestyle influenceur, lore RPG, etc. |

Changer de personnage est un geste du chrome. Banques, production et exports restent isolés par `character_id`.

---

## 4. Mode Éditeur

On n’entre pas dans un fourre-tout. On **ouvre un objet**. Fermer l’éditeur ramène au Studio, même personnage, même file.

```mermaid
flowchart LR
  OBJ{"Objet ouvert"} -->|Image de la revue| PHOTO["Éditeur photo"]
  OBJ -->|Génération à reprendre| LIVE["Modification live par prompt"]
  OBJ -->|Scène| COMP["Composeur de scène"]
  OBJ -->|Pack de la famille| PACK["Éditeur de graphe + wf_check — plus tard"]
  PHOTO --> BACK["Retour Studio"]
  LIVE --> BACK
  COMP --> BACK
  PACK --> BACK
```

Le runner **lit** le graphe au lancement. Il ne l’écrit pas pendant un job.

---

## 5. NSFW — une branche, pas un monde

Réglage **off par défaut** à la création. Armement explicite, visible, réversible. Pas d’onglet parallèle, pas de génération NSFW automatique, pas d’entrée dans le wizard.

```mermaid
flowchart TD
  SFW["Image SFW existante"] --> SEL["L'utilisateur la sélectionne"]
  SEL --> ARM{"Personnage NSFW armé ?"}
  ARM -->|Non| STOP["Refus explicite dans l'UI"]
  ARM -->|Oui| LIVE["Outil de modification live"]
  LIVE --> RET["Retouche éventuelle"]
  RET --> REV["Retour Revue"]
```

Même flux plus tard pour la vidéo, une fois la vidéo SFW branchée.

---

## 6. Coulisses — ce que l’utilisateur ne gère pas

```mermaid
flowchart LR
  subgraph Humain
    T["Type"] --> S["Style"] --> M["Monde"]
  end

  subgraph Système
    R["Table de résolution"] --> F["Famille technique"]
    F --> PACK["Pack : graphes de rôle + identity + tools.json"]
    PACK --> RUN["execute_jobs lit le graphe, injecte les valeurs du perso"]
  end

  M --> R
```

Invisible dans le parcours quotidien :

- quel fichier `*_prod_ui.json` tourne ;
- `ui_to_api`, titres de nœuds ;
- la résolution vers Flux ou SDXL ;
- SQLite.

Visible en petit, pour le debug seulement : `machine : Flux · verrou visage`. Ce n’est pas un cran du wizard.

---

## 7. Extensions sans casser le flux

```mermaid
flowchart TB
  NOW["V1 : image, un perso chargé, pack figé par la famille"]
  NOW --> VID["Registre de création : activer vidéo / voix"]
  NOW --> MULTI["Éditeur de scène : plusieurs verrous d'identité"]
  NOW --> EDIT["Réglages d'univers : éditer le pack — overlay + wf_check"]
  NOW --> RPG["Monde RPG complet : mini-app à part, pas un onglet du cockpit"]
```

Éditer un pack (humain, puis assistant MCP / Qwen) est une action de **Réglages d’univers**, jamais une étape de naissance du personnage. Tant qu’un ADR n’a pas levé l’invariant : MCP = lecture et validation seulement.

---

## Phrase de nord

On crée un être (type, style, monde, visage choisi), on le charge, on compose, on fait tourner la machine de son pack, on juge, on édite l’objet ouvert — et on recommence, sans jamais penser à un workflow.
