# -*- coding: utf-8 -*-
"""app.py reclaim_port() : repartir sur du propre quand un tableau de bord
fantome tient deja le port.

POURQUOI CE TEST EXISTE. reclaim_port TUE un process — donc deux garanties a
verrouiller : (1) un tableau de bord fantome sur le meme port EST bien repris
(sinon `web.run_app` echoue en [WinError 10048] et le lancement est bloque) ;
(2) un process TIERS sur ce port n'est JAMAIS tue (il est identifie par sa
ligne de commande app.py + son socket en ecoute, pas par "ce qui traine sur
le port"). ComfyUI n'est jamais concerne : autre cmdline, autre port.

Le test lance de vrais sous-processus app.py sur un port de test et ne touche
a rien d'autre. --no-comfy : ComfyUI n'a pas besoin de tourner.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_reclaim_port.py
"""
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
APP = OFM / "AUTOMATION" / "web" / "app.py"
PY = sys.executable
PORT_A = 8231          # fantome / reprise
PORT_B = 8232          # process tiers
KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte.encode('ascii', 'replace').decode()}")
    if not ok:
        KO += 1


def _up(port):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/api/state?character=lena", timeout=2).close()
        return True
    except Exception:
        return False


def _listener_pid(port):
    import psutil
    for p in psutil.process_iter(["pid"]):
        try:
            for c in p.net_connections(kind="inet"):
                if c.status == psutil.CONN_LISTEN and c.laddr and c.laddr.port == port:
                    return p.pid
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return None


def _start(port):
    p = subprocess.Popen([PY, str(APP), "--no-comfy", "--no-browser",
                          "--port", str(port)],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         cwd=str(OFM))
    for _ in range(40):
        if _up(port) or p.poll() is not None:
            break
        time.sleep(0.5)
    return p


def _kill(p):
    try:
        p.kill()
        p.wait(timeout=5)
    except Exception:  # noqa: BLE001
        pass


import psutil  # noqa: E402  (apres les defs : message clair si absent)

# ------------------------------------------------- [1] le fantome est repris
print("[1] un second app.py sur le meme port reprend la place du fantome")
a = _start(PORT_A)
time.sleep(1)
pid_ghost = _listener_pid(PORT_A)
verifie(pid_ghost is not None and _up(PORT_A),
        f"dashboard A en ligne sur {PORT_A} (PID {pid_ghost})")

b = _start(PORT_A)
time.sleep(1)
out_b = b.stdout.read1(4000).decode("utf-8", "replace") if b.stdout else ""
pid_new = _listener_pid(PORT_A)
verifie("fantome sur le port" in out_b, "B a signale la reprise du port")
verifie(pid_ghost is not None and str(pid_ghost) in out_b,
        f"B nomme le PID du fantome ({pid_ghost})")
verifie(not psutil.pid_exists(pid_ghost)
        or not psutil.Process(pid_ghost).is_running(),
        f"le fantome (PID {pid_ghost}) est mort")
verifie(pid_new is not None and pid_new != pid_ghost and _up(PORT_A),
        f"B sert sur {PORT_A} avec un nouveau PID ({pid_new})")
_kill(a)
_kill(b)
time.sleep(1)

# ------------------------------------------- [2] un process tiers est epargne
print("\n[2] un process TIERS sur le port n'est jamais tue")
tiers = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
tiers.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
tiers.bind(("127.0.0.1", PORT_B))
tiers.listen(5)
pid_tiers = _listener_pid(PORT_B)          # ce process de test lui-meme
c = _start(PORT_B)
time.sleep(2)
out_c = c.stdout.read1(6000).decode("utf-8", "replace") if c.stdout else ""
verifie("aucun tableau de bord identifiable" in out_c,
        "app.py refuse de tuer un process non identifie comme tableau de bord")
verifie(_listener_pid(PORT_B) == pid_tiers,
        "le process tiers tient toujours le port (pas tue)")
verifie(c.poll() is not None and c.returncode != 0,
        "app.py sort proprement en erreur (port pris, pas de traceback nu)")
_kill(c)
tiers.close()

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
