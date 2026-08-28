"""Image d'identite gelee d'un personnage (`base_gelee`).

Le verrou d'identite (pulid_flux / lora_sdxl) charge cette image via un
`LoadImage` « BASE GELEE » ; ComfyUI ne lit un `LoadImage` que depuis son
propre dossier `input/`. Ce module y depose l'image et rend le nom de fichier
a ecrire dans `config.json / base_gelee`.

Deux sources (ROADMAP J7bis) :
  - fournie  -> save_uploaded()  : l'utilisateur televerse une image
  - generee  -> 5b-ii            : un portrait produit par le graphe du pack,
                                    verrou bypasse (aucune reference n'existe
                                    encore)

Le principe fondateur s'applique : un personnage du registre est fictif,
entierement genere — une image fournie ici doit l'etre aussi, jamais la photo
d'une personne reelle (CLAUDE.md §2). Ce module ne peut pas le verifier ; c'est
une regle d'usage, rappelee dans l'UI du wizard.
"""
import base64
import binascii
import io
import json
import random
import re
import shutil
import urllib.request
from pathlib import Path

import env_config
import universe
import worlds

OFM = Path(__file__).resolve().parent.parent
COMFY_INPUT = env_config.comfyui_input()
COMFY_OUTPUT = env_config.comfyui_output()

MAX_BYTES = 20 * 1024 * 1024
_FORMAT_EXT = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}
_CID_RE = re.compile(r"[a-z][a-z0-9_-]*$")
_DATA_URL = re.compile(r"^data:image/[a-z+]+;base64,", re.I)

# Prompt du portrait de reference : cadrage centre, neutre, sans decor — c'est
# la texture du visage qui compte pour le verrou, pas la mise en scene. Le
# prompt_add du style et celui du monde s'y ajoutent (le monde peut teinter la
# lumiere / l'ambiance, il n'invente pas un visage).
BASE_PROMPT = ("head and shoulders portrait, centered composition, neutral calm "
               "expression, plain uncluttered background, soft even frontal "
               "lighting, sharp focus, photographic")
MAX_CANDIDATES = 8


class BaseImageError(ValueError):
    """Image de base refusee : cid invalide, base64 illisible, pas une image,
    format non gere, trop lourde."""


def frozen_name(cid, ext):
    """Nom de fichier de la base gelee dans ComfyUI/input/ : stable, deductible
    du cid, sans collision avec les bases existantes (OFM_LENA_*, ABY_MAIN_REF)."""
    return f"{cid.upper()}_BASE{ext}"


def save_uploaded(cid, image_base64):
    """Ecrit la base fournie dans ComfyUI/input/ et rend son nom de fichier.

    `image_base64` : data URL (`data:image/png;base64,...`) ou base64 nu. Le
    format reel est lu dans les octets (Pillow), jamais dans un champ client.
    Ecrase une base du meme cid sans broncher (re-upload pendant le wizard).
    """
    if not _CID_RE.match(cid or ""):
        raise BaseImageError(f"character_id invalide : {cid!r}")

    b64 = _DATA_URL.sub("", (image_base64 or "").strip())
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise BaseImageError("donnees base64 illisibles")
    if not raw:
        raise BaseImageError("image vide")
    if len(raw) > MAX_BYTES:
        raise BaseImageError(
            f"image trop lourde ({len(raw) // 1024} Ko, max {MAX_BYTES // 1024 // 1024} Mo)")

    from PIL import Image
    try:
        with Image.open(io.BytesIO(raw)) as im:
            im.verify()
            fmt = (im.format or "").upper()
    except Exception:  # noqa: BLE001 — Pillow leve des types varies
        raise BaseImageError("ces donnees ne sont pas une image lisible")
    ext = _FORMAT_EXT.get(fmt)
    if not ext:
        raise BaseImageError(f"format {fmt or '?'} non gere (png, jpeg ou webp)")

    name = frozen_name(cid, ext)
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    (COMFY_INPUT / name).write_bytes(raw)
    return name


# ------------------------------------------------------- base GENEREE (5b-ii)
def _synthetic_cfg(pack):
    """cfg minimal pour WorkflowRunner AVANT qu'un personnage n'existe : les
    defauts du pack + le graphe du pack. Pas de bloc `identity` — le mode
    base_portrait bypasse le verrou et saute identity.apply()."""
    dft = universe.load_character_defaults(pack)
    return {
        "comfy_url": dft.get("comfy_url", "http://127.0.0.1:8188"),
        "workflow": universe.workflow(pack),
        "preset": dict(dft.get("preset") or {}),
        "formats": dict(dft.get("formats") or {}),
        "export_sizes": dict(dft.get("export_sizes") or dft.get("formats") or {}),
        "identity": {},
    }


def _base_prompt(pack, output_style, world):
    parts = [BASE_PROMPT]
    for extra in (universe.style_effect(pack, output_style).get("prompt_add"),
                  worlds.assets(world).get("prompt_add")):
        extra = (extra or "").strip()
        if extra:
            parts.append(extra)
    return ", ".join(parts)


def _check_choices(cid, character_type, output_style, world):
    """Memes garde-fous que create_character, formules en BaseImageError pour
    que la route les rende en 400. Rend le pack resolu."""
    if not _CID_RE.match(cid or ""):
        raise BaseImageError(f"character_id invalide : {cid!r}")
    if (OFM / "CHARACTERS" / cid).is_dir():
        raise BaseImageError(f"le personnage {cid!r} existe deja")
    try:
        pack = universe.resolve(character_type, output_style)
    except universe.UnresolvedPackError as e:
        raise BaseImageError(str(e))
    if output_style not in universe.style_names(pack):
        raise BaseImageError(f"style {output_style!r} absent du pack {pack!r}")
    if not worlds.exists(world):
        raise BaseImageError(f"monde inconnu : {world!r}")
    try:
        worlds.assert_compatible(world, universe.model_family(pack))
    except worlds.IncompatibleWorldError as e:
        raise BaseImageError(str(e))
    return pack


def generate(cid, character_type, output_style, world, n=4, seed=None):
    """Met N portraits de base en file chez ComfyUI (verrou d'identite bypasse,
    aucune reference n'existe encore). Rend tout de suite : les jobs tournent
    en asynchrone, `candidates()` en suit l'avancee. GPU requis.
    """
    pack = _check_choices(cid, character_type, output_style, world)
    n = max(1, min(int(n or 4), MAX_CANDIDATES))
    cfg = _synthetic_cfg(pack)
    prompt = _base_prompt(pack, output_style, world)
    fmt = "4:5" if "4:5" in cfg["formats"] else next(iter(cfg["formats"]), "1:1")
    base_seed = int(seed) if seed is not None else random.randint(1, 2 ** 48)

    from runner.comfy import WorkflowRunner       # tardif : evite d'importer
    try:                                          # tout le runner au chargement
        runner = WorkflowRunner(cfg, character_id=cid, universe_id=pack,
                                style_name=output_style, base_portrait=True)
    except OSError as e:
        raise BaseImageError(f"ComfyUI injoignable ({cfg['comfy_url']}) : {e}")

    out = []
    for i in range(n):
        s = base_seed + i
        api = runner.api_for({"prompt": prompt, "format": fmt, "seed": s,
                              "scene": "base", "overrides": {}, "pose": None},
                             batch_id="_BASE")
        pid, err = runner.queue(api)
        if err:
            raise BaseImageError(f"ComfyUI a refuse le graphe de base : {err[:300]}")
        out.append({"seed": s, "prompt_id": pid})
    return {"pack": pack, "prompt": prompt, "format": fmt, "candidates": out}


def _comfy_url(pack):
    return _synthetic_cfg(pack)["comfy_url"]


def _poll_one(url, prompt_id):
    try:
        with urllib.request.urlopen(
                f"{url.rstrip('/')}/history/{prompt_id}", timeout=15) as r:
            hist = json.load(r)
    except Exception as e:  # noqa: BLE001
        return {"state": "error", "detail": f"history injoignable : {e}"}
    if prompt_id not in hist:
        return {"state": "pending"}
    entry = hist[prompt_id]
    errs = [m for m in entry.get("status", {}).get("messages", [])
            if m[0] == "execution_error"]
    if errs:
        d = errs[0][1]
        return {"state": "error",
                "detail": f"{d.get('node_type')}: {d.get('exception_message', '')[:200]}"}
    imgs = [im for o in entry.get("outputs", {}).values()
            for im in o.get("images", []) if im.get("type") == "output"]
    if not imgs:
        return {"state": "pending"}
    im = imgs[-1]                                 # apres FaceDetailer/upscale
    rel = f"{im.get('subfolder', '')}/{im['filename']}".replace("\\", "/").lstrip("/")
    return {"state": "ready", "file": rel}


def candidates(pack, items):
    """items : [{seed, prompt_id}] rendu par generate(). Rend l'etat de chacun
    (pending / ready+file / error) sans bloquer."""
    url = _comfy_url(pack)
    res = []
    for it in items or []:
        pid = it.get("prompt_id")
        st = _poll_one(url, pid) if pid else {"state": "error", "detail": "prompt_id manquant"}
        res.append({"seed": it.get("seed"), "prompt_id": pid, **st})
    return res


def _safe_output_path(rel):
    root = COMFY_OUTPUT.resolve()
    p = (COMFY_OUTPUT / (rel or "").replace("\\", "/").lstrip("/")).resolve()
    if root not in p.parents and p != root:
        raise BaseImageError("chemin hors de output/")
    return p


def candidate_bytes(rel):
    """Octets d'un candidat, pour l'apercu dans le wizard. Chemin borne a
    output/ (jamais une lecture arbitraire du disque)."""
    p = _safe_output_path(rel)
    if not p.is_file():
        raise BaseImageError("candidat introuvable")
    return p.read_bytes()


def freeze(cid, rel_output_file):
    """Gele un candidat : le copie de ComfyUI/output/<rel> vers
    ComfyUI/input/<CID>_BASE.<ext>. Rend le nom (config.json/base_gelee)."""
    if not _CID_RE.match(cid or ""):
        raise BaseImageError(f"character_id invalide : {cid!r}")
    src = _safe_output_path(rel_output_file)
    if not src.is_file():
        raise BaseImageError("candidat introuvable sous output/")
    ext = src.suffix.lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        raise BaseImageError(f"extension inattendue : {ext!r}")
    name = frozen_name(cid, ".jpg" if ext == ".jpeg" else ext)
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, COMFY_INPUT / name)
    return name
