"""Images et miniatures (.claude/rules/backend.md).

/img, /img/pose, /api/pose/extract, /api/pose/delete. `/static/*` reste
enregistre directement dans web/app.py (web.static, pas un handler ici).
"""
import asyncio

from aiohttp import web

import shared_state as ss
import pose_tools

routes = web.RouteTableDef()


@routes.get("/img")
async def serve_image(request):
    bucket = request.query.get("bucket", "OK")
    space = request.query.get("space", "lena")
    name = request.query.get("name", "")
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom invalide")
    path = ss.bucket_dir(bucket, space) / name
    if not path.exists():
        raise web.HTTPNotFound()
    if request.query.get("thumb"):
        tdir = ss.THUMBS / space / bucket
        tdir.mkdir(parents=True, exist_ok=True)
        thumb = tdir / (path.stem + ".jpg")
        if not thumb.exists() or thumb.stat().st_mtime < path.stat().st_mtime:
            async with ss.VIGNETTES:
                # re-teste sous le verrou : la grille demande 200 vignettes d'un
                # coup, plusieurs requetes visent souvent le meme fichier
                if (not thumb.exists()
                        or thumb.stat().st_mtime < path.stat().st_mtime):
                    await asyncio.get_running_loop().run_in_executor(
                        None, ss._faire_vignette, path, thumb)
        path = thumb
    return web.FileResponse(path)


@routes.get("/img/pose")
async def serve_pose(request):
    """Vignette d'un squelette de INPUTS/POSE/, pour le selecteur de la carte
    de scene. Pas de bucket ici — c'est un dossier plat, pas un tri — donc pas
    le meme chemin que serve_image. Fichiers petits (~50 Ko, fond transparent) :
    aucun besoin de vignette redimensionnee."""
    name = request.query.get("name", "")
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom invalide")
    path = pose_tools.POSE_DIR / name
    if not path.exists():
        raise web.HTTPNotFound()
    return web.FileResponse(path)


@routes.post("/api/pose/extract")
async def api_pose_extract(request):
    """Photo envoyee par l'utilisateur -> squelette OpenPose, vers INPUTS/POSE/.

    Seul point d'entree web ou une photo reelle de tiers peut arriver — voir
    AUTOMATION/pose_tools.py, qui garantit qu'elle ne persiste jamais.
    """
    body = await request.json()
    b64 = body.get("data_base64") or ""
    nom = (body.get("filename") or "photo.png").strip()
    if not b64:
        return web.json_response({"ok": False, "erreur": "aucune image reçue"},
                                 status=400)
    try:
        import base64
        data = base64.b64decode(b64, validate=True)
    except Exception:
        return web.json_response({"ok": False, "erreur": "image mal encodée"},
                                 status=400)
    if len(data) > ss.TAILLE_MAX_PHOTO:
        return web.json_response(
            {"ok": False, "erreur": "image trop lourde (20 Mo max)"}, status=400)
    if not await ss.comfy_alive():
        return web.json_response({"ok": False, "erreur": "ComfyUI hors ligne"},
                                 status=503)
    try:
        squelette = await asyncio.get_running_loop().run_in_executor(
            None, pose_tools.extraire, data, nom, ss.cfg()["comfy_url"])
    except pose_tools.ExtractionError as e:
        return web.json_response({"ok": False, "erreur": str(e)}, status=400)
    ss.push_log(f"squelette extrait : {squelette}")
    return web.json_response({"ok": True, "name": squelette})


@routes.post("/api/pose/delete")
async def api_pose_delete(request):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    if not pose_tools.supprimer_pose(name):
        return web.json_response({"ok": False, "erreur": "squelette introuvable"},
                                 status=404)
    ss.push_log(f"squelette retiré : {name}")
    return web.json_response({"ok": True})
