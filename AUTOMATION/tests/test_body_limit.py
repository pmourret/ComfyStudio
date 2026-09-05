# -*- coding: utf-8 -*-
"""Le plafond de corps de requete tient meme sans Content-Length.

POURQUOI CE TEST EXISTE. aiohttp bornait le corps par `client_max_size` ; la
migration FastAPI a du le reconstruire, et la premiere version se contentait de
lire l'en-tete `Content-Length`. Or cet en-tete est une DECLARATION du client :
une requete en `Transfer-Encoding: chunked` n'en envoie aucune, et passait donc
au travers du plafond qu'elle etait censee respecter. Le trou faisait
exactement la taille de la limite annoncee.

Le controle porte desormais sur les OCTETS RECUS (BodySizeLimitMiddleware,
api/security.py), en enveloppant le `receive` ASGI. L'en-tete ne sert plus que
de sortie rapide, et seulement pour REFUSER — jamais pour accepter.

Ce que ce test verrouille, dans les trois formes qu'une requete peut prendre :
  - chunked SANS Content-Length, au-dela de la limite -> refuse ;
  - Content-Length honnete au-dela de la limite -> refuse (sortie rapide) ;
  - Content-Length MENSONGER (annonce petit, envoie gros) -> refuse quand meme ;
  - et, en negatif, qu'un corps normal passe toujours.

Le refus doit porter le statut 413 ET la forme d'erreur du studio,
`{ok: false, erreur}` — comme tout le reste (AUDIT §5.4).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_body_limit.py
(ou le venv de dev : fastapi + httpx suffisent)
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION / "web"))
sys.path.insert(0, str(AUTOMATION))

from api import security                      # noqa: E402
from api.main import app                      # noqa: E402
from fastapi.testclient import TestClient     # noqa: E402

KO = 0

# `base_url` en 127.0.0.1 : sans lui le client envoie `Host: testserver`, que
# le garde d'origine refuse en 403 — a juste titre.
CLIENT = TestClient(app, base_url="http://127.0.0.1")

# On rabaisse la limite pour le test : verifier 28 Mo pour de vrai couterait
# 28 Mo de RAM et plusieurs secondes a chaque cas, pour tester exactement la
# meme ligne de code. La VRAIE valeur est verifiee a part, en [0].
VRAIE_LIMITE = security.MAX_BODY_BYTES
LIMITE_TEST = 64 * 1024                       # 64 Ko


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def refus_correct(r, ou):
    """Un refus de taille : 413 + la forme d'erreur du studio."""
    if r.status_code != 413:
        verifie(False, f"{ou} : statut {r.status_code} au lieu de 413 "
                       f"({r.text[:120]})")
        return
    try:
        corps = r.json()
    except Exception:
        verifie(False, f"{ou} : 413 mais corps non-JSON ({r.text[:80]})")
        return
    verifie(corps.get("ok") is False and "trop volumineux" in (corps.get("erreur") or ""),
            f"{ou} : 413 + {{ok:false, erreur}} ({corps.get('erreur')})")


def morceaux(total, taille=8192):
    """Generateur d'octets. httpx sans longueur connue -> Transfer-Encoding:
    chunked, donc AUCUN en-tete Content-Length. C'est tout l'objet du test."""
    envoyes = 0
    while envoyes < total:
        n = min(taille, total - envoyes)
        envoyes += n
        yield b"x" * n


print("=" * 70)
print("plafond de corps de requete - octets recus, pas en-tete declare")
print("=" * 70)

print("\n[0] la vraie limite du serveur")
verifie(VRAIE_LIMITE == 28 * 1024 * 1024,
        f"MAX_BODY_BYTES = 28 Mo, la valeur de client_max_size d'aiohttp "
        f"({VRAIE_LIMITE} octets)")
verifie(VRAIE_LIMITE > 20 * 1024 * 1024 * 4 / 3,
        "et elle laisse passer une photo de 20 Mo encodee en base64 (+33 %)")
# Le message REEL, celui que l'ecran affichera. Les cas ci-dessous abaissent la
# limite pour ne pas brasser 28 Mo par requete, et leur message dit donc
# « 0 Mo » — c'est un artefact du test, pas ce que voit l'utilisateur.
from api.exceptions import BodyTooLarge       # noqa: E402
verifie(BodyTooLarge(VRAIE_LIMITE).detail == {
            "ok": False, "erreur": "corps de requête trop volumineux (28 Mo max)"},
        f"le refus reel dit « 28 Mo max » "
        f"({BodyTooLarge(VRAIE_LIMITE).detail['erreur']})")

# On abaisse la limite sur l'instance de middleware deja construite : c'est la
# MEME ligne de code qui s'execute, sur un volume tenable. Starlette ne monte
# la pile qu'a la premiere requete (`middleware_stack` vaut None avant), d'ou
# cet appel a vide avant d'aller chercher l'instance.
CLIENT.get("/api/state")
pile = app.middleware_stack
abaissee = False
while pile is not None:
    if isinstance(pile, security.BodySizeLimitMiddleware):
        pile.max_bytes = LIMITE_TEST
        abaissee = True
        break
    pile = getattr(pile, "app", None)
verifie(abaissee, "le middleware de taille est bien dans la pile de l'application")

TROP = LIMITE_TEST + 32 * 1024                # nettement au-dela
ENTETES = {"Content-Type": "application/json"}

try:
    # ==================================================================== [1]
    print("\n[1] chunked SANS Content-Length — le trou d'origine")
    r = CLIENT.post("/api/plan", content=morceaux(TROP), headers=ENTETES)
    # la requete ne DOIT pas avoir annonce sa taille : sinon on teste la
    # sortie rapide et pas le comptage
    verifie("content-length" not in {k.lower() for k in r.request.headers},
            "la requete est bien partie sans Content-Length "
            f"(transfer-encoding={r.request.headers.get('transfer-encoding')!r})")
    refus_correct(r, "chunked au-dela de la limite")

    # ==================================================================== [2]
    print("\n[2] Content-Length honnete au-dela de la limite")
    r = CLIENT.post("/api/plan", content=b"x" * TROP, headers=ENTETES)
    refus_correct(r, "Content-Length annonce trop gros")

    # ==================================================================== [3]
    print("\n[3] Content-Length MENSONGER : annonce petit, envoie gros")
    # httpx ne laisse pas mentir facilement ; on parle a l'application en ASGI
    # direct, ce qui est aussi la seule facon de simuler un client hostile.
    import anyio

    async def envoyer_mensonge():
        recu = {"status": None, "body": b""}
        corps = b"x" * TROP
        messages = [
            {"type": "http.request", "body": corps[:len(corps) // 2], "more_body": True},
            {"type": "http.request", "body": corps[len(corps) // 2:], "more_body": False},
        ]

        async def receive():
            return messages.pop(0) if messages else {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                recu["status"] = message["status"]
            elif message["type"] == "http.response.body":
                recu["body"] += message.get("body", b"")

        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": "POST", "scheme": "http", "path": "/api/plan",
            "raw_path": b"/api/plan", "query_string": b"", "root_path": "",
            "headers": [(b"host", b"127.0.0.1"),
                        (b"content-type", b"application/json"),
                        (b"content-length", b"10")],      # le mensonge
            "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 8189),
        }
        await app(scope, receive, send)
        return recu

    recu = anyio.run(envoyer_mensonge)
    verifie(recu["status"] == 413,
            f"Content-Length menteur : refuse quand meme ({recu['status']})")
    if recu["status"] == 413:
        corps = json.loads(recu["body"].decode("utf-8"))
        verifie(corps.get("ok") is False and "trop volumineux" in corps.get("erreur", ""),
                f"et la forme d'erreur du studio est preservee ({corps.get('erreur')})")

    # ==================================================================== [4]
    print("\n[4] en negatif : un corps normal passe toujours")
    petit = json.dumps({"scenes": [], "intensity": 0}).encode()
    r = CLIENT.post("/api/plan?character=lena", content=petit, headers=ENTETES)
    verifie(r.status_code == 200, f"corps normal, Content-Length : 200 ({r.status_code})")
    r = CLIENT.post("/api/plan?character=lena", content=iter([petit]), headers=ENTETES)
    verifie(r.status_code == 200,
            f"corps normal, chunked : 200 aussi ({r.status_code})")

    # ==================================================================== [5]
    print("\n[5] le garde d'origine passe toujours AVANT le plafond")
    # un corps enorme en text/plain doit sortir en 415, pas en 413 : le
    # Content-Type est le verrou qui interdit la requete CORS « simple », et il
    # se juge sans lire un octet.
    r = CLIENT.post("/api/plan", content=morceaux(TROP),
                    headers={"Content-Type": "text/plain"})
    verifie(r.status_code == 415,
            f"chunked enorme en text/plain -> 415, pas 413 ({r.status_code})")

finally:
    pile = app.middleware_stack
    while pile is not None:
        if isinstance(pile, security.BodySizeLimitMiddleware):
            pile.max_bytes = VRAIE_LIMITE
            break
        pile = getattr(pile, "app", None)

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
sys.exit(1 if KO else 0)
