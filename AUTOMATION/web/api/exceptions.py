"""The single request-rejection exception of the backend.

Kept in a module of its own, with no project import at all: `shared_state`
raises it from `bad_request()`, while `api.errors` — which renders it — needs
`shared_state` for its log. Putting the class in either of those two modules
would close an import loop.
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
