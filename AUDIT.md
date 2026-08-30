# AUDIT — état de l'existant avant migration FastAPI + React

**Date :** 30/08/2026 · **Branche :** `rename/soulglade` · **Réf. dépôt :** `e9e0e96`

Document d'inventaire, **sans plan de migration** : il décrit ce qui existe
aujourd'hui, pour que le plan se construise sur des faits. Aucun code n'a été
modifié.

Volume concerné : **~5 400 lignes de Python web** (`AUTOMATION/web/`) +
**~4 900 lignes de JS** + **~1 400 lignes de CSS** + **670 lignes de HTML**
(`AUTOMATION/web/static/`). Le cœur métier (`AUTOMATION/runner/`,
`identity/`, `base.py`, `nsfw_batch.py`…) est **hors périmètre** de la
migration : il ne connaît ni HTTP ni le DOM.

---

## 0 · Correction préalable : la stack documentée n'est pas la stack réelle

[.claude/rules/backend.md](.claude/rules/backend.md) annonce **Flask**. Le
serveur réel est **aiohttp** ([AUTOMATION/web/app.py](AUTOMATION/web/app.py#L47)),
choisi parce qu'il est déjà fourni par l'installation ComfyUI — le dépôt n'a
**aucune dépendance à installer**. C'est un fait structurant : FastAPI +
uvicorn/starlette seraient les **premières dépendances tierces** du projet, et
le runtime Python utilisé est l'interpréteur embarqué de ComfyUI
(`python_embeded`, cf. [.env.example](.env.example)).

À corriger dans `backend.md` quel que soit le résultat de la migration.

---

## 1 · Routes / endpoints actuels

### 1.1 Architecture de service

- **Serveur :** `aiohttp.web.Application`, un seul process, `127.0.0.1:8189`
  par défaut ([app.py:110](AUTOMATION/web/app.py#L110)).
- **Assemblage :** `app.py` ne fait qu'enregistrer 5 `RouteTableDef` et
  démarrer. Une responsabilité par module de `routes/`.
- **Middlewares** (2, dans cet ordre) — [shared_state.py](AUTOMATION/web/shared_state.py) :
  - `garde_erreurs` : toute exception ressort **en JSON**, jamais en HTML.
    `HTTPException` passe telle quelle ; `JSONDecodeError` → 400 ;
    `KeyError/ValueError/TypeError` → 400 ; le reste → 500 `{ok:false, erreur}`.
  - `garde_origine` : **substitut d'authentification** (il n'y en a aucune).
    Sur les méthodes non-GET seulement : `Host` doit être local (anti DNS
    rebinding), `Origin` si présente doit être locale, `Content-Type` **doit**
    être `application/json` — ce dernier point interdit la « requête simple »
    CORS et force un preflight auquel le serveur ne répond pas.
    `--host 0.0.0.0` lève les deux premiers verrous (mode « valider depuis le
    téléphone », signalé au démarrage).
- **`client_max_size = 28 Mo`** : les uploads passent en **JSON + base64**,
  jamais en `multipart/form-data` — c'est délibéré, multipart est un
  Content-Type « simple » qui contournerait `garde_origine`.
- **Statique :** `web.static("/static", …)` monté dans `app.py`.
- **Cycle de vie au démarrage :** `reclaim_port()` tue un tableau de bord
  fantôme sur le même port (jamais ComfyUI, jamais un tiers), puis
  `comfy_server.ensure()`, puis `purger_vignettes()`.

### 1.2 Inventaire — 43 routes

**Convention transverse :** presque toute route lit `?character=<id>` via
`ss.character(request)`, qui **valide** avant tout accès disque (§5.2).

#### `routes/etat.py` — état, config, registres, cycle de vie (22 routes)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/` | sert `static/index.html` (SPA à un seul document) |
| GET | `/api/state` | `STATE` + `counts` (buckets SFW) + `nsfw_counts` + `eta` + `undo`. **Sondé toutes les 1,5 s par le front.** |
| GET | `/api/config` | `config.json` du personnage (seuils QC, preset, formats, export) |
| GET | `/api/character` | fiche du personnage courant : `id, name, type, world, output_style, universe{id,label,model_family,output_styles}, content_types, nsfw, base{name,present}, nsfw_tool` |
| GET | `/api/characters` | registre : liste pour le sas d'entrée. Une fiche illisible est ignorée, jamais fatale |
| GET | `/api/wizard/options` | `types[]` avec styles du pack et mondes compatibles de la famille |
| POST | `/api/characters` | crée un personnage (`lb.create_character`), rollback si invalide |
| POST | `/api/characters/base/upload` | dépose la base d'identité **fournie** dans `ComfyUI/input/` (base64) |
| POST | `/api/characters/base/generate` | met N portraits de base en file — **verrou d'identité bypassé** |
| POST | `/api/characters/base/candidates` | état des portraits en cours (`pending`/`ready`/`error`) |
| GET | `/api/characters/base/image` | octets d'un candidat (`ComfyUI/output/`, chemin borné) |
| POST | `/api/characters/base/freeze` | gèle le candidat → `ComfyUI/input/<CID>_BASE.<ext>` |
| GET | `/api/universe/tools` | `tools.json` du pack — alimente le rail d'outils |
| GET | `/api/journal` | 300 dernières lignes du CSV de production, **filtrées** sur le personnage, ordre inverse |
| GET | `/api/nsfw/state` | `armed`, `outil{available,reason}`, `nom`, `sortie`, `counts` NSFW, `sources[]` (120 max) |
| POST | `/api/app/stop` | `os._exit(0)` après réponse |
| POST | `/api/app/restart` | `os.execv` — même PID, code relu à froid |
| POST | `/api/app/comfy/stop` | arrêt explicite de ComfyUI (409 s'il ne tournait pas) |
| GET | `/api/app/comfy/stats` | RAM/VRAM/thermique. Cache 1,5 s + `asyncio.Lock`, sondes en thread |
| POST | `/api/app/comfy/unload` | décharge la VRAM. **409 pendant un batch** |
| POST | `/api/app/comfy/restart` | cycle stop→ensure, fire-and-forget |

#### `routes/banque.py` — banque de scènes, taxonomie, composeur (4 routes)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/scenes` | `{data, categories, scene_ids, previews, meta, stats, avg_duration, poses}` — le serveur calcule `meta` (intention/band/tags/tones/pose) pour que le front n'ait pas à réimplémenter les défauts du runner |
| POST | `/api/scenes` | écrit `scenes.json` après **`valider_banque()`** : champs racine, ids uniques, prompts non vides, formats connus, `intensity`, `wardrobe`, existence du squelette de pose, **+ garde anti-effacement en lot** (≥2 scènes perdant une clé du parcours créatif → refus). Rotation `.bak` sur 3 générations |
| GET | `/api/creative` | intentions, tons, **paliers d'intensité filtrés** : un palier `requires:"armed"` non disponible **n'est pas émis** (absent, jamais grisé — ADR-0003) |
| POST | `/api/compose` | intention en français → scènes proposées (LLM local via ComfyUI), ids dédoublonnés |

#### `routes/vignettes.py` — octets d'image (4 routes)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/img` | octets d'une image de tri. **`character=` obligatoire** (`requis=True`) — seule route à l'exiger. Params : `bucket, space, name, thumb, v`. Vignette 420×560 générée à la demande, sémaphore de 4, double-check sous verrou |
| GET | `/img/pose` | squelette de `INPUTS/POSE/` (dossier plat, pas de bucket) |
| POST | `/api/pose/extract` | photo base64 → squelette OpenPose. **Seul point d'entrée où une photo réelle de tiers peut arriver** ; elle n'est jamais persistée |
| POST | `/api/pose/delete` | retire un squelette |

#### `routes/production.py` — lancement (6 routes)

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/api/plan` | **dry-run** : `{total, jobs[], apercu{fragments,echos}, alertes}`. Rejoué à chaque frappe (debounce côté front) |
| POST | `/api/run` | lance un batch. **Deux modes sur un seul point d'entrée** : génération, ou **édition** d'images déjà validées (`mode_edition`) |
| POST | `/api/decline` | boucle courte depuis une image produite. `dry:true` → ce que chaque mode donnerait ; sinon lance. Modes : `lumiere, ton, seeds, intensite, editer` |
| POST | `/api/stop` | arme `STATE["stop"]` (409 si rien ne tourne) |
| GET | `/api/nsfw/instructions` | préambule **réel** du graphe + historique d'instructions trié par identité moyenne obtenue |
| POST | `/api/nsfw/arm` | arme/désarme le NSFW **du personnage** dans `character.json`. Exige `confirm == "ARMER"` |

Gardes serveur notables : `guard_intensity()` (confirmation, armement,
instruction obligatoire, QC non désactivable au palier d'édition),
`entier()` (bornes serveur — les `max` HTML ne valent rien),
`NSFW_SURCHARGEABLES` (liste blanche + bornes), `appliquer_export()`
(coupe l'export quand le palier ne s'exporte pas), `sources_valides()`
(re-vérifie sur le disque).

#### `routes/tri.py` — revue, QC, jugement (7 routes)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/gallery` | contenu d'un bucket : 200 items max + `sans_mesure` (compté sur **tout** le dossier), `references`, `bandes` d'étalonnage, `juges` |
| POST | `/api/action` | tri : `valider/revoir/rejeter/archiver`. Déplace le fichier, gère les homonymes (`nom_libre`), oublie la vignette, exporte ou dé-exporte, écrit en base, empile dans `UNDO` |
| POST | `/api/undo` | annule le dernier tri **de ce personnage** (pile unique, lecture scopée) |
| POST | `/api/delete` | suppression **définitive** (hors `UNDO`) ; journal/mesures/base conservés à dessein |
| POST | `/api/flag` | jugement humain de réalisme (`ok`/`ia`), indépendant du tri |
| POST | `/api/mesurer` | rattrape les mesures manquantes **par paquets** (≤40) ; le front rappelle tant que `restant > 0`. 409 pendant un batch |
| POST | `/api/edit/save` | enregistre une retouche navigateur. Par défaut **copie** `<nom>_edit` ; `remplacer:true` écrase la source (démesure, refait l'export, oublie la vignette) |

### 1.3 Ce qui n'existe pas

- **Aucun WebSocket, aucun SSE, aucun long-polling.** Le suivi de production
  est un **polling REST à 1,5 s** sur `/api/state`.
- **Aucune authentification**, aucune session, aucun cookie.
- **Aucun schéma d'API déclaré** (pas d'OpenAPI, pas de Pydantic) : le contrat
  vit dans les docstrings et dans le code JS qui le consomme.
- **Aucune pagination** : `/api/gallery` tronque à 200, `/api/journal` à 300.

---

## 2 · Appels sortants vers ComfyUI

Tous en **HTTP synchrone via `urllib.request`**, poussés dans un
`run_in_executor` quand ils partent d'un handler async. Règle absolue :
[shared_state.py](AUTOMATION/web/shared_state.py#L502) documente un gel de
boucle d'événements de 2005 ms causé par une sonde bloquante.

### 2.1 Endpoints ComfyUI consommés

| Endpoint ComfyUI | Appelant | Rôle |
|---|---|---|
| `POST /prompt` | [runner/comfy.py](AUTOMATION/runner/comfy.py#L35) `queue_prompt()` | met un graphe API en file, rend `prompt_id` |
| `GET /history/<prompt_id>` | [runner/comfy.py](AUTOMATION/runner/comfy.py#L47) `wait_prompt()` | **polling toutes les 2 s**, timeout 900 s. Extrait `outputs[].images` (`type == "output"`) et `status.messages[execution_error]` |
| `GET /object_info` | [ui_to_api.py](AUTOMATION/ui_to_api.py#L18) `fetch_object_info()` | schéma des nœuds, requis par la conversion UI→API. Timeout 60 s |
| `GET /system_stats` | `comfy_server.is_up()`, `comfy_server._system_stats()`, `shared_state._probe_comfy()`, `mcp_server` | sonde de vie + RAM/VRAM |
| `POST /free` | [comfy_server.py](AUTOMATION/comfy_server.py#L150) `unload()` | décharge modèles et VRAM |

**Aucun usage du WebSocket ComfyUI** (`/ws`), ni de `/view`, `/upload/image`,
`/queue`, `/interrupt`. Conséquences directes :

- La **progression intra-job** n'existe pas : on connaît `index/total` de
  batch, jamais l'avancement en pas d'échantillonnage d'une image.
- Les **images ne transitent pas par HTTP** : ComfyUI écrit dans son
  `output/`, le runner **déplace les fichiers** sur le disque
  (`runner/sortie.py`). Les entrées (base gelée, squelette de pose, source
  d'édition) sont **copiées dans `ComfyUI/input/`** parce que `LoadImage` ne
  lit que ce dossier.
- `ensure()` / `stop()` de ComfyUI passent par `subprocess` + `psutil`
  (identification par ligne de commande), plus `nvidia-smi` pour la
  thermique — **dégradation silencieuse assumée** si absent.

### 2.2 Upload de workflow : il n'y en a pas

**Invariant §2 / §8.1 : les workflows sont lus, jamais réécrits.** Le fichier
`WORKFLOWS/**/*_ui.json` (format UI ComfyUI) est chargé depuis le disque et
converti en format API **à chaque lancement** par
[`ui_to_api.convert()`](AUTOMATION/ui_to_api.py) — aucune copie n'est
maintenue, rien n'est posté vers ComfyUI en dehors du graphe converti.

Le graphe est ensuite piloté par **résolution de rôles par titres de nœuds**
([runner/comfy.py](AUTOMATION/runner/comfy.py#L112) `_roles()`) :
`"POSITIF - scene"`, `"Format -"`, `"passe 1"`, `"SORTIE production"`,
`"SQUELETTE DE POSE"`, groupes `"FACEDETAILER"`, `"GRAIN + EXPORT"`,
`"UPSCALE IMAGE 2K"`, `"IDENTITE"`. Les rôles obligatoires varient par
**famille de modèle** (`ROLES_LATENT_PAR_FAMILLE`, `ROLES_GUIDANCE_PAR_FAMILLE`) ;
un rôle absent rend `None` et le runner s'adapte. `wf_check.py --roles`
protège ce contrat.

### 2.3 Autres consommateurs de ComfyUI (hors runner de production)

| Module | Usage |
|---|---|
| `compose.py` | LLM local via `/prompt` + `/history` — intention FR → scènes |
| `pose_tools.py` | photo → squelette OpenPose (`client_id="pose_tools"`) |
| `expression.py` | pose une expression **après** le contrôle d'identité, sous budget de perte |
| `base_portrait.py` | portraits de base du wizard, **verrou bypassé** |
| `nsfw_batch.py` | graphe d'édition **du pack** (`universe.json/edit_workflow`) |
| `mcp_server.py` | `/object_info`, `/system_stats` — **lecture seule** (ADR-0007) |

---

## 3 · Pages / vues HTML

**Une seule page** : [static/index.html](AUTOMATION/web/static/index.html)
(670 lignes). Aucun templating serveur, aucun rendu Jinja. Les « écrans » sont
des `<div class="screen">` que `nav.js` allume/éteint par la classe `.on`.
Navigation par **hash** (`#creer`, `#trier/x.png`).

### 3.1 Chrome permanent

| Élément | Responsabilité |
|---|---|
| `.brand` | nom de l'app + carte du personnage (initiale, nom, `cid`, type, monde). Peint par `character.js` |
| `#btnId` / `#idMenu` | **menu identité** — seul endroit où l'on change de personnage (rechargement `?character=<id>`), va au registre, ou crée |
| `nav.sidenav` | navbar latérale : Personnages · Produire · Revue (pastille `A_REVOIR`) · Galerie · Banque · Application. Repliable en icônes |
| `nav.rail#toolRail` | **rail d'outils du pack** — lu dans `tools.json`, ≠ navigation. Repliable |
| `#dot` / `#stTxt` | sonde ComfyUI + état de production, peints par `poller.js` |
| `#panneBar` | bandeau de pannes agrégées (`health.js`) |
| `#dirtyBar` | bandeau permanent « modifications non enregistrées » de `scenes.json` |
| `#toast`, `#lightbox` | notifications et loupe |

### 3.2 Les 7 écrans

| Écran | `id` | Responsabilité | Module JS |
|---|---|---|---|
| **Registre / Fiche** | `#registre` | **Deux vues, un écran** (`data-vue`) : `sas` = grille de choix (sans `?character=`), `fiche` = lecture seule du personnage chargé (type, monde, pack, base, état NSFW). N'arme rien, n'édite rien | `registre.js` |
| **Wizard** | `#wizard` | Création : type → style → monde → base d'identité (fournie ou générée). Pas d'onglet propre | `wizard.js` |
| **Produire** | `#creer` | Écran principal. Parcours en 3 blocs (Intention → Ton → Scènes) **ou** 2 blocs au cran d'édition (Image source → Instruction). Curseur d'intensité, panneau de réglages (`#gearPanel`), aperçu du prompt, colonne inspecteur collante, panneau d'exécution | `create.js` (1115 l.), `inspector.js` |
| **Revue / Galerie** | `#trier` | **Un écran, deux métiers** (`data-metier`, F1.1) : Revue juge `A_REVOIR` (gestes V/R/X/A/D), Galerie consulte `OK` (voir/éditer/télécharger, aucun geste de tri). Sélecteurs espace SFW/NSFW, bucket, filtre de score, vue grille/revue | `review.js` (690 l.) |
| **Banque** | `#scenes` | Deux sous-vues (`#bankView`) : **Scènes** (grille de cartes + éditeur d'une scène + composeur + note de direction + ancre d'identité + JSON brut) et **Poses** (squelettes) | `advanced.js` (765 l.) |
| **Journal** | `#journal` | Historique de production filtrable. Sous-écran d'Application, sans onglet propre | `advanced.js` |
| **Application** | `#appli` | Serveur web local (stop/restart) · ComfyUI (état, sondes, unload, restart) · **Contenu adulte** (seul lieu d'armement) · journaux | `appli.js`, `nsfw-arm.js`, `sondes.js` |

### 3.3 Overlays (`<dialog>` natifs)

`#editorBox` (éditeur photo canvas : recadrage, rotation, miroir, redressement,
colorimétrie, grain — tout côté navigateur), `#declineBox`, `#armBox`.
Primitive maison [ui-dialog.js](AUTOMATION/web/static/ui-dialog.js) : focus
piégé et restitué, Escape natif, clic sur le fond.

---

## 4 · État géré côté client

**Aucune globale sur `window`.** Chaque module ES encapsule son état en `let`
privé et expose des accesseurs. La communication passe par un
[bus d'événements](AUTOMATION/web/static/bus.js) (`EventTarget` unique) :
`config:loaded`, `creative:loaded`, `scenes:loaded`, `scenes:dirty`,
`screen:changed`, `nav:go`.

### 4.1 État serveur mis en cache (→ data-fetching React)

| Module | État | Source | Rafraîchi |
|---|---|---|---|
| `config.js` | `QC`, `PRESET_REF`, `NSFW_REF` | `/api/config` | au boot |
| `taxonomy.js` | `CREATIVE` | `/api/creative` | au boot |
| `scenes-store.js` | `SC` (banque complète) | `/api/scenes` | boot + fin de batch |
| `review.js` | `ITEMS`, `BANDES`, `JUGES`, `REFS` | `/api/gallery` | à chaque entrée d'écran / fin de batch |
| `poller.js` | `RUNNING`, `LASTBATCH` | `/api/state` | **toutes les 1,5 s** |
| `sondes.js` | `ETAT` | `/api/app/comfy/stats` | **toutes les 5 s**, en pause si onglet caché |
| `inspector.js` | `META`, `FALLBACK` | `/api/character`, `/api/gallery` | une fois par chargement |
| `registre.js` | `FICHE`, `LOADED` | `/api/character`, `/api/characters` | une fois |
| `rail.js` | `OUTILS` | `/api/universe/tools` | une fois |
| `create.js` | `NSFW_SRC`, `INSTR_CHARGEES` | `/api/nsfw/state`, `/api/nsfw/instructions` | tick 4 s quand visible |
| `nsfw-arm.js` | `ETAT` | `/api/nsfw/state` | à l'entrée d'Application |
| `advanced.js` | `JROWS`, `PROPS` | `/api/journal`, `/api/compose` | à la demande |

### 4.2 État strictement UI (→ state React)

| Module | État | Nature |
|---|---|---|
| `create.js` | `SEL` (Set de scènes), `INTENT`, `TONE`, `LEVEL`, `CONFIRMED` (Set), `PLAN_OK`, `NSRC` (Set d'images source), `NSRC_SIG`, `NARMED`, `SCENE_OVERRIDE`, `APERCU_OUVERT/BATI/SIG`, `RUN_SIG`, `RUN_FERME`, `planTimer` | sélection de production, curseur, aperçu, carte de fin de lot |
| `review.js` | `BUCKET`, `SPACE`, `METIER`, `VIEW`, `FOCUS`, `INTROUVABLE`, `VITEMS`, `CUR`, `SFILTER`, `MESURE_EN_COURS`, `DECLINE_SRC/DRY` | navigation dans la grille, filtre, curseur clavier |
| `editor.js` | `ED_ITEM`, `ED_IMG`, `ED_ROT`, `ED_FLIP`, `ED_RATIO`, `ED_CROP`, `ED_DRAG` | géométrie de l'éditeur photo (canvas) |
| `wizard.js` | `S` (objet unique : `name, cid, type, style, world, base_gelee, step, opts, gen, genState, poll`) | machine à états du wizard, avec **polling** des candidats |
| `advanced.js` | `VUE`, `FICHE`, `JFILTER` | sous-vue banque, fiche de scène ouverte, filtre journal |
| `studio.js` | `MINCE`, `RAIL_MINCE`, `FOCUS` | chrome replié / mode focus |
| `nav.js` | `HASH_ECRIT` | anti-double-navigation sur `hashchange` |
| `hints.js` | `POP`, `ANCRE` | infobulle unique déléguée au document |
| `scenes-store.js` | `SC_DIRTY` | modifications non enregistrées |
| `character.js` | `CURRENT` (const, depuis l'URL), `switcherLoaded` | personnage courant |
| `health.js` | `PANNES` (dict) | agrégat de pannes |

### 4.3 Persistance navigateur

**Deux clés `localStorage`, et rien d'autre** —
[studio.js](AUTOMATION/web/static/studio.js#L27) : navbar repliée et rail
replié. Lectures/écritures dans `try/catch` (fenêtre privée, cookies bloqués).
Aucun `sessionStorage`, aucun IndexedDB, aucun cookie.

### 4.4 État dans l'URL

- `?character=<id>` — **le personnage courant**, lu une seule fois au chargement
  (`character.js`). Changer de personnage = **recharger la page** (contrat V1,
  CLAUDE.md §9).
- `#<route>` — écran courant, avec deux formes composées :
  `#scenes/poses` (sous-vue) et `#galerie/<nom.png>` / `#trier/<nom.png>`
  (destination + image visée). Table dans
  [constants.js](AUTOMATION/web/static/constants.js) `ROUTES` / `routeFor()`,
  jamais un hash construit à la main ailleurs.

### 4.5 État serveur singleton — le vrai point dur

[`shared_state.STATE`](AUTOMATION/web/shared_state.py#L118) est un **dict
global de process**, avec `UNDO` (pile de 50) et `CHECKER` (modèle InsightFace,
~1 Go, chargé au plus une fois sous `threading.Lock`).

`STATE` contient : `running, batch_id, index, total, current, log[200],
stats, stop, started_at, recent[24], eta, intensity, edition, character,
last_error`.

Conséquences à porter dans tout plan de migration :

- **Un seul batch à la fois, pour toute la plateforme** — c'est voulu (un seul
  GPU). `STATE["character"]` est le personnage *du batch en cours*, qui peut
  différer de celui de l'URL ; `inspector.js` teste explicitement cette
  divergence.
- `UNDO` est une pile unique **filtrée à la lecture** par `character_id`.
- Cet état est **en mémoire, non persisté** : un `os.execv` (restart depuis
  l'UI) le perd.
- **Incompatible avec plusieurs workers** : uvicorn en `--workers > 1`
  casserait `STATE`, `UNDO`, `CHECKER` et les caches `COMFY_PROBE` / `_STATS`.

---

## 5 · Points de couplage frontend ↔ backend

### 5.1 Contrat d'appel : `?character=` sur tout

[api.js](AUTOMATION/web/static/api.js) ajoute `?character=<id>` à **chaque**
appel `/api/*` **et** à `/img`. Un seul constructeur d'URL d'image
(`imgUrl({bucket, space, name, thumb, v})`) pour toute l'application — parce
que tant que chaque écran assemblait sa chaîne, le personnage ou l'espace
s'oubliait et `/img` servait les images de Léna à qui passait par là.

`api()` **ne lève jamais** : sur un corps non-JSON il rend
`{ok:false, erreur:"réponse invalide du serveur (500)"}`. D'où `erreurDe(r)`,
appliqué par chaque chargeur avant de toucher aux données.

### 5.2 Contrat de validation : `ss.character(request)`

Point de passage unique, qui rejette en **400 JSON** (jamais 500, jamais un
chemin) : slug invalide, dossier absent, `character.json` absent, univers
inconnu, `output_style` hors des styles du pack, **couple `(type, style)` qui
ne résout pas le pack déclaré**, monde inconnu ou incompatible avec la famille.

`requis=True` (uniquement `/img`) : l'absence du paramètre est elle-même une
erreur — pas de repli sur `"lena"`.

### 5.3 Deux axes qu'on ne dérive jamais l'un de l'autre

- `character_id` — **QUI**. Choisit l'arbre `PROD/<CID>/`.
- `space` — **SFW ou NSFW**. Choisit le sous-arbre (`_NSFW/`).

La valeur SFW s'est longtemps appelée `"lena"`. La valeur canonique est
`"sfw"` ; `"lena"` reste **acceptée en entrée** (`_ALIAS_ESPACE`) et n'est
plus jamais rendue. La base SQLite, elle, garde `espace='lena'` pour le SFW —
la conversion vit à un seul endroit (`ss.espace_db()`).

### 5.4 Formes de données échangées

| Objet | Forme | Défini par |
|---|---|---|
| Réponse d'action | `{ok: bool, erreur?: str, ...}` | convention universelle, y compris sur les 4xx/5xx |
| Erreur | `{ok:false, erreur:"<texte FR destiné à l'écran>"}` | `bad_request()`, `garde_erreurs` |
| Item de galerie | `{name, bucket, space, score, scene, categorie, format, seed, date, v, prompt, nettete, texture, fond, flag}` | `/api/gallery` |
| Entrée `STATE.recent` | `{bucket, name, scene, space, score}` | `production.py` |
| Job de plan | `{scene, category, format, variant, seed, prompt, intensity, outfit}` | `/api/plan` |
| Aperçu de prompt | `{total_car, n_jobs, scene, fragments[{source,texte,part}], echos[{mot,sources}]}` | `apercu_prompt()` |
| Palier d'intensité | `{level, key, label, pipeline, wardrobe, prompt_add, destination, export, requires, base_level?, besoin_instruction, unite, scenes}` | `/api/creative` |
| État d'outil NSFW | `{armed, pack, has_graph, available, reason}` | `nsfw_batch.edit_tool_state()` |
| Payload de run | `{scenes[], categories[], count, format, limit, seed, no_variants, no_qc, preset{}, nsfw{}, intensity, confirm_intensity, tone, intention, edit_instruction, sources[], generer_avant, scene_override}` | `create.js payload()` |

**Fichiers de configuration** (contrat implicite front↔back, ni schéma ni
validation déclarative) : `character.json` (registre personnage),
`config.json` (réglages mesurés), `scenes.json`, `creative.json`,
`UNIVERS/<pack>/universe.json`, `tools.json`, `character_defaults.json`,
`UNIVERS/resolution.json`, `WORLDS/<id>.json`.

**Journaux CSV** (`;` comme séparateur) :

- `date;batch;character;scene;categorie;intensite;ton;variante;format;seed;score_identite;verdict;fichier;export;duree_s;prompt`
- NSFW : `date;batch;source;seed;score_identite;verdict;fichier;duree_s;instruction`
  (pas de colonne `character` : le chemin la porte)

**Base SQLite unique** (`PROD/soulglade.db`) : `batch, image, score, jugement,
embedding, reference_set, reference_member`, toutes avec `character_id`,
`UNIQUE(character_id, fichier)`.

### 5.5 Conventions de nommage

- **Le code est en anglais** (noms, docstrings) — mais **pas dans
  `AUTOMATION/web/`**, où identifiants, fonctions et commentaires sont **en
  français** (`demarrer`, `valider_banque`, `bucket_dir`, `oublier_vignette`,
  `renderScenes`, `signalerPanne`). Divergence réelle avec CLAUDE.md §2, à
  trancher explicitement avant la migration plutôt qu'à la volée.
- Les **messages d'erreur sont en français**, destinés à l'écran tel quel.
- Buckets : `OK, A_REVOIR, REJET, SANS_VISAGE, ARCHIVE` (`ss.BUCKETS`).
- Actions de tri : `valider→OK, revoir→A_REVOIR, rejeter→REJET, archiver→ARCHIVE`.
- Modes de déclinaison : `lumiere, ton, seeds, intensite, editer`.
- Noms de fichier : `SAFE_NAME = ^[A-Za-z0-9_.\-]+\.(png|jpg|jpeg)$`, appliqué
  à **toute** route qui reçoit un nom.
- Arborescence : `PROD/<CID>/<bucket>/`, `PROD/<CID>/_NSFW/<bucket>/`,
  `PROD/EXPORT/<cid>/<categorie>/`, `PROD/.thumbs/<cid>/<space>/<bucket>/`.
- `data-s="<route>"` sur les boutons de navbar **est le contrat de navigation**,
  lu par `nav.js` et par 4 tests navigateur.

### 5.6 Couplages implicites à ne pas casser

1. **`v` (mtime) dans l'URL d'image** : sans lui, `/api/edit/save?remplacer`
   laisse le navigateur servir l'ancienne image depuis son cache.
2. **`/api/plan` est rejoué à chaque frappe** (debounce) — il porte à la fois
   le comptage, l'aperçu du prompt et les alertes d'instruction.
3. **Deux minuteurs écrivent `#btnRun.disabled`** (`poller.tick` et
   `create.refreshPlan`) ; `planOk()` est la source commune qui les empêche de
   se marcher dessus. Un état partagé React supprimerait ce garde-fou par
   construction — donc aussi le bug qu'il couvre.
4. **`/api/mesurer` par paquets** : le front doit rappeler tant que
   `restant > 0`.
5. **Le rail ne connaît que `surface`** (`bank-poses`, `bank-scenes`,
   `review-lightbox`) ; une surface inconnue rend un bouton **inerte qui dit
   pourquoi**, jamais une destination inventée.
6. **Raccourcis clavier** : `V/R/X/A/D` (tri), `C/I` (jugement), `U` (annuler),
   flèches, `Entrée` (loupe), `f` (focus), `Échap`. Chaque handler porte une
   pile de gardes (champ de saisie, `<dialog open>`, `body.editing`,
   `METIER === 'galerie'`) qu'une refonte doit reproduire à l'identique.

### 5.7 Tests couplés au frontend

**14 tests navigateur Playwright** (`AUTOMATION/tests/test_*.js`) pilotés par
[run_browser_tests.py](AUTOMATION/tests/run_browser_tests.py), chacun contre un
`app.py --no-comfy --no-browser` neuf sur son propre port. Ils s'accrochent aux
**ids et sélecteurs du DOM actuel** (`#sceneCards`, `data-s=`, `#btnRun`…) :
c'est le poste de coût frontal de la migration.

À côté, **22 tests Python**, dont `test_serveur_http.py`,
`test_character_param.py`, `test_cross_character.py`, `test_nsfw_isolation.py`,
`test_isolation_disque.py` — ceux-là testent **l'API** et resteraient valables
si les contrats d'URL et de forme JSON sont préservés.

---

## 6 · Décisions actées à respecter dans la nouvelle architecture

### 6.1 Séparation données personnelles / code versionné — ADR-0005, CLAUDE.md §2

`/INPUTS/`, `/PROD/`, `/CHARACTERS/`, `*.db`, `/.env` sont **git-ignorés** ; le
dépôt doit pouvoir passer public sans tri d'urgence. Contraintes concrètes :

- **Aucune route, aucun test, aucun build ne doit dépendre d'un chemin qui
  suppose ces données présentes.** Un frontend React avec une étape de build ne
  doit importer aucun asset venu de `CHARACTERS/` ou `INPUTS/`.
- Le chemin ComfyUI est une **configuration explicite** (`.env`,
  `COMFYUI_ROOT`) — ADR-0008, jamais déduit par position sur le disque.
- Les octets de la base gelée **ne sont servis par aucune route** : le chrome
  affiche une initiale, pas le portrait. Une route qui lirait `ComfyUI/input/`
  sans borne `character_id` rouvrirait la fuite fermée le 29/08/2026.

### 6.2 NSFW désactivable, off par défaut — ADR-0003, ADR-0010, ADR-0013, CLAUDE.md §6

- **Off par défaut** : un personnage neuf n'a jamais le NSFW actif.
- L'interrupteur est **par personnage** (`character.json/nsfw`), **jamais
  global**. Il ne se prend qu'**à un seul endroit** : section « Contenu
  adulte » de l'écran Application. Armement par **recopie du mot `ARMER`**.
- L'armement n'est **pas surchargeable par un corps de requête** :
  `NSFW_SURCHARGEABLES` est une liste blanche qui ne le contient pas.
- **Deux conditions, jamais une** (`edit_tool_state`) : personnage armé **ET**
  pack déclarant `edit_workflow`. Sinon le cran est **absent, jamais grisé**,
  et l'interface **dit pourquoi** (`reason`).
- Le NSFW **ne construit aucun sous-système** : il recompose deux outils
  globaux. Pas d'onglet parallèle, pas de second `STATE`, pas de second panneau
  (retirés le 26/08/2026).
- La sortie NSFW **ne s'exporte jamais** (`exporter()` retourne `""`),
  `appliquer_export()` coupe l'export dès que le palier ne s'exporte pas.
- **Le masquage ne remplace pas la garde** : `/api/creative` n'émet pas le
  palier, **et** `guard_intensity()` refuse côté serveur.

### 6.3 Style visuel figé à la création — ADR-0006, ADR-0012, CLAUDE.md §3, §8.8

**Quatre axes**, dont trois sont des choix humains figés à la création :
**type de personnage**, **style de sortie**, **monde**. Le **pack** n'est pas
un choix — il se **résout** depuis `(type, style)` par `universe.resolve()`,
lu dans `UNIVERS/resolution.json` (table de données, **ni `if` ni
dictionnaire en dur**). Aucune règle applicable → `UnresolvedPackError`,
**jamais de repli silencieux**.

- **Seul le wizard écrit une fiche.** Aucun écran n'édite un axe figé — il n'y
  a donc **aucune route** pour le faire, et il ne doit pas en apparaître une.
- `ss.character(request)` **revalide la cohérence** `(type, style) → pack` à
  chaque requête : un registre divergent est une panne, pas un cas à réparer
  en silence.
- Le style s'applique par `output_styles` du pack (`prompt_add`, swap de
  checkpoint) — jamais par un `if` sur le personnage.
- Changer de type, de style ou de monde = **créer un autre personnage**.

### 6.4 Autres invariants (CLAUDE.md §8) touchés par la migration

| # | Invariant | Où il vit aujourd'hui |
|---|---|---|
| §8.1 | Workflows lus, jamais réécrits | `ui_to_api.convert()` à chaque lancement |
| §8.2 | **Un seul `execute_jobs`**, appelé par la CLI **et** par le web | `runner/sortie.py` ; consommateurs : `runner/cli.py` et `routes/production.py` |
| §8.3 | Un seul assembleur de prompt par personnage, verrouillé **à l'octet près** | `test_build_jobs.py`, `test_build_jobs_abyssiaelle.py` |
| §8.4 | **Aucun seuil en dur** — tout vient de `config.json` via l'API | `config.js` charge `/api/config` ; les bandes de score ne sont jamais écrites dans le front |
| §8.7 | Le panel d'outils vient du registre univers — **jamais un `if character == "lena"`** | `rail.js` + `/api/universe/tools` |
| §8.10 | MCP **lecture et validation seulement** | `mcp_server.py` |
| §8.11 | **Jamais un fichier de graphe par personnage** ; un `config.json` ne porte aucun chemin de graphe d'édition | `universe.json/edit_workflow` |
| §7 | **Une seule base SQLite**, colonne `character_id`, jamais une base par personnage | `base.py` |

### 6.5 Contraintes non-fonctionnelles héritées

- **Zéro dépendance à installer** aujourd'hui : le dépôt tourne sur
  l'interpréteur embarqué de ComfyUI (aiohttp, PIL, psutil y sont déjà).
  Playwright est installé **hors du repo** (`~/.soulglade-pw`).
- **Aucune étape de build** côté frontend (`.claude/rules/frontend.md`).
- **Une erreur backend se dit à l'écran** — jamais un échec silencieux, un
  spinner infini ou une erreur en console seule.
- **WCAG 2.2 AA visé** : HTML sémantique avant ARIA, focus visible, Escape
  ferme une overlay, gestes haute fréquence au clavier, statut jamais par la
  couleur seule, `prefers-reduced-motion`.
- **Un seul GPU, un seul batch** : la contrainte de concurrence est physique,
  pas logicielle.

---

## 7 · Points d'attention relevés (matière pour le plan)

Constats factuels, sans préconisation :

1. ~~**`POST /api/config` n'a aucun appelant frontend**~~ — **traité le
   2026-08-30 : la route est supprimée.** Investigation : aucun appelant,
   frontend ni externe, depuis l'import initial du repo ; 2 clés couvertes sur
   11 (`preset`, déjà surchargé en mémoire par `/api/run` et non persisté par
   choix produit, et `qc`, que rien n'édite). L'écran Réglages prévu par
   ADR-0012 portera sur `identity` et le marqueur `measured`, hors de sa liste
   blanche : il lui faudra une route neuve. Il n'existe donc plus **aucune**
   écriture de `config.json` hors wizard et gel de la base.
2. **`STATE` global + `CHECKER` en mémoire interdisent le multi-worker.**
3. **Le suivi de production est un polling à 1,5 s** ; il n'existe aucune
   infrastructure de push, ni côté Soulglade, ni depuis ComfyUI.
4. **La validation est impérative et dispersée** (`valider_banque`,
   `fusion_validee`, `guard_intensity`, `entier`, `SAFE_NAME`,
   `NSFW_SURCHARGEABLES`, `space_id`, `ss.character`). Chacune porte un incident
   daté en commentaire ; aucune n'est déclarative.
5. **Le frontend est en français, le reste du code en anglais** — divergence
   avec CLAUDE.md §2 à trancher.
6. **`backend.md` annonce Flask, la réalité est aiohttp** — à corriger.
7. **14 tests Playwright s'accrochent au DOM actuel** ; les 22 tests Python
   testent l'API et survivraient à un changement de framework si les contrats
   sont préservés.
8. **Aucun schéma d'API n'existe** : le contrat n'est écrit nulle part sous
   forme exploitable, il se lit dans les docstrings et dans le JS qui consomme.
9. **`/api/gallery` (200) et `/api/journal` (300) tronquent sans pagination** ;
   `sans_mesure` est en revanche compté sur tout le dossier — les deux chiffres
   se contredisaient avant cette correction.
10. **Les images ne passent pas par HTTP entre ComfyUI et Soulglade** : tout est
    déplacement de fichiers sur le disque, avec des copies obligatoires vers
    `ComfyUI/input/` (`LoadImage` ne lit que là).
11. **Deux chantiers de finition sont en cours** et non commités
    ([DOCS/ROADMAP-finition-studio.md](DOCS/ROADMAP-finition-studio.md),
    F1→F6) — ils touchent `advanced.js`, `character.js`, `create.js`,
    `index.html`, `screens.css`, tous au cœur du périmètre de migration.
