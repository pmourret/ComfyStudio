"""The request-rejection exceptions of the backend.

Kept in a module of its own, with no project import at all: `shared_state`
raises `BadRequest` from `bad_request()`, while `api.errors` — which renders it
— needs `shared_state` for its log. Putting the classes in either of those two
modules would close an import loop.

Both subclass `HTTPException` on purpose. The handler installed for it in
`api/errors.py` hands `detail` over untouched, so raising one of these from
anywhere — including from inside an ASGI `receive()` callable, which is how the
body-size limit works — produces the studio's `{ok, erreur}` body with the
right status, and never FastAPI's default `{detail: ...}`.
"""
from fastapi import HTTPException


class BadRequest(HTTPException):
    """400 carrying the studio's error shape, `{ok: false, erreur: "..."}`.

    The frontend (static/api.js) parses a JSON body on EVERY response, success
    or failure, so it can raise a toast instead of choking on an unhandled
    promise rejection. A plain-text or HTML rejection reaches the screen as
    "réponse invalide du serveur (400)", which says nothing.

    The message is French on purpose: it is displayed to the user verbatim
    (AUDIT §5.5). Only the code around it is English.
    """

    def __init__(self, message: str):
        super().__init__(status_code=400,
                         detail={"ok": False, "erreur": message})


class BodyTooLarge(HTTPException):
    """413 raised while READING the body, once too many bytes have arrived.

    Not a header check: it fires on the bytes actually received, so a chunked
    request that declares no `Content-Length` — or declares a false one — is
    stopped exactly like any other. See `BodySizeLimitMiddleware`.

    It subclasses HTTPException so that being raised from inside an ASGI
    `receive()` still comes out as the studio's error shape: the exception
    travels up through the endpoint that was awaiting the body, and Starlette's
    exception middleware routes it to the handler in api/errors.py.
    """

    def __init__(self, limit_bytes):
        super().__init__(
            status_code=413,
            detail={"ok": False,
                    "erreur": f"corps de requête trop volumineux "
                              f"({limit_bytes // (1024 * 1024)} Mo max)"})
