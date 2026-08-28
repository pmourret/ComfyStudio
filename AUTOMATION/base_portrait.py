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
import re

import env_config

COMFY_INPUT = env_config.comfyui_input()

MAX_BYTES = 20 * 1024 * 1024
_FORMAT_EXT = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}
_CID_RE = re.compile(r"[a-z][a-z0-9_-]*$")
_DATA_URL = re.compile(r"^data:image/[a-z+]+;base64,", re.I)


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
