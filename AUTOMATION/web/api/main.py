"""Assembly of the FastAPI application: middleware, error handlers, routers,
static files. No business logic here — the same rule `web/app.py` followed
under aiohttp.

ONE PROCESS, ONE WORKER. `shared_state.STATE`, `UNDO` and `CHECKER` (~1 GB of
InsightFace) are process globals; see the module docstring of shared_state.py
for what `--workers > 1` would break. `web/app.py` hands the app OBJECT to
`uvicorn.run`, which makes the multi-worker mode technically unavailable — that
is the enforcement, not just a convention.

OPENAPI. /docs (Swagger) and /openapi.json are served in development. This is
the first time the API contract exists as something machine-readable: it used
to live in docstrings and in the JS that consumed it (AUDIT §7.8).
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import shared_state as ss

from .errors import install_error_handlers
from .routers import bank, state
from .security import LocalOriginGuardMiddleware

DESCRIPTION = """
Backend local du studio Soulglade. Aucune authentification : le serveur
n'accepte que ce qui vient de lui-même (voir `api/security.py`).

**Conventions transverses**

* presque toute route lit `?character=<id>` et le valide avant de toucher au
  disque ; `/img` l'exige (pas de repli sur un personnage par défaut) ;
* toute réponse porte un corps JSON, succès comme échec. Une erreur a la forme
  `{"ok": false, "erreur": "<texte français destiné à l'écran>"}` ;
* les uploads voyagent en base64 dans un corps JSON, jamais en
  `multipart/form-data` — conséquence voulue du garde d'origine.
"""


def create_app() -> FastAPI:
    app = FastAPI(
        title="Soulglade — API du studio",
        description=DESCRIPTION,
        version="1.0.0",
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
    )

    # Order matters and mirrors the aiohttp middleware list, which was
    # [garde_erreurs, garde_origine] — errors outermost, origin guard inside.
    # Here the error handlers sit on Starlette's own exception middlewares,
    # which already wrap everything below, so only the guard is registered as a
    # middleware. It must stay the outermost user middleware: it has to answer
    # 415 BEFORE FastAPI reads and validates any body.
    app.add_middleware(LocalOriginGuardMiddleware)
    install_error_handlers(app)

    app.include_router(state.router)
    app.include_router(bank.router)

    # `/static` was mounted in web/app.py under aiohttp; it belongs to the
    # assembly either way. No build step, no bundler — the files are served
    # exactly as they are written (.claude/rules/frontend.md).
    app.mount("/static", StaticFiles(directory=ss.HERE / "static"), name="static")
    return app


app = create_app()
