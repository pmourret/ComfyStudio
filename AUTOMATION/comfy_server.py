"""S'assurer que ComfyUI tourne. Une seule responsabilite.

Utilise par run_web.bat (via app.py) et disponible pour le runner CLI.

Regles de conduite :
  - on ne demarre JAMAIS une seconde instance : le port 8188 est sonde d'abord,
    et deux ComfyUI se disputeraient les 16 Go de VRAM ;
  - le serveur est lance dans SA PROPRE FENETRE console, pour que ses logs
    restent lisibles (c'est la que sortent les erreurs de custom nodes) ;
  - on ne le tue JAMAIS automatiquement — ni en partant (un batch peut encore
    etre en file), ni en arriere-plan. `stop()` (26/08/2026) existe seulement
    comme geste EXPLICITE depuis l'ecran Application du tableau de bord, jamais
    appele tout seul. Sous Windows il n'y a pas d'arret gracieux : voir sa
    docstring.
"""
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
OFM = HERE.parent
PORTABLE = OFM.parents[2]                     # ...\ComfyUI_windows_portable
PYTHON = PORTABLE / "python_embeded" / "python.exe"
MAIN = PORTABLE / "ComfyUI" / "main.py"

DEFAULT_URL = "http://127.0.0.1:8188"


def is_up(url=DEFAULT_URL, timeout=2):
    """True si un ComfyUI repond deja sur cette URL."""
    try:
        urllib.request.urlopen(url.rstrip("/") + "/system_stats", timeout=timeout).close()
        return True
    except Exception:
        return False


def start(url=DEFAULT_URL):
    """Lance ComfyUI dans une console separee. Ne verifie rien : voir ensure()."""
    if not PYTHON.exists():
        raise FileNotFoundError(f"python embarque introuvable : {PYTHON}")
    if not MAIN.exists():
        raise FileNotFoundError(f"ComfyUI/main.py introuvable : {MAIN}")

    cmd = [str(PYTHON), "-s", str(MAIN), "--windows-standalone-build"]
    port = urlparse(url).port
    if port and port != 8188:                 # le dashboard pointe ailleurs
        cmd += ["--port", str(port)]

    kwargs = {"cwd": str(PORTABLE)}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NEW_CONSOLE
    return subprocess.Popen(cmd, **kwargs)


def _say(msg):
    print(msg, flush=True)          # flush : sinon rien ne s'affiche pendant l'attente


def ensure(url=DEFAULT_URL, timeout=240, log=_say):
    """Garantit qu'un ComfyUI repond sur `url`.

    Retourne "deja-actif" ou "demarre". Leve TimeoutError si le serveur ne
    repond pas dans le delai : le premier demarrage charge les custom nodes et
    peut demander une bonne minute.
    """
    if is_up(url):
        log(f"ComfyUI deja actif sur {url}")
        return "deja-actif"

    log("ComfyUI hors ligne -> demarrage dans une fenetre separee, patience "
        "(chargement des custom nodes)...")
    proc = start(url)

    started = time.time()
    deadline = started + timeout
    while time.time() < deadline:
        if is_up(url, timeout=2):
            log(f"ComfyUI pret sur {url} en {round(time.time() - started)} s")
            return "demarre"
        if proc.poll() is not None:
            raise RuntimeError(
                f"ComfyUI s'est arrete au demarrage (code {proc.returncode}). "
                "Regarder sa fenetre console pour la cause.")
        time.sleep(2)

    raise TimeoutError(
        f"ComfyUI n'a pas repondu sur {url} en {timeout} s. Le processus tourne "
        "peut-etre encore : verifier sa fenetre console.")


def find_process():
    """Le processus ComfyUI en cours, identifie par sa ligne de commande.

    Pas par un PID retenu au demarrage : ca ne marcherait que si CE module l'a
    lui-meme lance dans CETTE session. En le retrouvant par cmdline a chaque
    appel, ca marche aussi s'il a ete demarre par run_nvidia_gpu.bat, a la main,
    ou par une session anterieure du tableau de bord. Rend None si rien ne tourne.
    """
    import psutil
    for p in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            cl = p.info["cmdline"] or []
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        texte = " ".join(str(c) for c in cl)
        if "main.py" in texte and "ComfyUI" in texte:
            return p
    return None


def stop(timeout=30):
    """Arrete ComfyUI, quel que soit qui l'a lance. Rend False si rien ne tournait.

    ⚠️ Sous Windows, psutil.terminate() et .kill() sont EQUIVALENTS : il n'existe
    pas de signal que le processus peut intercepter pour finir proprement (pas
    de SIGTERM). Un arret est donc TOUJOURS net, jamais gracieux — une
    generation en cours est perdue, pas juste interrompue proprement. C'est
    pour ca que ce module ne l'a jamais fait automatiquement (voir l'en-tete) :
    ceci n'existe que comme geste EXPLICITE depuis l'interface, jamais en
    silence, jamais a la sortie du tableau de bord.
    """
    import psutil
    proc = find_process()
    if proc is None:
        return False
    proc.terminate()
    try:
        proc.wait(timeout=timeout)
    except psutil.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)
    return True


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Demarre ComfyUI s'il ne tourne pas deja")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--timeout", type=int, default=240)
    ap.add_argument("--check", action="store_true", help="sonde seulement, ne demarre rien")
    a = ap.parse_args()
    if a.check:
        print("actif" if is_up(a.url) else "hors ligne")
    else:
        print(ensure(a.url, a.timeout))
