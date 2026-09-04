"""QC, review, judgements, export.

Port of `routes/tri.py` — same 7 URLs, same JSON bodies, same status codes.

    /api/gallery     content of one sorting folder
    /api/action      the human sort: valider / revoir / rejeter / archiver
    /api/undo        undoes the last sort OF THIS CHARACTER
    /api/delete      definitive removal, outside UNDO
    /api/flag        human judgement on realism
    /api/mesurer     catches up missing measurements, in batches
    /api/edit/save   saves a browser-side retouch

THESE ARE THE HANDLERS THAT MOVE AND DELETE FILES — the only places in the
application where a mistake costs an image. Every guard below carries a dated
incident; none of them moved in the migration.
"""
import asyncio
import base64
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

import mesures as mes
import runner as lb
import shared_state as ss

from ..dependencies import RequiredCharacterId
from ..schemas.common import ActionResponse, ERROR_RESPONSES
from ..schemas.review import (
    DeleteRequest, EditSaveRequest, EditSaveResponse, FlagRequest, FlagResponse,
    GalleryResponse, MeasureRequest, MeasureResponse, SortRequest, SortResponse,
    UndoResponse,
)
from ..services.journal import (
    apply_overwrite_side_effects, export_image, nsfw_journal_index, record_bucket,
    remove_export,
)

router = APIRouter(responses=ERROR_RESPONSES)

# Keys are the WIRE CONTRACT (the `action` the frontend sends, in French);
# values are the bucket names on disk. Neither may be translated.
ACTIONS = {"valider": "OK", "revoir": "A_REVOIR", "rejeter": "REJET",
           "archiver": "ARCHIVE"}




@router.get("/api/gallery", response_model=GalleryResponse,
            summary="Contenu d'un dossier de tri")
async def get_gallery(character_id: RequiredCharacterId, bucket: str = "OK",
                      space: str = None):
    """Content of one sorting folder — of THIS character, and of it alone.

    ┌── COUPLING TO PRESERVE — migration brief §4.1, AUDIT §5.6.1 ────────────┐
    │ THIS IS WHERE THE `v` TOKEN IS BORN. `"v": int(f.stat().st_mtime)` on   │
    │ every item, and nowhere else in the API.                                │
    │                                                                         │
    │ The frontend's single image-URL builder — `imgUrl()` in static/api.js — │
    │ appends it to /img, which ACCEPTS AND IGNORES it (see routers/images.py,│
    │ same box). It is pure cache-busting: since the editor learned to        │
    │ overwrite its source (/api/edit/save?remplacer, F3.3), one file name    │
    │ can designate two different images, and without a changing URL the      │
    │ browser re-serves the old bytes from its cache.                         │
    │                                                                         │
    │ THE FORMAT IS PART OF THE CONTRACT: an INTEGER, the mtime in seconds.   │
    │ Not a float, not an ISO date, not a hash. Emitting it under another     │
    │ name, another type, or dropping it, breaks the cache silently — no      │
    │ error anywhere, just a stale image on screen after an overwrite.        │
    │                                                                         │
    │ Note it is deliberately ABSENT from STATE.recent (routers/production.py)│
    │ — `imgUrl` then omits it and the URL stays character-for-character the  │
    │ one from before. Do not "harmonise" that.                               │
    └─────────────────────────────────────────────────────────────────────────┘
    """
    cid = character_id
    space = ss.space_id(space)
    d = ss.bucket_dir(bucket, space, cid)
    files = sorted(d.glob("*.png"), key=lambda f: f.stat().st_mtime,
                   reverse=True) if d.exists() else []
    index = (nsfw_journal_index(cid) if space == "nsfw"
             else ss.journal_index(cid))
    store = mes.charger()
    # Counted over the WHOLE folder, not the 200 displayed: the button
    # announces what /api/mesurer will really have to do, and that one walks
    # everything. The two figures contradicted each other past 200 images.
    unmeasured = sum(1 for f in files if "nettete" not in store.get(f.name, {}))
    items = []
    for f in files[:200]:
        row = index.get(f.name, {})
        m = store.get(f.name, {})
        items.append({
            "name": f.name, "bucket": bucket, "space": space,
            "score": row.get("score_identite", "") or (
                f"{m['identite']:.3f}" if isinstance(m.get("identite"), float) else ""),
            "scene": row.get("scene", ""), "categorie": row.get("categorie", ""),
            "format": row.get("format", ""), "seed": row.get("seed", ""),
            "date": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d/%m %H:%M"),
            # Version of the BYTES, not of the row — see the box above.
            "v": int(f.stat().st_mtime),
            "prompt": row.get("prompt", ""),
            "nettete": m.get("nettete"), "texture": m.get("texture_visage"),
            "fond": m.get("bruit_fond"), "flag": m.get("flag"),
        })
    entries = list(store.values())
    refs = [e for e in entries if e.get("role") == "reference"]
    return {
        "items": items, "sans_mesure": unmeasured,
        "references": {"mesurees": len(refs), "total": len(mes.fichiers_reference())},
        # calibration bands: derived from the images judged convincing, never
        # written as constants. None until there are enough judgements.
        "bandes": {c: mes.bande(entries, c)
                   for c in ("nettete", "texture_visage", "bruit_fond")},
        "juges": sum(1 for e in entries if e.get("flag"))}


@router.post("/api/flag", response_model=FlagResponse,
             summary="Jugement humain de réalisme")
async def set_flag(payload: FlagRequest, character_id: RequiredCharacterId):
    """Human judgement on realism. Independent of sorting: it moves nothing.

    Took no character parameter at all until 2026-09-01 — the DB write this
    triggers (`mesures.poser_flag` -> `base.enregistrer_image`) silently
    recorded every judgement, for every character, under one specific
    character_id, because that was the only default `enregistrer_image` had.
    """
    name = payload.name
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    flag = payload.flag
    if flag not in (None, "ok", "ia"):
        return JSONResponse({"ok": False, "erreur": "flag inconnu"}, status_code=400)
    mes.poser_flag(name, flag, character_id)
    return {"ok": True, "flag": flag}


@router.post("/api/mesurer", response_model=MeasureResponse,
             response_model_exclude_unset=True,
             responses={409: {"description": "Une production tourne"}},
             summary="Rattraper les mesures manquantes, par paquets")
async def measure_batch(payload: MeasureRequest, character_id: RequiredCharacterId):
    """Catches up a folder's missing measurements.

    ┌── COUPLING TO PRESERVE — migration brief §4.2, AUDIT §5.6.4 ────────────┐
    │ THE BATCHED CONTRACT THAT MAKES THE FRONTEND CALL BACK IN A LOOP.       │
    │                                                                         │
    │ One InsightFace pass costs ~190 ms; measuring 200 images in a single    │
    │ request would time out. So this route does at most `lot` images (40     │
    │ hard ceiling) and returns `{ok, faites, restant}`. THE LOOP LIVES IN    │
    │ THE CLIENT: review.js calls again while `restant > 0`, with its own     │
    │ guard of 40 iterations, and repaints the button label each round.       │
    │                                                                         │
    │ DO NOT TURN THIS INTO AN EVENT-DRIVEN MODEL. It is tempting — a         │
    │ background task with progress pushed over SSE would read better. It     │
    │ would also be a different contract: the client would no longer drive    │
    │ the pace, `restant` would stop being the loop's exit condition, and     │
    │ there is no push infrastructure anywhere in this application (AUDIT     │
    │ §1.3: no WebSocket, no SSE, no long-polling — production tracking       │
    │ itself is a 1.5 s REST poll).                                           │
    │                                                                         │
    │ Three things are load-bearing and must not move:                        │
    │   - `restant` is what REMAINS AFTER this call, computed on the whole    │
    │     folder — not a percentage, not a total;                             │
    │   - `{ok: true, faites: 0, restant: 0}` on an empty or finished folder, │
    │     which is what ends the loop on the first call;                      │
    │   - the 409 while a batch runs, which the client shows as a toast and   │
    │     treats as a loop exit (`if (!r.ok) break`).                         │
    └─────────────────────────────────────────────────────────────────────────┘

    Everything runs in a thread — an async handler must never block the loop
    (see the comment on `comfy_alive`).
    """
    if ss.STATE["running"]:
        # InsightFace runs on the CPU while ComfyUI holds the GPU: measuring
        # during a production slows the batch down for nothing, and the
        # unmeasured images will still be there at the end anyway.
        return JSONResponse(
            {"ok": False, "erreur": "une production tourne — mesure après"},
            status_code=409)
    cid = character_id
    bucket = payload.bucket
    space = ss.space_id(payload.space)
    batch_size = max(1, min(40, int(payload.lot or 20)))
    d = ss.bucket_dir(bucket, space, cid)
    if not d.exists():
        return {"ok": True, "faites": 0, "restant": 0}

    store = mes.charger()
    todo = [f for f in sorted(d.glob("*.png"), key=lambda f: f.stat().st_mtime,
                              reverse=True)
            if "nettete" not in store.get(f.name, {})]
    refs_todo = [f for f in mes.fichiers_reference()
                 if "nettete" not in store.get(f.name, {})]
    if not todo and not refs_todo:
        return {"ok": True, "faites": 0, "restant": 0}

    checker = await asyncio.get_running_loop().run_in_executor(
        None, ss.checker_partage, ss.cfg(cid))

    chunk = todo[:batch_size]

    def work():
        # the reference corpus first: without it the bands have no scale
        if refs_todo:
            n, total = mes.mesurer_references(checker=checker)
            ss.push_log(f"corpus de reference : {n}/{total} image(s) mesurée(s)")
        for f in chunk:
            try:
                mes.mesurer(f, checker=checker)
            except Exception as e:
                ss.push_log(f"mesure impossible sur {f.name} : {e}")
        return len(chunk)

    done = await asyncio.get_running_loop().run_in_executor(None, work)
    remaining = len(todo) - done
    ss.push_log(f"realisme : {done} image(s) mesurée(s), {remaining} restante(s)")
    return {"ok": True, "faites": done, "restant": remaining}


@router.post("/api/action", response_model=SortResponse,
             responses={404: {"description": "Fichier introuvable"}},
             summary="Trier une image")
async def sort_image(payload: SortRequest, character_id: RequiredCharacterId):
    cid = character_id
    name = payload.name
    bucket, action = payload.bucket, payload.action
    space = ss.space_id(payload.space)
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    if action not in ACTIONS:
        ss.bad_request(f"action inconnue : « {action} »")
    origin = name                       # name the journal knows it under
    src = ss.bucket_dir(bucket, space, cid) / name
    if not src.exists():
        # Blunt 404: the file is not in THIS character's tree. Never a lookup in
        # another tree, even if the name exists there.
        return JSONResponse({"ok": False, "erreur": "fichier introuvable"},
                            status_code=404)
    dest_bucket = ACTIONS[action]
    dest_dir = ss.bucket_dir(dest_bucket, space, cid)
    dest_dir.mkdir(parents=True, exist_ok=True)
    final = name
    if dest_bucket != bucket:
        # Never overwrite: a homonym in the destination folder is a DIFFERENT
        # image (historical case, see lb.nom_libre). shutil.move would overwrite
        # it without a word.
        if (dest_dir / name).exists():
            final = lb.nom_libre(Path(name).stem, dest_dir.parent,
                                 Path(name).suffix)
            ss.push_log(f"{name} existait déjà dans {dest_bucket} — renommé {final}")
            mes.renommer(name, final)
        shutil.move(str(src), str(dest_dir / final))
        # the thumbnail stayed behind in the folder we left
        ss.oublier_vignette(origin, bucket, space, cid)
        src = dest_dir / final
    name = final

    exported = ""
    if action == "valider":
        exported = export_image(src, origin, space, cid)
    elif space == "sfw" and dest_bucket != "OK":
        # Taking an image out of OK must ALSO take it out of publication.
        # Without that the export folder accumulates rejected images: seen on
        # 25/08/2026, 11 JPEGs whose PNG was in REJET. Only the « annuler »
        # button cleaned up; a normal rejection did not.
        removed = remove_export(name, cid)
        if removed:
            ss.push_log(f"{name} sort de l'export ({removed} fichier(s) retire(s))")
    if dest_bucket != bucket:
        record_bucket(name, dest_bucket, space, cid,
                      previous_name=origin if name != origin else None)
        ss.UNDO.append({"name": name, "from": bucket, "to": dest_bucket,
                        "export": exported, "space": space, "journal": origin,
                        "character": cid})
        del ss.UNDO[:-50]
    ss.push_log(f"{name} → {dest_bucket}" + (f" (export {exported})" if exported else ""))
    return {"ok": True, "bucket": dest_bucket, "export": exported,
            "undo": len(ss.undo_disponible(cid))}


@router.post("/api/delete", response_model=ActionResponse,
             response_model_exclude_unset=True,
             responses={404: {"description": "Fichier introuvable"}},
             summary="Suppression définitive")
async def delete_image(payload: DeleteRequest, character_id: RequiredCharacterId):
    """DEFINITIVE removal — not a sort, not in UNDO, no way back.

    Removes the file, its thumbnail and its export copy. `journal_batch.csv`,
    `mesures.json` and `PROD/soulglade.db` stay intact: they are append-only
    histories elsewhere in the project (same reason the human judgement does
    not live in the journal), not an index of what exists on disk — a row
    pointing at a vanished file remains a true fact: that image existed, was
    scored, and was deleted.
    """
    cid = character_id
    name = payload.name
    bucket, space = payload.bucket, ss.space_id(payload.space)
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    path = ss.bucket_dir(bucket, space, cid) / name
    if not path.exists():
        return JSONResponse({"ok": False, "erreur": "fichier introuvable"},
                            status_code=404)
    path.unlink()
    ss.oublier_vignette(name, bucket, space, cid)
    removed = remove_export(name, cid) if space == "sfw" else 0
    ss.push_log(f"{name} supprimée définitivement" +
                (f" (export retiré : {removed} fichier(s))" if removed else ""))
    return {"ok": True}


@router.post("/api/edit/save", response_model=EditSaveResponse,
             response_model_exclude_unset=True,
             responses={404: {"description": "Image d'origine introuvable"}},
             summary="Enregistrer une retouche navigateur")
async def save_edit(payload: EditSaveRequest, character_id: RequiredCharacterId):
    """Saves a retouch (crop / colour / grain, browser-side).

    By default a NEW file `<name>_edit`, in the same bucket as the original:
    that is the normal gesture, the original stays comparable and separately
    deletable through `delete_image`. Neither measurement nor export happens
    automatically on that path — it is not a generation, and `measure_batch`
    is still there to score the copy.

    `remplacer: true` overwrites the source (F3.3, 30/08/2026). The frontend
    only sends it after an explicit confirmation, and it is never its primary
    button. Three consequences are handled HERE, without which the interface
    would be lying about a file that changed under it:

      - the realism MEASUREMENTS were about the old pixels: erased
        (`mes.demesurer`), the image becomes « unmeasured » again. The human
        judgement, however, is kept;
      - the publishable export (OK/sfw) is redone from the new bytes, otherwise
        the distributed JPEG stays the image from before;
      - the thumbnail is forgotten. Its timestamp would be enough to redo it,
        but `oublier_vignette` makes it certain even if the disk clock is
        coarser than the gesture.

    The generation's JOURNAL ROW is not touched: it says what the pipeline
    produced, which stays true — the file simply no longer illustrates it
    exactly. The frontend says so in its confirmation.
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
    # `bucket_dir(…, cid)`: the destination is ALWAYS the tree of the request's
    # character. A `name` coming from elsewhere cannot make us write elsewhere —
    # at worst it does not exist here, and we exit 404 just below.
    dest_dir = ss.bucket_dir(bucket, space, cid)
    if not (dest_dir / name).exists():
        return JSONResponse({"ok": False, "erreur": "image d'origine introuvable"},
                            status_code=404)
    if replace:
        (dest_dir / name).write_bytes(data)
        exported = apply_overwrite_side_effects(dest_dir / name, name, bucket, space, cid)
        ss.push_log(f"{name} remplacée par sa version éditée"
                    + (f" (export {exported} refait)" if exported else ""))
        return {"ok": True, "name": name, "remplace": True, "export": exported}
    final = lb.nom_libre(f"{Path(name).stem}_edit", dest_dir.parent)
    (dest_dir / final).write_bytes(data)
    # The copy is a NEW file in a bucket: no generation will ever register it,
    # and without this row it exists only on disk — `test_coherence_base` saw it
    # as an orphan image. `source` says which image it derives from, as for the
    # NSFW branch.
    record_bucket(final, bucket, space, cid, source=name)
    ss.push_log(f"{final} enregistrée (édition de {name})")
    return {"ok": True, "name": final, "remplace": False}


@router.post("/api/undo", response_model=UndoResponse,
             responses={400: {"description": "Rien à annuler"}},
             summary="Annuler le dernier tri de ce personnage")
async def undo_sort(character_id: RequiredCharacterId):
    """Undoes THIS CHARACTER's last sort: puts the image back in its original
    folder.

    The stack stays single (one shared state, like STATE), but we only take
    back this character's actions: without that, « annuler » from one
    character's Review moved another one's file, in a tree we are not even
    looking at.
    """
    cid = character_id
    act = next((a for a in reversed(ss.UNDO) if a.get("character") == cid), None)
    if act is None:
        return JSONResponse({"ok": False, "erreur": "rien a annuler"},
                            status_code=400)
    ss.UNDO.remove(act)
    space = ss.space_id(act.get("space"))
    src = ss.bucket_dir(act["to"], space, cid) / act["name"]
    back = ss.bucket_dir(act["from"], space, cid)
    name = act["name"]
    if src.exists():
        back.mkdir(parents=True, exist_ok=True)
        # Same guard as on the way out: a homonym in the original folder is a
        # DIFFERENT image, and shutil.move would overwrite it without a word.
        # The return path did not have the protection the outbound path takes
        # care to have.
        if (back / name).exists():
            name = lb.nom_libre(Path(name).stem, back.parent, Path(name).suffix)
            ss.push_log(f"{act['name']} existait déjà dans {act['from']} — "
                        f"renommé {name}")
            mes.renommer(act["name"], name)
        shutil.move(str(src), str(back / name))
        ss.oublier_vignette(act["name"], act["to"], space, cid)
    if act.get("export"):
        for f in ss.export_dir(cid).rglob(act["export"]):
            f.unlink(missing_ok=True)
    # Undoing a rejection must PUT the image back into publication: the
    # rejection had deleted the JPEG, and the undo left it deleted. The image
    # came back into OK without its export, with nothing to say so.
    redone = ""
    if act["from"] == "OK" and space == "sfw":
        target = back / name
        if target.exists():
            redone = export_image(target, act.get("journal", act["name"]), space, cid)
    # an undo is a sort like any other: the database must follow it, otherwise
    # it keeps the bucket of the very action we just undid
    record_bucket(name, act["from"], space, cid,
                  previous_name=act["name"] if name != act["name"] else None)
    ss.push_log(f"annule : {name} → {act['from']}"
                + (f" (export {redone} refait)" if redone else ""))
    return {"ok": True, "bucket": act["from"], "name": name,
            "export": redone, "undo": len(ss.undo_disponible(cid))}
