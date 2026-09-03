"""Capacite de plateforme : upscale d'une image deja produite (ADR-0017,
ADR-0018, ADR-0020, J8.4 — premier habitant de la couche plateforme).

CE QUE CE MODULE PROUVE, PAS SEULEMENT AFFIRME. `UpscaleRunner` n'importe ni
`universe` ni `identity` : une capacite de plateforme ne consulte jamais le
pack ni le personnage pour savoir si elle a le droit de s'executer
(contrainte du chantier). `character_id` sert UNIQUEMENT au namespacing des
fichiers (isolation entre personnages), jamais a choisir un graphe ou une
regle — la meme capacite tourne, sans aucune branche, pour Lena (pack flux)
et pour Abyssiaelle (pack sdxl).

PASSE PAR execute_jobs, JAMAIS UN CHEMIN PARALLELE (invariant 2). Le graphe
de production a sa propre classe de runner (`WorkflowRunner`), l'edition
NSFW la sienne (`NsfwRunner`, sa propre boucle dans nsfw_batch.py) — celle-ci
n'a pas de boucle a elle : `run_upscale_batch()` construit des jobs et les
passe a `AUTOMATION.runner.sortie.execute_jobs()` via son parametre `runner=`
deja injectable. Le tri, le QC, le journal viennent gratuitement, inchanges.

Un « job » d'upscale reprend la forme que `execute_jobs` attend (pensee pour
une generation depuis un prompt) en la remplissant depuis l'image source
plutot qu'en l'inventant : `prompt` est une chaine informative (jamais
injectee dans le graphe, qui n'a pas de noeud de texte), `scene`/`category`
reprennent le nom du fichier source faute de mieux.
"""
import random
import shutil
from datetime import datetime
from pathlib import Path

import platform_capabilities
import ui_to_api

from . import OFM, COMFY_INPUT, load_json
from .comfy import queue_prompt, wait_prompt
from .sortie import execute_jobs

# Prefixe propre a cette capacite — PAS nsfw_batch.src_prefix()/_prepare_source,
# qui codent "_NSFW_SRC_" en dur : reutiliser ce nom ici laisserait croire a
# une implication NSFW qui n'existe pas. Le batch_id est inclus pour rendre le
# nom UNIQUE PAR APPEL (cache d'execution de ComfyUI, meme piege que
# expression.py/apercu du 03/09/2026, voir skill workflow-comfyui) : deux
# upscales de la meme image ne doivent jamais partager un LoadImage "vu"
# identique par ComfyUI, sinon le second recoit une reference vers un
# fichier de sortie deja deplace par sort_and_export.
def _staged_name(character_id, batch_id, source_name):
    return f"_{character_id.upper()}_UPSCALE_SRC_{batch_id}_{source_name}"


# Multiplicateur par defaut appliqué a la taille REELLE de la source (pas un
# format de personnage fige — c'etait le bug du groupe 09 de Lena, ADR-0020).
# Arrondi au multiple de 16 (contrainte VAE courante, meme regle que
# nsfw_batch._size_for) et plafonne pour eviter un cote demesure sur une
# source deja grande.
UPSCALE_FACTOR = 2.0
MAX_SIDE = 2560


def _target_size(path):
    from PIL import Image
    with Image.open(path) as im:
        w, h = im.size
    w, h = w * UPSCALE_FACTOR, h * UPSCALE_FACTOR
    if max(w, h) > MAX_SIDE:
        k = MAX_SIDE / max(w, h)
        w, h = w * k, h * k
    return (max(16, int(w) // 16 * 16), max(16, int(h) // 16 * 16))


class UpscaleRunner:
    """Meme forme que WorkflowRunner/NsfwRunner (__init__, api_for, queue,
    wait) — c'est ce qui lui permet d'alimenter execute_jobs via son
    parametre `runner=` sans qu'execute_jobs sache qu'il existe."""

    def __init__(self, cfg, character_id):
        self.cfg = cfg
        self.character_id = character_id
        self.url = cfg["comfy_url"].rstrip("/")
        graph_path = platform_capabilities.require_capability("upscale")["graph"]
        self.ui = load_json(OFM / graph_path)
        self.obj = ui_to_api.fetch_object_info(self.url)
        f = ui_to_api.find_node
        self.roles = {
            "source": f(self.ui, "LoadImage"),
            "upscale": f(self.ui, "ImageUpscaleWithModel"),
            "resize": f(self.ui, "ImageScale"),
            "save": f(self.ui, "SaveImage"),
        }

    def api_for(self, job, batch_id):
        api = ui_to_api.convert(self.ui, self.obj)

        def node(role):
            return api[str(self.roles[role]["id"])]

        src = Path(job["source_path"])
        staged = COMFY_INPUT / _staged_name(self.character_id, batch_id, src.name)
        shutil.copy(src, staged)
        node("source")["inputs"]["image"] = staged.name

        w, h = job["target_size"]
        node("resize")["inputs"].update(width=w, height=h)

        node("save")["inputs"]["filename_prefix"] = (
            f"OFM/PROD/_BATCH/{batch_id}/{job['scene']}")
        return api

    def queue(self, api):
        return queue_prompt(self.url, api, client_id=f"{self.character_id}_upscale")

    def wait(self, prompt_id, timeout=900):
        return wait_prompt(self.url, prompt_id, timeout)


def _capability_cfg(cfg):
    """Copie de `cfg` adaptee a un passage d'upscale dans execute_jobs :
    `preset.expression` desactive (suppose une generation avec un ton — sans
    objet sur une image deja expressive) ; `export.enabled` desactive (un
    upscale n'est pas une publication automatique). `preset.grain_telephone`
    N'EST PAS touche : repasser le grain apres un 4x + redescente est un
    choix assume, pas un oubli — le 4x peut lisser le grain existant."""
    preset = dict(cfg.get("preset", {}), expression=False)
    export = dict(cfg.get("export", {}), enabled=False)
    return {**cfg, "preset": preset, "export": export}


def run_upscale_batch(paths, cfg, checker, character_id, batch_id=None,
                      on_event=None, should_stop=None):
    """Upscale chaque image de `paths` (chemins reels, deja resolus par
    l'appelant — cette fonction ne choisit pas quelles images existent, ce
    n'est pas son role). Passe par execute_jobs, jamais une boucle a part
    (invariant 2)."""
    batch_id = batch_id or datetime.now().strftime("%Y%m%d_%H%M%S")
    jobs = []
    for i, p in enumerate(paths, 1):
        p = Path(p)
        jobs.append({
            "character_id": character_id,
            "scene": p.stem,
            "category": "upscale",
            "intention": "upscale",
            "tone": "",
            "intensity": 0,
            "outfit": "",
            "format": "upscale",
            "variant": "",
            "index": i,
            "prompt": f"upscale {UPSCALE_FACTOR:g}x de {p.name}",
            "fragments": [],
            "seed": random.randint(1, 2 ** 48),
            "overrides": {},
            "pose": None,
            "source_path": str(p),
            "target_size": _target_size(p),
        })
    runner = UpscaleRunner(cfg, character_id)
    return execute_jobs(jobs, _capability_cfg(cfg), checker, batch_id, character_id,
                        runner=runner, on_event=on_event, should_stop=should_stop)
