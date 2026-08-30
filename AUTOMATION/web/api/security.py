"""The studio's authentication substitute — there is no authentication.

Straight port of the `garde_origine` aiohttp middleware. Behaviour is
unchanged; only the framework moved.

WHY A MIDDLEWARE AND NOT A DEPENDENCY. FastAPI reads and validates the request
body BEFORE it solves a route's dependencies. A dependency would therefore fire
after Pydantic had already rejected a `text/plain` body with 422 — and 415 on a
non-JSON Content-Type is precisely the lock that makes a CORS "simple request"
impossible. A middleware runs before any of that, exactly where aiohttp's
middleware sat.

WHAT IT DEFENDS AGAINST. Nothing here authenticates anybody; the dashboard
protects itself by accepting only what comes from itself. Without this guard,
any page open in the browser can post here as `text/plain` — a simple request,
so no CORS preflight — and arm the NSFW branch, start a production run or
rewrite scenes.json. The response stays hidden from the attacker, but the side
effect happens.

Three locks, on writing methods only:
  - Host must be local, against DNS rebinding;
  - an Origin, if present, must be local (a browser always sends one on a
    cross-site request; its ABSENCE means a command-line tool, hence the
    tolerance);
  - Content-Type must be JSON, which is what forbids the simple request: that
    type triggers a preflight, and we answer no preflight.

`--host 0.0.0.0` lifts the first two: the "validate from my phone" mode, an
explicit choice already announced at startup.

CONSEQUENCE, WANTED, NOT AN OVERSIGHT: uploads travel as base64 inside a JSON
body and never as `multipart/form-data`. Multipart is a "simple" Content-Type
at the CORS level, exactly like text/plain, so accepting it would reopen the
hole this guard closes. The +33 % encoding cost is negligible on localhost.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}

# aiohttp enforced this as `client_max_size`; Starlette has no equivalent, so
# the check moved in here. A photo encoded in base64 (TAILLE_MAX_PHOTO = 20 MB,
# +33 %) has to fit. It is the whole JSON body that is concerned, before the
# handler ever gets to read `data_base64`.
MAX_BODY_BYTES = 28 * 1024 * 1024

# Flipped by `open_to_network()` when app.py is started on another host than
# 127.0.0.1. Module-level, read at request time — never captured at import.
NETWORK_OPEN = False


def open_to_network():
    """Lift the Host/Origin locks. Called by app.py for `--host 0.0.0.0` only,
    and already printed as a warning at startup."""
    global NETWORK_OPEN
    NETWORK_OPEN = True


def hostname(value):
    """Host name of a Host or Origin header, without scheme nor port."""
    v = (value or "").strip().split("//")[-1]
    if v.startswith("["):                       # literal IPv6: [::1]:8189
        return v.split("]")[0] + "]"
    return v.split("/")[0].split(":")[0]


def _refuse(message, status):
    return JSONResponse({"ok": False, "erreur": message}, status_code=status)


class LocalOriginGuardMiddleware(BaseHTTPMiddleware):
    """Refuses anything that does not come from the dashboard itself."""

    async def dispatch(self, request, call_next):
        # GET only, deliberately: HEAD and OPTIONS are NOT exempted, exactly as
        # in the aiohttp version. An OPTIONS preflight therefore gets a 415 and
        # not a permission — that is the point of the Content-Type lock.
        if request.method == "GET":
            return await call_next(request)
        if not NETWORK_OPEN:
            if hostname(request.headers.get("Host")) not in LOCAL_HOSTS:
                return _refuse("hôte non autorisé", 403)
            origin = request.headers.get("Origin")
            if origin and hostname(origin) not in LOCAL_HOSTS:
                return _refuse("origine refusée", 403)
        sent_type = (request.headers.get("Content-Type") or "").split(";")[0].strip()
        if sent_type != "application/json":
            return _refuse("Content-Type application/json requis", 415)
        length = request.headers.get("Content-Length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return _refuse("corps de requête trop volumineux (28 Mo max)", 413)
        return await call_next(request)
