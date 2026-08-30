"""FastAPI layer of the studio backend (migration from aiohttp, 30/08/2026).

Deliberately import-free: `shared_state` imports `api.exceptions`, and
`api.errors` imports `shared_state` back. Anything imported here would close
that loop at package-import time.

Layout:
    exceptions.py   BadRequest — the only exception `shared_state` may raise
    errors.py       exception handlers: every response is JSON, never HTML
    security.py     LocalOriginGuardMiddleware — the auth substitute
    dependencies.py request-scoped dependencies (character id, spaces...)
    schemas/        one Pydantic model per payload shape actually exchanged
    routers/        one router per functional module, same split as before
    main.py         create_app() — assembly only
"""
