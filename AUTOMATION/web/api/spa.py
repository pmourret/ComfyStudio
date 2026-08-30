"""Serving of the React studio (AUTOMATION/web/ui, built to ui/dist).

THE FALLBACK. React Router uses real paths, so a deep link (/app/journal, a
refresh, a pasted URL) reaches the server on a path no router declares. The
catch-all below answers the SPA document for those — but ONLY for those: an
unknown /api/* or /img path keeps its 404, in the studio's JSON shape. Serving
an HTML page there would turn a typo in a fetch into a silent parse error
instead of a readable failure.

NO BUNDLE IN THE TREE. `ui/dist` is git-ignored: a build output committed next
to its source is a second copy of it. When it is missing, the browser gets a
page that SAYS so and gives the command — never a blank screen (the rule that
governs every failure of this studio: it is said on screen).

WHAT USED TO BE HERE. Until 30/08/2026 this module also served the vanilla
frontend under `/legacy`, so that a screen not yet ported stayed reachable while
the migration ran screen by screen. The seven screens being migrated and
validated, `AUTOMATION/web/static/` is gone and so is that route.
"""
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import shared_state as ss

UI_DIST = ss.HERE / "ui" / "dist"
UI_INDEX = UI_DIST / "index.html"

# Prefixes the SPA fallback must never answer for: they belong to the API, to
# the image bytes, or to a mount that is simply missing its file.
#
# `static/` is kept although nothing is mounted there any more: a browser left
# open on the old frontend still asks for `/static/main.js`, and it must get a
# JSON 404 rather than an HTML page a <script> tag would try to parse.
API_PREFIXES = ("api/", "img", "static/", "assets/", "openapi.json", "docs", "redoc")

_BUILD_HINT = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Soulglade — frontend à construire</title>
<style>body{background:#121418;color:#e6e8ee;font:15px/1.6 system-ui,sans-serif;
margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{max-width:620px;padding:32px}h1{font-size:19px;margin:0 0 14px}
code{display:block;background:#1a1d23;border:1px solid #2e3440;border-radius:8px;
padding:12px 14px;margin:12px 0;font:12px ui-monospace,monospace;color:#c4a36a}
a{color:#c4a36a}p{color:#9aa3b2}</style></head><body><main>
<h1>Le frontend n'est pas construit</h1>
<p>Le studio est lancé, l'API répond — il manque seulement le bundle de
l'interface, qui n'est pas versionné (il se reconstruit).</p>
<code>python AUTOMATION/tools/toolchain.py install
python AUTOMATION/tools/toolchain.py build</code>
<p>Puis recharge cette page. La documentation d'API reste disponible sur
<a href="/docs">/docs</a>.</p>
</main></body></html>"""


def mount_frontend(app):
    """Wire the studio onto the application.

    Called LAST in the assembly: every real route is already registered, so the
    catch-all can only see what nothing else claimed.
    """
    # Built assets, hashed filenames: they can be cached hard by the browser,
    # and Vite renames them on every content change.
    if (UI_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=UI_DIST / "assets"), name="ui-assets")
    app.include_router(_router())


def _router() -> APIRouter:
    router = APIRouter(include_in_schema=False)

    # EVERY method, not just GET. A GET-only catch-all still MATCHES the path
    # for a POST, and Starlette then answers 405 Method Not Allowed — so
    # `POST /api/nsfw/stop`, a route deliberately removed on 26/08/2026, stopped
    # answering 404 and started claiming it exists but refuses the verb. The
    # test that locks that deletion caught it. Owning every method here means
    # this handler decides the status, and a removed route stays removed.
    @router.api_route("/{full_path:path}",
                      methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"])
    async def spa(request: Request, full_path: str):
        # The SPA document answers a NAVIGATION only. Anything else — an unknown
        # /api/* path, a write to a route that no longer exists — comes back in
        # the studio's error shape, never as an HTML page handed to something
        # that awaits JSON.
        if full_path.startswith(API_PREFIXES) or request.method not in ("GET", "HEAD"):
            return JSONResponse({"ok": False, "erreur": "route inconnue"}, status_code=404)
        if not UI_INDEX.is_file():
            return HTMLResponse(_BUILD_HINT, status_code=503)
        return FileResponse(UI_INDEX)

    return router
