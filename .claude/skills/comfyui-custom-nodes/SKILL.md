---
name: comfyui-custom-nodes
description: A utiliser pour developper un noeud ComfyUI inedit en Python (API V3 - io.Schema, io.ComfyNode, ComfyExtension). A n'activer que sur demande explicite d'un noeud qui n'existe dans aucun des packs deja installes. Pour editer un workflow JSON existant, utiliser workflow-comfyui a la place.
---

# Écrire un nœud ComfyUI — API V3

Référence de développement, **pas** un catalogue de nœuds. L'inventaire des
nœuds déjà disponibles sur cette machine vit dans
`workflow-comfyui/references/modeles-par-univers.md` — ce skill ne le
redocumente pas.

Vérifié contre l'installation locale : **ComfyUI 0.26.0**, `comfy_api/latest`.

## Le portail d'entrée — ne pas écrire de nœud par réflexe

Un nœud custom est une dépendance de plus dans un pipeline qui en a déjà
beaucoup, et qui doit survivre aux mises à jour du reste. Avant d'en écrire
un, poser les trois questions dans cet ordre :

1. **Le besoin est-il couvert par un pack déjà installé ?**
   (`comfyui_essentials`, `kjnodes`, Impact Pack, `rgthree`, `easy-use`,
   `custom-scripts`, `IPAdapter_plus`, `PuLID_Flux_ll`, `florence2`,
   `GGUF`, `controlnet_aux`…)
2. **Peut-il se faire hors graphe, en Python dans `AUTOMATION/` ?** C'est
   souvent la bonne réponse pour du tri, de la mesure, de l'export ou du QC :
   le graphe reste simple et le code reste testable — un nœud custom, non.
3. **Si un nœud est quand même justifié : le dire, avec la dette qu'il
   ajoute** (dépendances pip, compatibilité avec les futures versions de
   ComfyUI, patch à réappliquer après update).

Toute dépendance externe nouvelle se signale **avant** installation. Le
pipeline a déjà été cassé deux fois par une installation transitive : voir
`workflow-comfyui/references/pieges-noeuds-custom.md` (`mediapipe` tirant
un second `cv2` et cassant le scoring d'identité). Sur cette machine,
`--no-deps` est la règle par défaut pour tout ce qui touche à la chaîne
`torch` / `numpy` / `opencv` / InsightFace.

## Squelette minimal

Un module de nœud V3 = des classes `io.ComfyNode` + une `ComfyExtension` +
une fonction `comfy_entrypoint`.

```python
import torch
from typing_extensions import override
from comfy_api.latest import ComfyExtension, io


class CSExample(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="CSExample",           # cle du mapping = "type" dans le JSON du workflow
            display_name="CS Example",
            category="ComfyStudio/utils",
            description="What the node does (tooltip).",
            inputs=[
                io.Image.Input("image", tooltip="Input image."),
                io.Float.Input("amount", default=0.5, min=0.0, max=1.0, step=0.01),
                io.Mask.Input("mask", optional=True),
            ],
            outputs=[
                io.Image.Output(display_name="IMAGE"),
            ],
        )

    @classmethod
    def execute(cls, image, amount, mask=None) -> io.NodeOutput:
        out = image * amount
        return io.NodeOutput(out)


class CSExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [CSExample]


async def comfy_entrypoint() -> CSExtension:
    return CSExtension()
```

Le préfixe `CS` est la convention de ce projet : `schema.node_id` devient la
clé de `NODE_CLASS_MAPPINGS`, donc le champ `type` dans les JSON de
workflow, et il doit être **globalement unique** sur l'installation. Sans
préfixe, une collision avec un pack tiers installé plus tard renomme
silencieusement le nœud d'un workflow existant.

### Mécanique à connaître (tirée de `nodes.py` et `comfy_api/latest/_io.py`)

- `define_schema` et `execute` sont des **`@classmethod`** — il n'y a pas de
  `self`.
- Les paramètres d'`execute` portent le **`id`** des inputs du schéma.
- Le retour est un **`io.NodeOutput(*valeurs)`**, dans l'ordre des `outputs`.
- `comfy_entrypoint` peut être `async` ou sync ; le chargeur gère les deux.

### Les deux façons dont un nœud disparaît sans erreur

Ce sont les seuls pièges vraiment coûteux du chargeur, parce qu'aucun des
deux ne produit de message à l'endroit où on le cherche :

1. **Le module expose aussi un `NODE_CLASS_MAPPINGS`.** Le chargeur prend
   alors la branche V1 et **ne lit jamais** `comfy_entrypoint`. Un module =
   un seul des deux styles, jamais les deux.
2. **Une exception dans `comfy_entrypoint` est avalée** en
   `logging.warning`. Le nœud disparaît simplement du menu. Chercher
   `Error while calling comfy_entrypoint` dans la console **au démarrage** —
   pas au moment où le nœud manque.

## Où poser le fichier

```
ComfyUI/custom_nodes/cs_<fonction>/
├── __init__.py        # contient (ou reexporte) comfy_entrypoint
└── pyproject.toml     # optionnel, metadonnees + dependances
```

Le chargeur inspecte le module racine du dossier : `comfy_entrypoint` doit
être accessible depuis `__init__.py`.

**Ce repo ne contient pas les custom nodes** — ils vivent dans
`ComfyUI/custom_nodes/`. Un nœud écrit pour ce projet est donc du code
**hors repo**, invisible d'un `git clone` : le signaler explicitement, et
l'inscrire comme dépendance du pipeline dans
`workflow-comfyui/references/pieges-noeuds-custom.md` au même titre qu'un
patch local. Sans cette trace, le pipeline devient non reproductible sur une
autre machine — ce qui est exactement le problème que la Mission « passage
en public » cherche à éviter.

Redémarrer ComfyUI après création, puis vérifier que le serveur le voit
vraiment (c'est `object_info` qui fait foi, pas le menu de l'interface) :

```bash
python -c "
import sys; sys.path.insert(0,'AUTOMATION')
import ui_to_api
obj = ui_to_api.fetch_object_info('http://127.0.0.1:8188')
print('CSExample' in obj)
"
```

## Répercussion sur le pipeline

Un nouveau nœud n'est utile que branché dans un workflow. Une fois le nœud
chargé, passer au skill **`workflow-comfyui`** pour le câbler, en se
rappelant que :

- le champ `type` du JSON doit valoir **exactement** le `node_id` du schéma ;
- `widgets_values` en format UI est **positionnel** et suit l'ordre des
  inputs widget déclarés dans le schéma — changer l'ordre des inputs d'un
  nœud déjà utilisé décale silencieusement tous les graphes qui l'emploient ;
- si le nœud doit être piloté par le runner, il lui faut un **titre
  distinctif** (`find_node` cherche par type + titre et lève sur
  l'ambiguïté).

Un nœud dont le schéma change après qu'il a été câblé quelque part est un
changement cassant. Si des inputs doivent être ajoutés, les ajouter **à la
fin** et en `optional`.

## Forme de la réponse attendue

Dire ce que le nœud ajoute comme dette avant de le proposer. Écrire le
code **en anglais** (noms, commentaires, docstrings, messages d'erreur),
comme tout le code du repo. Lister les dépendances pip requises et
attendre l'accord avant toute installation. Finir par ce qui reste à
vérifier côté utilisateur : redémarrage de ComfyUI, présence dans
`object_info`, câblage dans un graphe.

## Pour aller plus loin

- `references/api-v3-io.md` — catalogue des types d'I/O, champs de
  `io.Schema`, variables cachées, conventions de données (tenseurs, device,
  progression), hooks optionnels, et la table des sources locales à relire
  plutôt qu'à supposer
