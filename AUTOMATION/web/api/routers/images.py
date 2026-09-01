"""Image bytes, thumbnails, pose skeletons.

Port of `routes/vignettes.py` — same 4 URLs, same bodies, same status codes.
Plus the pose EDITOR's own routes (2026-09-02), added at the end of this
file: keypoints/presets are JSON, not bytes, but they live here with the
rest of the pose bank rather than a new router for four routes.

    /img                serves an image of a sorting bucket (thumbnail on demand)
    /img/pose           serves a pose skeleton from INPUTS/POSE/
    /api/pose/extract   a photo -> an OpenPose skeleton
    /api/pose/delete    removes a skeleton
    /api/pose/keypoints the editable frame behind a skeleton PNG
    /api/pose/presets   starter templates for a pose made from scratch
    /api/pose/preset    the frame of one starter template
    /api/pose/save      renders + writes an edited or brand-new skeleton

`/static/*` is not here: it is mounted in api/main.py, with the rest of the
assembly, exactly as `web.static` was registered in web/app.py.
"""
import asyncio
import base64
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, JSONResponse

import env_config
import pose_tools
import shared_state as ss

from ..dependencies import RequiredCharacterId
from ..schemas.common import ActionResponse, ERROR_RESPONSES
from ..schemas.images import (
    ImageNotFound, PoseDeleteRequest, PoseExtractRequest, PoseExtractResponse,
    PoseSaveRequest, PoseSaveResponse, PosePresetsResponse,
)

router = APIRouter(responses=ERROR_RESPONSES)

_IMAGE_RESPONSES = {
    200: {"content": {"image/png": {}, "image/jpeg": {}},
          "description": "Octets de l'image"},
    404: {"model": ImageNotFound, "description": "Absente de l'arbre du personnage"},
}


def _not_found(message):
    return JSONResponse({"ok": False, "erreur": message}, status_code=404)


@router.get("/img", response_class=FileResponse, responses=_IMAGE_RESPONSES,
            summary="Octets d'une image de tri")
async def serve_image(
        character_id: RequiredCharacterId,
        bucket: str = Query("OK", description="OK, A_REVOIR, REJET, SANS_VISAGE, ARCHIVE"),
        space: Optional[str] = Query(None, description="sfw (défaut) ou nsfw"),
        name: str = Query("", description="Nom de fichier, motif SAFE_NAME"),
        thumb: Optional[str] = Query(
            None, description="Non vide : servir la vignette 420×560 au lieu de "
                              "l'original. N'importe quelle valeur non vide "
                              "compte, « 0 » y compris."),
        v: Optional[str] = Query(
            None, description="Jeton de cache, IGNORÉ par le serveur. Voir la "
                              "note dans le code : il ne sert qu'à l'URL.")):
    """Bytes of an image from a sorting bucket. `character=` is MANDATORY here.

    This route serves character data: leaving it a default means serving Léna's
    images to whoever did not ask for them — which is exactly what happened
    before 29/08/2026, where Abyssiaelle's Review screen displayed Léna's
    gallery. A name that is not in the requested character's tree comes out as
    404, never through a fallback onto another tree.

    ┌── COUPLING TO PRESERVE — migration brief §4.1, AUDIT §5.6.1 ────────────┐
    │ `v` IS DECLARED SO THAT IT IS IGNORED, AND THAT IS THE WHOLE POINT.     │
    │                                                                         │
    │ `v` is the mtime of the bytes, produced by /api/gallery (see            │
    │ routers/review.py, same box) and appended to the URL by the single      │
    │ image-URL builder of the frontend, `imgUrl()` in static/api.js. The     │
    │ server has never read it and must never start: it exists solely to      │
    │ make the URL change when the bytes change.                              │
    │                                                                         │
    │ WHY IT EXISTS. Since the editor learned to overwrite its source         │
    │ (`/api/edit/save?remplacer`, F3.3), one file name can designate two     │
    │ different images. Without `v` in the URL the browser re-serves its      │
    │ cached copy and the screen shows the image from before, on a file that  │
    │ has changed.                                                            │
    │                                                                         │
    │ THREE WAYS TO BREAK IT, all silent — no error, just a stale image:      │
    │   - rejecting the parameter as unknown (a strict query model would);    │
    │   - reading it, and serving from a cache keyed on it;                   │
    │   - changing its format, or emitting it where /api/gallery does not     │
    │     (STATE.recent carries no `v`, and `imgUrl` then omits it — the URL  │
    │     stays character-for-character the one from before).                 │
    │                                                                         │
    │ It is declared here rather than left implicit so /docs states the       │
    │ contract, and so nobody "cleans up" an undeclared parameter.            │
    └─────────────────────────────────────────────────────────────────────────┘
    """
    cid = character_id
    space = ss.space_id(space)
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom invalide")
    path = ss.bucket_dir(bucket, space, cid) / name
    if not path.exists():
        return _not_found("image introuvable")
    if thumb:
        tdir = ss.THUMBS / cid / space / bucket
        tdir.mkdir(parents=True, exist_ok=True)
        thumbnail = tdir / (path.stem + ".jpg")
        if not thumbnail.exists() or thumbnail.stat().st_mtime < path.stat().st_mtime:
            async with ss.VIGNETTES:
                # re-test under the lock: the grid asks for 200 thumbnails at
                # once, and several requests often target the same file
                if (not thumbnail.exists()
                        or thumbnail.stat().st_mtime < path.stat().st_mtime):
                    await asyncio.get_running_loop().run_in_executor(
                        None, ss._faire_vignette, path, thumbnail)
        path = thumbnail
    return FileResponse(path)


@router.get("/img/pose", response_class=FileResponse, responses=_IMAGE_RESPONSES,
            summary="Squelette de pose")
async def serve_pose(
        name: str = Query("", description="Nom de fichier, motif SAFE_NAME")):
    """Thumbnail of a skeleton from INPUTS/POSE/, for the scene card's pose
    picker. No bucket here — it is a flat folder, not a sorting tree — so not
    the same path as `serve_image`. Files are small (~50 KB, transparent
    background): no resized thumbnail needed.

    No `character=` either, and that is not an oversight: the pose bank is
    shared by every character, like INPUTS/REALISME/ (AUDIT §5.2 lists the two
    global remainders).
    """
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom invalide")
    path = pose_tools.POSE_DIR / name
    if not path.exists():
        return _not_found("squelette introuvable")
    return FileResponse(path)


@router.post("/api/pose/extract", response_model=PoseExtractResponse,
             responses={503: {"description": "ComfyUI hors ligne"}},
             summary="Photo -> squelette OpenPose")
async def extract_pose(payload: PoseExtractRequest):
    """A photo sent by the user -> an OpenPose skeleton, into INPUTS/POSE/.

    The only web entry point where a real photograph of a third party can
    arrive — see AUTOMATION/pose_tools.py, which guarantees it is never
    persisted.

    The extraction runs in an executor: `pose_tools.extraire` talks to ComfyUI
    with blocking urllib, and a blocking call in an async handler freezes the
    whole server (the 2005 ms measured on 24/08, see `comfy_alive`).
    """
    b64 = payload.data_base64 or ""
    name = payload.filename.strip()
    if not b64:
        return JSONResponse({"ok": False, "erreur": "aucune image reçue"},
                            status_code=400)
    try:
        data = base64.b64decode(b64, validate=True)
    except Exception:
        return JSONResponse({"ok": False, "erreur": "image mal encodée"},
                            status_code=400)
    if len(data) > ss.TAILLE_MAX_PHOTO:
        return JSONResponse({"ok": False, "erreur": "image trop lourde (20 Mo max)"},
                            status_code=400)
    if not await ss.comfy_alive():
        return JSONResponse({"ok": False, "erreur": "ComfyUI hors ligne"},
                            status_code=503)
    try:
        skeleton = await asyncio.get_running_loop().run_in_executor(
            None, pose_tools.extraire, data, name, env_config.comfy_url())
    except pose_tools.ExtractionError as e:
        return JSONResponse({"ok": False, "erreur": str(e)}, status_code=400)
    ss.push_log(f"squelette extrait : {skeleton}")
    return {"ok": True, "name": skeleton}


@router.post("/api/pose/delete", response_model=ActionResponse,
             response_model_exclude_unset=True,
             responses={404: {"description": "Squelette introuvable"}},
             summary="Retirer un squelette")
async def delete_pose(payload: PoseDeleteRequest):
    name = payload.name.strip()
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    if not pose_tools.supprimer_pose(name):
        return JSONResponse({"ok": False, "erreur": "squelette introuvable"},
                            status_code=404)
    ss.push_log(f"squelette retiré : {name}")
    return {"ok": True}


@router.get("/api/pose/keypoints", summary="Points-clés d'un squelette")
async def get_pose_keypoints(
        name: str = Query("", description="Nom de fichier PNG, motif SAFE_NAME")) -> dict:
    """The editable frame behind a skeleton PNG (`pose_tools.charger_points`).

    No `response_model`: this layer relays a shape it does not own — same
    reasoning as `/api/config` (a model here would silently drop a key a
    future extraction adds). No `character=` either, same as every other
    pose route: the bank is shared by every character.
    """
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom invalide")
    try:
        return pose_tools.charger_points(name)
    except pose_tools.ExtractionError as e:
        return JSONResponse({"ok": False, "erreur": str(e)}, status_code=404)


@router.get("/api/pose/presets", response_model=PosePresetsResponse,
            summary="Gabarits de pose disponibles")
async def get_pose_presets():
    """Starter templates for a pose made from scratch — entirely synthetic
    coordinates (`AUTOMATION/pose_presets/`), never a real photo."""
    return {"presets": pose_tools.presets_disponibles()}


@router.get("/api/pose/preset", summary="Points-clés d'un gabarit")
async def get_pose_preset(
        nom: str = Query("", description="Nom du gabarit, sans extension")) -> dict:
    """Same shape as `/api/pose/keypoints`, for a preset instead of a saved
    pose — the editor's "new pose from scratch" flow loads this, then
    behaves exactly as if editing any other frame."""
    try:
        return pose_tools.charger_preset(nom)
    except pose_tools.ExtractionError as e:
        return JSONResponse({"ok": False, "erreur": str(e)}, status_code=404)


@router.post("/api/pose/save", response_model=PoseSaveResponse,
             summary="Enregistrer un squelette édité ou neuf")
async def save_pose(payload: PoseSaveRequest):
    """Renders `keypoints` locally (`pose_render` — no ComfyUI, no GPU, no
    job queue) and writes the PNG+JSON pair. See `PoseSaveRequest` for the
    name contract (plain overwrite when given, brand-new — "save as new"
    while editing an existing pose included — when omitted)."""
    name = (payload.name or "").strip()
    if name and not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    if not payload.keypoints.get("people"):
        ss.bad_request("points-clés manquants ou illisibles")
    written = pose_tools.enregistrer_points(payload.keypoints, nom=(name or None))
    ss.push_log(f"squelette enregistré : {written}")
    return {"ok": True, "name": written}
