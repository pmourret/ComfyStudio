"""Runner batch : banque de scenes -> ComfyUI -> QC identite -> tri -> export.

Commun a tout personnage (character_id explicite, J2) — anciennement
lena_batch.py/runner.py tant qu'un seul personnage existait, decoupe ici en
sous-modules (J2 etape 3) :

    prompt.py   assemblage du prompt (byte-exact, verrouille par
                tests/test_build_jobs.py)
    comfy.py    dialogue HTTP avec ComfyUI, aucun couplage personnage
    sortie.py   tri, export, journal, base — et execute_jobs, la colonne
                vertebrale unique (CLAUDE.md §8.2)
    cli.py      point d'entree ligne de commande

Ce fichier reexporte l'API complete : `import runner as lb` puis
`lb.build_jobs(...)`, `lb.execute_jobs(...)` etc. continuent de marcher
exactement comme avant que ce module devienne un paquet.
"""
import json
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent      # AUTOMATION/runner/
AUTOMATION = HERE.parent                     # AUTOMATION/
OFM = AUTOMATION.parent                      # racine du repo
sys.path.insert(0, str(AUTOMATION))

import env_config  # noqa: E402

COMFY = env_config.comfyui_root()
COMFY_OUTPUT = env_config.comfyui_output()
COMFY_INPUT = env_config.comfyui_input()     # LoadImage ne lit que d'ici


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


from .prompt import *  # noqa: E402,F401,F403
from .comfy import *   # noqa: E402,F401,F403
from .sortie import *  # noqa: E402,F401,F403
from .cli import main  # noqa: E402,F401
