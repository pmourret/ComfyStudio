# API V3 — types d'I/O, schéma, conventions de données

Consulté par le skill `comfyui-custom-nodes` au moment d'écrire le schéma
d'un nœud. Relevé sur l'installation locale : **ComfyUI 0.26.0**,
`comfy_api/latest/_io.py`.

Tout est sous le namespace `io` (`from comfy_api.latest import io`). Chaque
type expose `.Input(...)` et, quand c'est pertinent, `.Output(...)`.

## Widgets — valeur saisie dans le nœud

| Type | Paramètres propres au-delà du socle |
|---|---|
| `io.Int` | `default, min, max, step, control_after_generate, display_mode` |
| `io.Float` | `default, min, max, step, round, display_mode` |
| `io.Boolean` | `default, label_on, label_off` |
| `io.String` | `multiline, placeholder, default, dynamic_prompts` |
| `io.Combo` | `options` (liste ou `Enum`), `default`, `control_after_generate`, `upload`, `image_folder`, `remote` |
| `io.MultiCombo` | comme `Combo`, multisélection |

Socle commun à tous les `Input` : `id, display_name, optional, tooltip,
lazy, extra_dict, raw_link, advanced` — plus, pour les widgets : `default,
socketless, widget_type, force_input`.

**Attention à `control_after_generate`** : un widget `INT` qui le déclare
(ou qui s'appelle `seed` / `noise_seed`) consomme **deux places** dans le
`widgets_values` positionnel du format UI — sa valeur, puis le
`randomize`/`fixed`. C'est la source d'un décalage silencieux côté graphe
(voir `workflow-comfyui/references/format-ui-mecanique.md`).

## Sockets — données transitant entre nœuds

`io.Image`, `io.Mask`, `io.Latent`, `io.Conditioning`, `io.Model`,
`io.Clip`, `io.Vae`, `io.ControlNet`, `io.ClipVision`, `io.StyleModel`,
`io.UpscaleModel`, `io.Sampler`, `io.Sigmas`, `io.Noise`, `io.Guider`,
`io.Audio`, `io.Video`, `io.Hooks`, `io.BBOX`, `io.SEGS`, `io.LoraModel`,
`io.Point`, `io.FaceAnalysis`, `io.AnyType`, `io.MultiType`,
`io.MatchType`… — liste complète dans `comfy_api/latest/_io.py`.

`io.Custom("MON_TYPE")` fabrique un type maison si aucun ne convient. À
éviter sauf nécessité : il ne se branchera sur rien d'existant, ce qui rend
le nœud inutilisable hors de la chaîne écrite pour lui.

**Output** : `id, display_name, tooltip, is_output_list`.

## Champs de `io.Schema` qui servent vraiment

`node_id`, `display_name`, `category`, `description`, `inputs`, `outputs`,
`hidden`, `search_aliases`, `is_output_node` (nœud terminal type Save),
`is_input_list`, `is_experimental`, `is_deprecated`, `not_idempotent`,
`accept_all_inputs`.

`Schema.validate()` impose des `id` uniques entre inputs **et** outputs.

`is_output_node` mérite une note : c'est lui qui fait d'un nœud une
terminaison de graphe. La conversion UI→API du repo vérifie qu'un nœud de
sortie **actif** subsiste — un graphe dont le seul nœud de sortie est
bypassé ne produit rien, sans erreur explicite.

## Variables cachées

```python
hidden=[io.Hidden.unique_id, io.Hidden.prompt, io.Hidden.extra_pnginfo]
```

Disponibles ensuite via `cls.hidden.unique_id`, etc. Valeurs disponibles :
`unique_id`, `prompt`, `extra_pnginfo`, `dynprompt`, `auth_token_comfy_org`,
`api_key_comfy_org`, `comfy_usage_source`.

## Conventions de données

- **Image** : `torch.Tensor` en `[B, H, W, C]`, float 0–1, canaux **RGB**.
  Les opérations kornia/torch attendent souvent `[B, C, H, W]` →
  `movedim(-1, 1)` puis `movedim(1, -1)` au retour (exemple lisible :
  `comfy_extras/nodes_morphology.py`).
- **Mask** : `[B, H, W]`, float 0–1.
- **Device** : `comfy.model_management.get_torch_device()` pour calculer,
  `comfy.model_management.intermediate_device()` pour rendre le résultat.
  **Ne jamais coder `cuda` en dur** — 16 Go de VRAM sur cette machine,
  l'offload est déjà tendu et une allocation forcée fait tomber le run.
- **Progression** d'une tâche longue — instancier l'API une fois au niveau
  module, et déclarer `execute` en `async def` pour pouvoir l'attendre :

  ```python
  from comfy_api.latest import ComfyAPI
  api = ComfyAPI()
  ...
      @classmethod
      async def execute(cls, ...) -> io.NodeOutput:
          await api.execution.set_progress(value=i, max_value=n)
  ```

  (`ComfyAPISync` existe pour un `execute` synchrone.)
- **Sortie visuelle** : `io.NodeOutput(img, ui=ui.PreviewImage(img, cls=cls))`
  avec `from comfy_api.latest import ui`. Passer `cls` permet au helper
  d'écrire les métadonnées du nœud. Helpers disponibles :
  `ui.PreviewImage`, `ui.PreviewMask`, `ui.PreviewText`, `ui.PreviewAudio`,
  `ui.PreviewVideo`, `ui.ImageSaveHelper`, `ui.SavedImages`.

## Hooks optionnels

| Méthode (`@classmethod`) | Rôle |
|---|---|
| `validate_inputs(**kwargs) -> bool \| str` | équivalent V1 `VALIDATE_INPUTS` |
| `fingerprint_inputs(**kwargs) -> Any` | équivalent V1 `IS_CHANGED` — invalide le cache |
| `check_lazy_status(**kwargs) -> list[str]` | évaluation paresseuse des inputs |

## Sources locales à relire plutôt qu'à supposer

L'API V3 bouge encore : `ComfyAPI_latest.STABLE = False` sur cette
installation. Sur une version de ComfyUI différente de 0.26.0, relire ces
fichiers **avant** d'écrire, plutôt que de se fier à ce document.

| Question | Fichier |
|---|---|
| Signature exacte d'un `Input`, liste complète des types | `ComfyUI/comfy_api/latest/_io.py` |
| Champs de `Schema`, enum `Hidden` | idem, classes `Schema` et `Hidden` |
| Helpers d'affichage / sauvegarde | `ComfyUI/comfy_api/latest/_ui.py` |
| `ComfyExtension`, `ComfyAPI`, exports | `ComfyUI/comfy_api/latest/__init__.py` |
| Comment le chargeur trouve un nœud | `ComfyUI/nodes.py`, branche `comfy_entrypoint` |
| Exemples V3 courts et lisibles | `ComfyUI/comfy_extras/nodes_morphology.py` |

Le chemin de l'installation ComfyUI est aujourd'hui
`H:/ComfyUI/ComfyUI_windows_portable/ComfyUI/`. Il est codé en dur ici comme
il l'est encore dans plusieurs modules — c'est la dette de chemin identifiée
à `J1` et traitée à `J2` (`ROADMAP.md`), pas un choix.
