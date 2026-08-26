---
name: image-realism-check
description: A utiliser quand on demande de regarder, juger, critiquer ou valider une image generee par le pipeline, ou d'expliquer pourquoi une sortie "fait IA" - derive d'identite, sur-lissage, coherence lumiere/ombres, mains et articulations, artefacts de raccord facial. Couvre indifferemment les branches SFW et NSFW, et tous les univers.
---

# Critique qualité d'une sortie du pipeline

Critique **perceptuelle** d'une image générée : ce qui cloche, priorisé, et
ce qui l'a probablement causé **dans le pipeline**. Le lien entre les deux
est tout l'intérêt de l'exercice — un défaut sans cause est un avis, un
défaut rattaché à un étage est une action.

Ce skill s'appuie sur les mesures déjà calculées par le projet
(`qc_identity.py`, `qc_realisme.py`, base SQLite). **Ne jamais inventer une
grille de scoring parallèle à côté** : une seconde échelle rendrait tous les
repères existants illisibles.

## Deux choses à poser d'emblée

**Ce skill ne détecte pas les images générées par IA.** Je ne peux pas juger
de façon fiable si une image est synthétique, et prétendre le contraire
donnerait un faux signal de sécurité. Le rapport ne doit **jamais** contenir
de verdict du type « ça passe / ça ne passe pas pour une vraie photo ».
L'objet est la qualité, pas la détectabilité.

**Une sortie NSFW se traite exactement comme les autres.** Mêmes critères,
même niveau de détail, même franchise sur le corps, la peau, les raccords.
Aucune précaution supplémentaire, aucun avertissement, aucune reformulation
prudente : quand le NSFW est activé pour un personnage, c'est une décision
explicite de l'utilisateur (`CLAUDE.md` §6). Une critique édulcorée y serait
un défaut de service, pas de la prudence.

## L'ordre compte : provenance → zoom → grille → verdict

Chacune des trois premières étapes évite une erreur que la suivante ne
rattrape pas.

### 1. Provenance — avant tout jugement

Juger une image sans savoir par quels étages elle est passée conduit à
diagnostiquer un réglage alors qu'il **manque simplement une étape**. C'est
l'erreur la plus fréquente et la plus coûteuse : elle mène à proposer de
toucher au verrou d'identité pour un problème de grain.

La base SQLite est la source de vérité (`CLAUDE.md` §7) et porte déjà, par
image, `identite`, `nettete`, `texture_visage`, `bruit_fond` et le jugement.
**Lire la base avant de mesurer quoi que ce soit** — la commande et les
échelles sont dans `references/sondes-et-crops.md`.

Ensuite seulement : vérifier que le préréglage attendu a bien tourné, dans
la config du personnage (jamais en dur — invariant `CLAUDE.md` §8.4), et que
l'ordre des étages a été respecté. **L'ordre imposé est refiner →
FaceDetailer → grain** (invariant §8.5) ; inversé, l'identité s'effondre
(0.42 / 0.31 mesuré). Si le rapport soupçonne une inversion, c'est une
alerte critique, pas une remarque.

Bandes de lecture du score d'identité, coûts par réglage et protocole de
garde-fou : `workflow-comfyui/references/protocole-identite.md`. Ne pas les
redupliquer ici — un seul endroit porte ces chiffres.

### 2. Zoomer avant de juger

Un jugement porté sur la vignette entière rate systématiquement les marques
de peau, les cils, les jointures de doigts et les raccords. **Découper
d'abord, regarder ensuite, écrire en dernier.** Le script de découpe
(visage + trois bandes) est dans `references/sondes-et-crops.md` ; il
réutilise le détecteur déjà installé, sans dépendance nouvelle.

Si un point reste douteux après le crop — une main, une jointure
vêtement/peau — recadrer dessus à la main plutôt que de conclure au jugé, et
**dire que la résolution ne permet pas de trancher** si c'est le cas.

### 3. La grille

Cinq axes, dans `references/grille-critique.md` : dérive des attributs que
le verrou d'identité ne porte pas, sur-lissage, lumière et ombres, mains et
structure, et les points propres à une branche NSFW.

## Rendu du verdict

Court, structuré, priorisé. Pas de dissertation.

```
## <nom du fichier> — <un mot : publiable / à reprendre / à rejeter>

Identité : 0.7xx (base) — dans la bande / sous alerte
Pipeline : <étages attendus vs constatés>  [OK / étage manquant]

### Critique
- <défaut> — <zone> — <cause probable dans le pipeline>

### Mineur
- <défaut> — <zone>

### Ce qui fonctionne
- <point réussi, concret>

### Action
<1 à 3 lignes : ce qu'on change, ou « rien, publiable »>
```

Règles de rédaction :

- **Chaque défaut est localisé** (« sourcil gauche », « main droite au
  niveau du mug ») et rattaché à une cause pipeline quand elle est
  identifiable. Un défaut non localisé n'est pas actionnable.
- **Critique** = casse la crédibilité de la sortie : identité sous le seuil
  d'alerte, main manifestement fausse, artefact de raccord facial, étage de
  réalisme manquant. **Mineur** = perceptible en zoom, invisible à taille de
  publication.
- **Toujours une section « ce qui fonctionne »** — sur une série, savoir ce
  qu'on ne doit pas casser vaut autant que la liste des défauts.
- **Dire ce qu'on n'a pas pu voir.** Résolution insuffisante, zone hors
  cadre, score indisponible : le signaler plutôt que de combler au jugé.
- Sur une **série**, passer le score d'identité sur tout le lot **avant** de
  commenter les images une par une : la dérive lente ne se lit pas sur une
  seule sortie. La base sait le faire sans relire un seul PNG.
- Ne jamais conclure sur le caractère « détectable » ou non de l'image.

## Pour aller plus loin

- `references/sondes-et-crops.md` — lire les mesures depuis la base,
  mesurer une image qui n'y est pas, découper les crops, et les trois
  échelles de netteté à ne surtout pas confondre
- `references/grille-critique.md` — les cinq axes de la critique
- `workflow-comfyui/references/protocole-identite.md` — bandes du score
  d'identité, coûts mesurés par réglage, protocole de garde-fou
