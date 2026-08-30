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

from .exceptions import BodyTooLarge

LOCAL_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}

# Ceiling of a request body. Enforced by BodySizeLimitMiddleware, on the bytes
# actually received. See that class for why the header is not the authority.
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
        # The body-size ceiling is NOT enforced here: a `Content-Length` check
        # is a promise the client makes, and a chunked request makes none at
        # all. It lives in BodySizeLimitMiddleware below, on the bytes actually
        # received.
        return await call_next(request)


class BodySizeLimitMiddleware:
    """Caps the request body on the BYTES RECEIVED, not on a declared header.

    aiohttp enforced this as `client_max_size = 28 MB`; Starlette has no
    equivalent, so it is rebuilt here. The ceiling has to fit a photo encoded in
    base64 (`TAILLE_MAX_PHOTO` = 20 MB, +33 % of encoding): it is the whole JSON
    body that is concerned, before the handler ever gets to read `data_base64`.

    WHY NOT `Content-Length`. That header is a CLAIM. A client sending
    `Transfer-Encoding: chunked` sends no length at all, and one sending a false
    length is not obliged to be honest either. Trusting it left a hole exactly
    the size of the limit it pretended to enforce — flagged at the end of the
    FastAPI migration, closed here. The header is still used, but only as a
    cheap early-out that can REFUSE, never as the thing that accepts.

    PURE ASGI, NOT `BaseHTTPMiddleware`. The count has to happen as the stream
    is consumed, which means wrapping the `receive` callable itself — something
    only a raw ASGI middleware can do. Nothing is buffered here: bytes are
    counted as they pass, and `BodyTooLarge` is raised on the message that
    crosses the line, so an oversized upload is cut short instead of being read
    to the end.

    The exception is raised INSIDE `receive()`, i.e. deep under the endpoint
    that awaited the body. It travels back up to Starlette's exception
    middleware, which routes it to the handler in api/errors.py — hence the
    studio's `{ok, erreur}` shape and a 413, like every other rejection.
    """

    def __init__(self, app, max_bytes=MAX_BODY_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        # Early-out, refusal only: a client that announces too much is turned
        # away without reading a byte. A client that announces nothing, or
        # lies, still gets counted below.
        #
        # It ANSWERS instead of raising, unlike `counting_receive`. Here we are
        # still ABOVE Starlette's exception middleware — nothing would catch a
        # raise, and the outermost error handler would dress it as a 500. Down
        # in `counting_receive` we are below it, and raising is the only option
        # anyway: there is no `send` to answer with from inside a receive.
        declared = None
        for name, value in scope.get("headers", ()):
            if name == b"content-length":
                declared = value
                break
        if declared is not None and declared.isdigit() \
                and int(declared) > self.max_bytes:
            refusal = BodyTooLarge(self.max_bytes)
            response = JSONResponse(refusal.detail, status_code=refusal.status_code)
            return await response(scope, receive, send)

        received = 0

        async def counting_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise BodyTooLarge(self.max_bytes)
            return message

        await self.app(scope, counting_receive, send)
