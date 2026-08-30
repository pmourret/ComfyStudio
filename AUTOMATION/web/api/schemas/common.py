"""Shapes shared by several modules."""
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ActionResponse(BaseModel):
    """The universal answer of an action route, `{ok: bool, erreur?: str}`.

    AUDIT §5.4: the convention holds on 4xx and 5xx too — `api.js` reads a JSON
    body on every response, whatever the status.

    ALWAYS DECLARE IT WITH `response_model_exclude_unset=True`. The old handlers
    returned `{"ok": true}` and nothing else on success; a plain response_model
    would add `"erreur": null` to every one of them. Harmless to `erreurDe()`,
    which only tests `ok === false` — but this migration is meant to keep the
    bodies identical, and a shape that drifts once drifts twice.
    """
    model_config = ConfigDict(extra="allow")

    ok: bool
    erreur: Optional[str] = None


class ErrorResponse(BaseModel):
    """What every rejection looks like. `erreur` is French: it is displayed to
    the user verbatim (AUDIT §5.5)."""
    ok: bool = False
    erreur: str


# Attached to the routes so the OpenAPI page shows the real rejection shape
# instead of FastAPI's default `{detail: ...}`.
ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Requête refusée"},
}
