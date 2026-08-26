# Pièges connus par nœud/module custom

Consulté par le skill `workflow-comfyui` quand l'édition touche un de ces
nœuds. Chaque piège a coûté du temps de debug réel — vérifier ici avant de
re-découvrir le même.

## comfyui_essentials
Tous ses nœuds sont suffixés `+` dans le mapping (`DrawText+`,
`ImageResize+`…) mais la classe Python correspondante n'a pas le `+`.
Utiliser la clé **avec** `+` dans le champ `type` du JSON — c'est la clé de
mapping qui compte, pas le nom de classe.

## ComfyUI_PuLID_Flux_ll (fork lldacing)
Verrou d'identité pour Flux (`ApplyPulidFlux`, `PulidFluxModelLoader`,
`PulidFluxEvaClipLoader`, `PulidFluxInsightFaceLoader`, `PulidFluxOptions`,
`PulidFluxFaceDetector`). Contient un patch local à réappliquer après
chaque mise à jour du nœud — vérifier avant de mettre à jour ce custom node.

## comfyui-reactor (face-swap InsightFace)
**Proscrit sur toute branche NSFW.** Le nœud embarque un classificateur
interne (`vit-base-nsfw-detector`) qui retire l'image du lot au-delà d'un
seuil et renvoie un carré noir 512×512 à la place du résultat — silencieux,
pas d'erreur explicite. Le remplacement validé : verrou d'identité natif de
l'univers (PuLID ou LoRA/IPAdapter selon la famille) + FaceDetailer, qui
donne de toute façon un meilleur résultat (visage re-rendu plutôt que
collage basse résolution).

## comfyui_controlnet_aux
Installé **sans** son `requirements.txt` — tout ce dont le préprocesseur
utilisé (`DWPreprocessor`, pose corps/mains) a besoin est déjà présent par
ailleurs. **Ne jamais lancer ce `requirements.txt`** : il tire `mediapipe`,
qui installe `opencv-contrib-python` à côté de `opencv-python` (deux
distributions du même package `cv2`) et casse InsightFace et tout ce qui
dépend du scoring d'identité. Les poids du préprocesseur (~200 Mo) se
téléchargent seuls dans `ckpts/` au premier lancement, pas besoin de les
fournir.

## Nœud d'extraction de pose (détection faciale)
`detect_face` doit rester à `disable` quand l'extraction sert à piloter une
pose : activé, il retire le maillage facial 68 points, qui décrirait la
forme des yeux/nez/bouche de la personne source — exactement ce que le
verrou d'identité du personnage doit être seul à décider. Le squelette
corps conserve nez/yeux/oreilles (orientation de la tête) sans en imposer
la géométrie : c'est le comportement voulu.

## ControlNet Union Pro 2.0 (et versions similaires « auto-detect »)
Si la config du modèle porte `num_mode: null`, il **auto-détecte** le type
de conditionnement. Ne pas brancher les nœuds `SetUnionControlNetType` /
`SetShakkerLabsUnionControlNetType` dessus — ces nœuds servent la version
qui déclare un `num_mode` explicite (ex. 10). Les brancher sur la mauvaise
version ne plante pas franchement, mais fausse le résultat silencieusement.

## Polices pour DrawText+ (ou équivalent d'incrustation de texte)
Lues au **démarrage** de ComfyUI depuis le dossier de polices du nœud.
Ajouter une police ne suffit pas : redémarrer ComfyUI pour qu'elle soit
prise en compte.

## Score d'identité contre un centroïde plutôt que contre la référence gelée
Si une base de mesures propose un score contre un centroïde (moyenne d'un
ensemble de mesures) en plus du score contre la référence gelée d'origine :
ne jamais l'utiliser comme verdict de dérive. Mesuré une fois : un score
contre centroïde peut être inflaté de +0.15 à +0.22 par rapport au score
contre la référence gelée — l'utiliser comme seuil de décision rend le
détecteur de dérive aveugle à la dérive qu'il est censé détecter.
