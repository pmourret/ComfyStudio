# AUTOMATION — production en série de Léna

Chaîne complète sans clic : **banque de scènes → ComfyUI → QC d'identité → tri →
export publiable → journal CSV**.

Le runner convertit le workflow UI en format API à chaque lancement. Ce que tu
édites dans ComfyUI est ce qui tourne — il n'y a pas de copie API à maintenir en
parallèle, et le runner ne modifie jamais le fichier du workflow.

Deux façons de s'en servir : le **tableau de bord web** (le plus confortable) ou
la **ligne de commande** (scriptable). Les deux appellent exactement le même
cœur, il n'y a pas de comportement qui diverge entre les deux.

---

## Tableau de bord web

```bat
run_web.bat                 :: démarre ComfyUI si besoin, puis http://127.0.0.1:8189
run_web.bat --no-comfy      :: ne touche pas à ComfyUI (géré à la main)
run_web.bat --no-browser    :: n'ouvre pas le navigateur
```

**ComfyUI est démarré automatiquement** s'il ne répond pas déjà sur le port 8188
(`AUTOMATION/comfy_server.py`). Il s'ouvre dans **sa propre fenêtre console** —
c'est là que sortent ses logs et les erreurs de custom nodes. Compter ~12 s avant
que le navigateur s'ouvre : le dashboard attend que ComfyUI réponde, plutôt que
de s'afficher sur un écran « hors ligne ».

Deux garde-fous : aucune seconde instance n'est lancée si ComfyUI tourne déjà
(le port est sondé d'abord), et il n'est **pas** arrêté en quittant le dashboard
— un batch peut encore être en file. Fermer sa fenêtre à la main pour libérer la
VRAM.

Si ComfyUI ne démarre pas, le tableau de bord s'ouvre quand même et affiche
l'écran hors ligne : il se débloque tout seul dès que ComfyUI répond.

Le serveur utilise `aiohttp`, déjà fourni avec ComfyUI : rien à installer.

Deux écrans, un menu **⚙ Avancé**, et le curseur d'intensité au-dessus des deux.

**Créer** — le parcours par défaut, en trois blocs qui se révèlent l'un après
l'autre : **Intention** (Selfie, Lifestyle, Sport, Mode, Voyage, Self-care,
Herbier, Intime, plus une carte *Toutes*) → **Ton** (pré-sélectionné selon
l'intention, modifiable) → **Scènes**. Chaque carte de scène porte sa vignette,
son format, son **score moyen et le nombre d'images déjà produites**, ses tags, et
un badge *ce ton* quand elle va bien avec le ton choisi. Le ton ne retire jamais
de scène : il remonte les affines. Tous les réglages fins sont derrière le `⚙` de
la barre de lancement.

**Revue** — la grille par défaut, chaque vignette portant son score d'identité en
pastille et ses **trois sous-scores de réalisme** en barres : `net` (netteté),
`peau` (texture de peau dans le visage — c'est celle qui attrape le lissage PuLID),
`fond` (plancher de bruit hors visage). Les actions se font **sans ouvrir
l'image** : ♥ garder, ✕ rejeter, ▣ archiver, et le jugement ◉ *convaincante* /
◌ *fait IA*. Au clavier : <kbd>V</kbd> <kbd>X</kbd> <kbd>A</kbd> pour le tri,
<kbd>C</kbd> <kbd>I</kbd> pour le jugement, <kbd>U</kbd> pour annuler.

Le jugement de réalisme **ne déplace aucun fichier** : c'est un axe indépendant du
tri. Il sert à étalonner les mesures — le projet s'interdit les photos réelles de
tiers, il n'y a donc pas d'autre référence honnête. À partir de 8 images jugées
*convaincantes*, les barres se calent sur cette bande ; avant, sur l'étendue du
dossier courant. Un bouton **Mesurer** apparaît quand des images n'ont pas encore
été mesurées (~250 ms l'unité, par paquets de 20).

**Décliner** — le bouton `⟳` d'une vignette (ou <kbd>D</kbd>) repart de cette
image au lieu de relancer un batch : *autre lumière*, *autre ton*, *même scène en
3 autres tirages*, *monter d'un cran d'intensité*. Le seed de l'image est réutilisé
partout sauf pour les tirages — à seed égal, seul ce qu'on change bouge. Le panneau
n'affiche que ce qui a un sens sur cette image : une scène sans variante affiche
*Autre lumière* grisé. Une image absente du journal ne peut pas être déclinée, sa
scène et son seed sont inconnus.

**Niveau NSFW** — le quatrième cran du curseur. Il est verrouillé tant que la
branche n'est pas armée ; cliquer dessus ouvre le rituel (recopier le mot `ARMER`),
qui a quitté l'onglet pour vivre là où la décision se prend. Une fois armé, un bloc
**Instruction d'édition** apparaît dans Créer, et la chaîne tourne en deux temps :
génération en **Soft**, puis édition, puis PuLID + FaceDetailer remettent le visage.
Une image dont la passe SFW sort de la bande d'identité **n'est pas éditée**. Les
sorties vont dans `PROD/_NSFW/` et ne sont jamais exportées. Désarmer fait
redescendre le curseur.

**⚙ Avancé** — banque de scènes, journal, branche NSFW (édition d'une image déjà
validée, sans régénérer). Rien n'a disparu, tout est simplement sorti du chemin par
défaut.

Description historique des écrans (le tri et la banque n'ont pas changé) :

**Curseur d'intensité** — une barre sous l'en-tête, visible sur tous les écrans :
`SFW strict` · `Soft` · `Suggestif` · `NSFW`. C'est le seul réglage global. Il
filtre les scènes (chacune déclare la bande qu'elle supporte) et choisit la tenue
(`wardrobe` de la scène). *Suggestif* demande une confirmation et sort de l'export ;
*NSFW* est verrouillé tant que l'enchaînement automatique n'est pas câblé (étape 5).
L'application rouvre toujours en `SFW strict` — le niveau n'est jamais mémorisé.

**Produire** — les scènes s'affichent en vignettes (la dernière image produite
pour chacune), on clique pour sélectionner. **Rien n'est sélectionné au départ** :
on choisit ce qu'on veut produire, on ne déselectionne pas onze scènes pour en
garder une. Changer de niveau élague la sélection des scènes devenues hors bande. Les pastilles de catégorie
*filtrent* la grille, elles ne sont pas une deuxième sélection. En bas, une barre
fixe annonce ce qui va se passer — « 26 images · 12 scènes · environ 23 min », la
durée étant calculée sur les temps réellement mesurés dans le journal — avec le
choix de qualité (Réalisme / Rapide / Brut) et le bouton *Lancer*. Tout le reste
(nombre par scène, format imposé, seed, réglages fins du préréglage) est replié
dans *Réglages avancés*.

Pendant la production, un panneau prend la tête de l'écran : progression, scène
en cours, temps restant, **bande des images au fur et à mesure qu'elles tombent**
(bordure verte / orange / rouge selon le score), bouton *Arrêter*, et le journal
technique replié. À la fin, un bouton *Trier les résultats* mène directement à
l'étape suivante.

**Trier** — c'est l'écran où on passe le plus de temps, il est fait pour aller
vite. Il s'ouvre sur la **grille**, chaque vignette portant son score en pastille,
avec quatre filtres de lecture : *Tout*, *Excellentes* (≥ 0.74), *Correctes*
(0.72 – 0.74), *Sous la bande* (< 0.72 ou visage non mesuré). Les filtres
s'appliquent **à l'intérieur** du dossier courant : c'est ce qui fait ressortir
les images validées à la main dont le score est en réalité hors bande.

La vue *Revue* montre une image en grand, le score en gros à droite, et le
clavier —
<kbd>V</kbd> valider, <kbd>R</kbd> à revoir, <kbd>X</kbd> rejeter,
<kbd>←</kbd> <kbd>→</kbd> naviguer, <kbd>U</kbd> annuler. Chaque action fait
avancer automatiquement à l'image suivante et affiche un message avec un lien
*annuler* (qui remet le fichier où il était et supprime l'export éventuel). La
navigation et les actions suivent le **filtre actif**, pas le dossier entier.
Les actions s'adaptent au dossier : dans *Validées* on ne propose pas « valider »,
dans *Rejetées* le bouton principal devient « restaurer ». Un clic sur une vignette
de la grille bascule en vue *Revue* sur cette image.

**Scènes** — une carte par scène avec de vrais champs (id, catégorie, format,
nombre, guidance, prompt, variantes), boutons ajouter et supprimer. L'ancre
d'identité est en haut, éditable une fois pour toutes. Le JSON brut reste
accessible en bas pour les modifications en masse. Sauvegarde `.bak` à chaque
enregistrement.

**Journal** — `journal_batch.csv` filtrable par verdict.

**NSFW** — verrouillé tant que la branche n'est pas armée (voir plus bas).

Les onglets sont dans l'URL (`#trier`, `#scenes`…) : le bouton retour du
navigateur fonctionne et un onglet peut se mettre en favori.

### Depuis le téléphone

```bat
run_web.bat --host 0.0.0.0
```

Le tableau de bord devient accessible sur `http://<ip-du-pc>:8189` — pratique
pour trier les images depuis le canapé. **Aucune authentification** : à réserver
à un réseau de confiance, et à couper ensuite.

---

## Ligne de commande

1. Lancer ComfyUI et le laisser ouvert. Au choix : `run_nvidia_gpu.bat`, ou
   `python_embeded\python.exe ComfyUI\output\OFM\AUTOMATION\comfy_server.py`
   (qui ne fait rien s'il tourne déjà ; `--check` sonde sans rien démarrer).
   Contrairement à `run_web.bat`, le runner CLI ne le démarre pas tout seul.
2. Depuis `ComfyUI_windows_portable\` :

```bat
python_embeded\python.exe ComfyUI\output\OFM\AUTOMATION\lena_batch.py --dry-run
```

(le tableau de bord fait la même chose avec le bouton *Aperçu*)

`--dry-run` affiche le plan (scènes, formats, seeds, prompts assemblés) sans rien
générer. À faire systématiquement avant un gros batch.

Puis, pour produire :

```bat
:: toute la banque de scènes, variantes comprises
python_embeded\python.exe ComfyUI\output\OFM\AUTOMATION\lena_batch.py

:: une catégorie
... lena_batch.py --category lifestyle --category selfie

:: une scène précise, 4 images
... lena_batch.py --scene cafe_terrasse --count 4

:: une série de test rapide
... lena_batch.py --limit 3 --no-variants
```

Le raccourci `run_batch.bat` (dans ce dossier) fait la même chose en
double-clic, avec les arguments passés à la suite.

### Options

| Option | Effet |
|---|---|
| `--dry-run` | affiche le plan, ne lance rien |
| `--scene ID` | limite à une scène (répétable) |
| `--category NOM` | limite à une catégorie (répétable) |
| `--count N` | nombre d'images par scène (écrase `scenes.json`) |
| `--format 4:5` | force le format pour tout le batch |
| `--limit N` | plafonne le nombre total d'images |
| `--seed 12345` | seed fixe — pour comparer deux réglages à image identique |
| `--no-variants` | ignore les variantes de scène |
| `--no-qc` | pas de score d'identité (tout part dans `OK`) |

---

## Ce que ça produit

```
PROD/
├── LENA/
│   ├── OK/            score ≥ 0.70 — conforme, prêt
│   ├── A_REVOIR/      0.60 – 0.70 — dérive possible, œil humain requis
│   └── REJET/         < 0.60 — ce n'est plus Léna
├── EXPORT/
│   ├── lifestyle/     JPEG qualité 92 à la taille de publication
│   ├── selfie/
│   └── ...
└── journal_batch.csv  une ligne par image
```

Nommage : `categorie_scene_AAAAMMJJ_NN.png`.

Le journal CSV (séparateur `;`, ouvrable dans Excel) contient date, batch, scène,
catégorie, variante, format, **seed**, score d'identité, verdict, fichier, export,
durée et prompt complet. Le seed permet de régénérer exactement une image :
`--scene X --seed <valeur>`.

---

## Le QC d'identité

Chaque image est comparée à la base gelée avec InsightFace (antelopev2, le même
modèle que PuLID). Seuils dans `config.json` :

| Bande | Dossier | Lecture |
|---|---|---|
| ≥ 0.72 | `OK` | conforme |
| 0.60 – 0.72 | `A_REVOIR` | à regarder — souvent un angle extrême ou un visage petit dans le cadre |
| < 0.60 | `REJET` | dérive réelle |

`config.json` porte un troisième seuil, `qc.threshold_high` (0.74) : il **ne trie
rien sur le disque**, il sert uniquement au filtre *Excellentes* du tableau de
bord. Valeur provisoire, à recalibrer quand le journal aura quelques centaines de
lignes — sur les 10 premières mesures la plage réelle est 0.674 – 0.749.

**Le QC ne remplace pas l'œil.** Il attrape la dérive de structure du visage, pas
la disparition des taches de rousseur ni un sourcil qui s'affine. Les 3 points de
contrôle habituels restent à faire sur les images de `OK` avant publication —
mais sur 5 images au lieu de 30.

Un score bas n'est pas toujours une dérive : un profil marqué, un visage très
petit dans le cadre ou une lumière dure font mécaniquement baisser la mesure.
D'où le dossier `A_REVOIR` plutôt qu'une poubelle.

---

## Décrire une intention plutôt qu'écrire un prompt

Depuis le 24/08/2026 le composeur produit le **nouveau schéma** : prompt sans
vêtement, `intention` prise dans `creative.json`, plus `tags`, `tones`, et les
tenues par niveau. On y arrive soit par ⚙ Avancé → Banque de scènes, soit par la
carte **« + créer une scène »** en fin de grille dans Créer, qui pré-remplit
l'intention courante.

Chaque proposition est relue avant enregistrement — le composeur ne sauvegarde
jamais. Les mots qui méritent un œil (cheveux, peau, maquillage : l'ancre les porte
déjà) sont signalés en orange sur la carte. Et le modèle local est un 4B : il lui
arrive de proposer une tenue trop légère au niveau 0, à corriger à la main.

Onglet **Scènes**, en haut : tu écris ce que tu veux en français —
« Léna aime passer du temps dans son jardin, elle y bouture ses plantes le
matin » — et le modèle de langage **local** rédige les scènes au format maison.

- il tourne dans ComfyUI (nœud `TextGenerate` + `qwen3vl_4b`), donc rien ne sort
  de la machine et aucune API n'est facturée ;
- ~20 s pour trois scènes ;
- il connaît les règles : jamais de description du visage, style descripteurs
  séparés par des virgules, formats maison, et il réutilise tes catégories
  existantes — sauf si tu en imposes une nouvelle dans le champ prévu
  (c'est comme ça qu'on crée la catégorie « jardin ») ;
- les propositions ne sont **pas** enregistrées : tu les vois, tu ajoutes celles
  que tu veux, tu les corriges dans les cartes, puis tu enregistres.

## Note de direction

Toujours dans l'onglet Scènes : un champ unique dont le contenu est ajouté à la
fin de **tous** les prompts. C'est le moyen d'infléchir une série entière sans
retoucher chaque scène — « autumn palette, softer light », « overcast weather ».
Se vide aussi vite qu'il se remplit.

## Ajouter une scène à la main

Dans `scenes.json`, une entrée :

```json
{
  "id": "marche_dimanche",
  "category": "lifestyle",
  "format": "4:5",
  "count": 2,
  "prompt": "walking through an outdoor market, half body, holding a paper bag, wearing a rust cotton jacket, flat morning light, stalls out of focus behind",
  "variants": ["light rain, wet ground, grey sky"]
}
```

Règles :

- **Ne jamais décrire le visage.** C'est PuLID qui le porte ; un prompt qui
  redécrit les traits entre en concurrence avec lui et provoque la dérive.
- L'ancre (cheveux, yeux, taches de rousseur) est ajoutée automatiquement — elle
  est en haut de `scenes.json`, ne pas la dupliquer dans les scènes.
- Décrire : lieu, action, cadrage, angle, lumière, tenue, arrière-plan.
- `variants` multiplie la scène (lumière, saison, tenue) sans réécrire le prompt.

**Réglages par scène** (facultatifs) : `guidance`, `steps` et `refiner_denoise`
écrasent `config.json` pour cette scène seulement. Utile quand un décor précis
doit être respecté : à 2.2 la guidance privilégie le réalisme sur l'obéissance au
prompt, monter à 2.8–3.2 pour les scènes à accessoires (tapis de yoga, objets
identifiables). `sport_tapis` s'en sert déjà comme exemple.

---

## Réglages

`config.json` porte le préréglage réalisme mesuré dans `DOCS/lena-realisme.md` :
guidance 2.2, refiner à 0.40, FaceDetailer et grain actifs. Le runner active les
groupes correspondants du workflow au moment de l'exécution — le fichier reste
avec ses valeurs par défaut (tout en bypass) pour le travail manuel.

Pour produire sans la couche réalisme : passer `refiner`, `facedetailer` et
`grain_export` à `false` dans `config.json`.

---

## Branche NSFW

Onglet **NSFW**. Verrouillé par défaut : tant que `config.json` porte
`nsfw.enabled = false`, l'API refuse toute exécution (HTTP 403) et l'écran
n'affiche que la règle du projet.

**Armer** demande de recopier le mot `ARMER` — un clic seul ne suffit pas. C'est
une décision explicite, à prendre quand le compte a atteint la maturité prévue,
pas un réflexe de test. Le bouton *désarmer* est toujours visible ensuite.

Une fois armée, la branche fonctionne en trois temps :

1. **image source** — uniquement parmi les images déjà **validées**
   (`PROD/LENA/OK`). On n'engendre jamais une scène de zéro.
2. **instruction d'édition** — courte, en anglais. Un préambule fixe protège
   déjà la pose, le cadrage, le décor et la lumière : n'écris que la
   modification.
3. **exécution** — Qwen-Rapid-AIO-NSFW édite, puis **PuLID + FaceDetailer**
   re-rendent le visage depuis la base gelée, et le QC d'identité note le
   résultat.

Sorties dans `PROD/_NSFW/{OK,A_REVOIR,REJET}` avec leur propre
`journal_nsfw.csv`. **Rien n'entre dans la galerie courante ni dans l'export** :
les deux espaces ne se mélangent jamais.

### Pourquoi pas ReActor

Le nœud `ReActorFaceSwap` embarque un classificateur (`vit-base-nsfw-detector`).
Quand le résultat dépasse 0.979 sur la classe « nsfw », il **retire l'image du
lot** et le nœud renvoie un carré noir 512×512. Constaté le 23/08 : l'édition
Qwen était correcte (1072×1920, contenu normal), la sortie ReActor était noire.

Le remplacement par PuLID + FaceDetailer est meilleur de toute façon : le visage
est **re-rendu par Flux** au lieu d'être collé en 128 px, et c'est le même
mécanisme d'identité que la production SFW — donc le même visage partout.

### Réglages mesurés

Comparaison à seed fixe sur la même source :

| Réglage | Identité | Netteté zone éditée | Durée |
|---|---|---|---|
| 2,06 MP · 8 pas | 0.767 | 11 | 82 s |
| **1,14 MP · 8 pas** | **0.770** | **20** | **60 s** |
| 1,14 MP · 16 pas | 0.749 | 24 | 96 s |

Qwen-Image-Edit rend son meilleur détail autour de 1 MP : au-delà, la zone
éditée ressort molle. La branche plafonne donc la surface de travail
(`nsfw.max_pixels`, 1 150 000 par défaut) puis **remonte à la taille de la
source** en fin de chaîne (4x NMKD-Siax + redimensionnement). Résultat type :
sortie 1080×1920, identité 0.764, 64 s par image.

### Réalisme sur la branche NSFW

Qwen-Rapid rend une peau propre et uniforme, exactement comme Flux : c'est ce qui
fait « image générée ». La branche reprend donc la même parade que la chaîne SFW,
dans le même ordre — **refiner d'abord, identité ensuite**.

```
édition Qwen  →  refiner SDXL (N3b)  →  PuLID + FaceDetailer (N4)  →  échelle + grain (N5)
```

Mesuré à seed fixe sur la même source :

| Réglage | Identité | Détail zone éditée | Écart à la source |
|---|---|---|---|
| sans refiner | 0.774 | 76 | 20.2 |
| refiner 0.30 | 0.761 | 100 | 20.3 |
| **refiner 0.40** | **0.780** | **102** | **20.4** |

Trois choses à retenir :

- le refiner apporte **+33 % de détail** dans la zone éditée ;
- l'identité ne bouge pas (0.76–0.78) — l'ordre refiner → FaceDetailer fait son
  travail, comme sur la chaîne SFW ;
- **il ne rhabille pas le sujet** : l'écart à la source dans la zone éditée reste
  à 20.2–20.4 dans les trois cas. C'était le risque à écarter avec un modèle
  SDXL généraliste, il est mesuré.

Le grain final est calé sur la signature du reste de la production : bruit de
fond mesuré à **3.71** contre **3.62** sur les images SFW. Sans lui, la sortie
NSFW tombait à 1.8 — nettement plus propre que le reste du feed, donc repérable.

Coût : quasi nul une fois les modèles chargés (34 s avec refiner contre 86 s pour
le premier passage à froid). Le premier run d'une session charge Qwen-Rapid,
SDXL **et** Flux : compter deux à trois minutes.

Boutons de réglage dans `config.json`, bloc `nsfw` :

| Clé | Défaut | Effet |
|---|---|---|
| `steps` | 8 | pas d'échantillonnage de l'édition ; 12–16 pour un peu plus de détail, au prix de l'identité |
| `cfg` | 1.0 | Qwen-Rapid est distillé, ne pas monter |
| `max_pixels` | 1150000 | surface de travail de l'édition ; 0 = pas de plafond |
| `face_denoise` | 0.35 | force du re-rendu du visage ; 0.25 = plus doux, 0.45 = réécrit franchement |
| `refiner` | true | étage réalisme SDXL ; sur `false` la branche n'est même pas exécutée |
| `refiner_denoise` | 0.40 | 0.25 = effet léger, au-delà de 0.45 la pose commence à bouger |
| `grain` | 0.012 | grain de capteur appliqué après la remise à l'échelle |
| `sharpen` | 0.25 | micro-netteté qui rattrape le redimensionnement |

Le premier run charge Qwen-Rapid (~20 Go) **et** Flux pour l'étage d'identité :
sur 16 Go de VRAM il y a de l'offload, compter une à deux minutes de plus au
tout premier passage.

## Limites connues

- **Un batch = un GPU occupé.** Compter ~50 s par image avec le préréglage
  complet (chargement des modèles inclus au premier job). 30 images ≈ 25 min.
- **Ne pas activer le groupe 05 (hires latent 2K)** en même temps que le
  FaceDetailer : conflit VRAM documenté dans `DOCS/lena-identite-pulid.md`.
  Le préréglage utilise le groupe 09 (upscale image) à la place.
- **Pas de publication.** Le runner s'arrête à `PROD/EXPORT/`. La mise en ligne
  reste manuelle, volontairement : le compte est en phase de warm-up et
  l'automatisation de publication est un risque côté conditions d'utilisation.
- **Si ComfyUI n'est pas lancé**, le runner CLI s'arrête immédiatement avec une
  erreur de connexion : c'est normal, lancer ComfyUI d'abord (`comfy_server.py`).
  `run_web.bat` s'en charge tout seul, la CLI non — c'est volontaire, un batch en
  ligne de commande ne doit pas déclencher d'effet de bord.
- Le QC charge InsightFace en CPU (~5 s au premier appel, puis instantané).
- **Un seul batch à la fois.** Le tableau de bord refuse un second lancement tant
  que le premier tourne (le GPU est de toute façon sérialisé).
- Le tableau de bord n'a pas d'authentification : il est conçu pour tourner en
  local, sur ta machine. Cela vaut aussi pour l'armement de la branche NSFW :
  n'expose pas le port sur le réseau pendant que la branche est armée.
- Le composeur est un modèle 4B : il propose, il ne décide pas. Relis toujours
  les prompts avant d'enregistrer — c'est le rôle de l'étape de validation.
