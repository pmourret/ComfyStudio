"""Payload shapes of the image module (ex `routes/vignettes.py`).

Only the two POST routes have a JSON payload — `/img` and `/img/pose` serve
raw bytes and take everything on the query string.
"""
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PoseExtractRequest(BaseModel):
    """A photo sent by the user, to be turned into an OpenPose skeleton.

    THE ONLY WEB ENTRY POINT WHERE A REAL PHOTOGRAPH OF A THIRD PARTY CAN
    ARRIVE. `AUTOMATION/pose_tools.py` guarantees it is never persisted: only
    the skeleton reaches the disk.

    base64 inside a JSON body, never `multipart/form-data` — see api/security.py
    for why that is a consequence of the origin guard and not an oversight. The
    ceiling is `ss.TAILLE_MAX_PHOTO` (20 MB before encoding).
    """
    model_config = ConfigDict(extra="allow")

    data_base64: str = ""
    filename: str = "photo.png"


class PoseExtractResponse(BaseModel):
    """`name` is the skeleton written to INPUTS/POSE/, which a scene may then
    reference by that file name."""
    ok: bool
    name: str


class PoseDeleteRequest(BaseModel):
    """Removes a skeleton from the bank. Touches nothing else: a scene still
    referencing it loses it silently at file level — `validate_scene_bank` will
    report it on the next save of scenes.json (« squelette introuvable »)."""
    model_config = ConfigDict(extra="allow")

    name: str = ""


class ImageNotFound(BaseModel):
    """404 of a byte-serving route.

    A blunt 404 on purpose: the file is not in THIS character's tree. Never a
    lookup in another tree, even if the name exists there — that fallback was
    the isolation bug of 29/08/2026.

    Under aiohttp this came out as bare text (`raise web.HTTPNotFound()`); it is
    JSON now, like every other response (AUDIT §5.4). Nothing reads it: these
    URLs sit in `<img src>`.
    """
    ok: bool = False
    erreur: str
