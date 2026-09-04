"""Advanced (Lightroom-style) photo editor — layer persistence only.

    GET  /api/photo-editor/layers   the photo's saved layer stack (or the
                                     single default base layer, never written)
    POST /api/photo-editor/save     persist the layer stack AND the already-
                                     composited bytes (Canvas2D, client-side —
                                     see services/photo_editor.py's own note
                                     on why this pass has no server render)

Both are character-scoped through `RequiredCharacterId`: `bucket_dir` never
leaves this character's tree (`tests/test_photo_editor_isolation.py`), same
mechanism `/api/edit/save` and `/api/expression/*` already use.
"""
import base64
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

import runner as lb
import shared_state as ss

from ..dependencies import RequiredCharacterId
from ..schemas.common import ERROR_RESPONSES
from ..schemas.photo_editor import (
    PhotoEditorLayersResponse, PhotoEditorSaveRequest, PhotoEditorSaveResponse,
)
from ..services.journal import apply_overwrite_side_effects, record_bucket
from ..services.photo_editor import load_layers, write_layers

router = APIRouter(responses=ERROR_RESPONSES)


@router.get("/api/photo-editor/layers", response_model=PhotoEditorLayersResponse,
            responses={404: {"description": "Photo introuvable"}},
            summary="Pile de calques d'une photo (ou le calque de base par défaut)")
async def get_layers(character_id: RequiredCharacterId, bucket: str, space: str, name: str):
    try:
        layers = load_layers(character_id, bucket, space, name)
    except FileNotFoundError as e:
        return JSONResponse({"ok": False, "erreur": str(e)}, status_code=404)
    return {"layers": layers}


@router.post("/api/photo-editor/save", response_model=PhotoEditorSaveResponse,
             response_model_exclude_unset=True,
             responses={404: {"description": "Image d'origine introuvable"}},
             summary="Enregistrer la pile de calques et l'image composée")
async def save_photo_editor(payload: PhotoEditorSaveRequest, character_id: RequiredCharacterId):
    """Same copy/overwrite contract as `/api/edit/save` (`routers/review.py`
    ::save_edit), plus the layer stack sidecar written alongside. A copy
    gets its OWN sidecar (a snapshot of the stack at save time) so reopening
    it in this editor continues where the copy left off, independent of
    whatever the source's own stack does afterwards.
    """
    cid = character_id
    name = payload.name.strip()
    bucket, space = payload.bucket, ss.space_id(payload.space)
    replace = payload.remplacer
    b64 = payload.data_base64 or ""
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    if not b64:
        return JSONResponse({"ok": False, "erreur": "image vide"}, status_code=400)
    try:
        data = base64.b64decode(b64, validate=True)
    except Exception:
        return JSONResponse({"ok": False, "erreur": "image mal encodée"},
                            status_code=400)
    if len(data) > ss.TAILLE_MAX_PHOTO:
        return JSONResponse({"ok": False, "erreur": "image trop lourde (20 Mo max)"},
                            status_code=400)
    # `bucket_dir(…, cid)`: the destination is ALWAYS this character's tree,
    # same guard as `save_edit` — a `name` from elsewhere either does not
    # exist here (404 below) or cannot escape it.
    dest_dir = ss.bucket_dir(bucket, space, cid)
    if not (dest_dir / name).exists():
        return JSONResponse({"ok": False, "erreur": "image d'origine introuvable"},
                            status_code=404)

    if replace:
        (dest_dir / name).write_bytes(data)
        write_layers(dest_dir / name, payload.layers)
        exported = apply_overwrite_side_effects(dest_dir / name, name, bucket, space, cid)
        ss.push_log(f"{name} (éditeur avancé) remplacée par sa version composée"
                    + (f" (export {exported} refait)" if exported else ""))
        return {"ok": True, "name": name, "remplace": True, "export": exported}

    final = lb.nom_libre(f"{Path(name).stem}_edit", dest_dir.parent)
    (dest_dir / final).write_bytes(data)
    write_layers(dest_dir / final, payload.layers)
    # Same orphan-avoidance reasoning as save_edit's own copy path: a new
    # file in a bucket with no row in the database is invisible to
    # test_coherence_base as anything but a stray write.
    record_bucket(final, bucket, space, cid, source=name)
    ss.push_log(f"{final} enregistrée (édition avancée de {name})")
    return {"ok": True, "name": final, "remplace": False}
