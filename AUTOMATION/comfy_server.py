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
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import env_config  # noqa: E402

OFM = HERE.parent
COMFY = env_config.comfyui_root()
PORTABLE = COMFY.parent                       # ...\ComfyUI_windows_portable
PYTHON = env_config.comfyui_python()
MAIN = COMFY / "main.py"

DEFAULT_URL = "http://127.0.0.1:8188"


def is_up(url=DEFAULT_URL, timeout=2):
    """True si un ComfyUI repond deja sur cette URL."""
    try:
        urllib.request.urlopen(url.rstrip("/") + "/system_stats", timeout=timeout).close()
        return True
    except Exception:
        return False


# --------------------------------------------------------------- sondes (J8)
# Trois sources, et une seule est garantie. `/system_stats` vient de ComfyUI
# lui-meme : RAM et VRAM, toujours la si le serveur repond. La temperature, la
# charge et la consommation N'Y SONT PAS — seul le pilote les connait, et on
# passe donc par `nvidia-smi`, qui suppose une carte NVIDIA.
#
# DEGRADATION SILENCIEUSE, decidee explicitement : une machine sans nvidia-smi
# (autre fabricant, pilote absent, binaire hors du PATH) rend `gpu: None` et
# l'interface montre le reste. Une sonde de confort ne doit jamais faire
# echouer l'ecran qui la porte. Les autres fabricants viendront par une
# deuxieme source ici, pas par un `if` chez l'appelant.
NVIDIA_SMI_CHAMPS = ("name", "memory.used", "memory.total", "temperature.gpu",
                     "utilization.gpu", "power.draw")


def _nvidia_smi(timeout=4):
    """Temperature / charge / consommation de la premiere carte NVIDIA, ou None.

    None a la moindre difficulte : binaire absent, delai depasse, sortie
    inattendue. L'appelant n'a pas a distinguer les cas — il n'affiche pas la
    ligne, c'est tout.
    """
    cmd = ["nvidia-smi", "--query-gpu=" + ",".join(NVIDIA_SMI_CHAMPS),
           "--format=csv,noheader,nounits"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                             creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0 or not out.stdout.strip():
        return None
    champs = [c.strip() for c in out.stdout.strip().splitlines()[0].split(",")]
    if len(champs) < len(NVIDIA_SMI_CHAMPS):
        return None

    def nombre(txt):
        try:
            return float(txt)
        except ValueError:
            return None          # nvidia-smi ecrit "[N/A]" sur certaines cartes

    return {"nom": champs[0],
            "vram_utilisee": (nombre(champs[1]) or 0) * 1024 * 1024,
            "vram_totale": (nombre(champs[2]) or 0) * 1024 * 1024,
            "temperature": nombre(champs[3]),
            "charge": nombre(champs[4]),
            "puissance": nombre(champs[5])}


def _system_stats(url, timeout=4):
    """RAM et VRAM telles que ComfyUI les voit. None s'il ne repond pas."""
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/system_stats",
                                    timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def stats(url=DEFAULT_URL):
    """Etat memoire et thermique, pour l'ecran Application.

    Rend toujours un dict : `en_ligne` dit si ComfyUI a repondu, `gpu` vaut None
    quand aucune sonde materielle n'est disponible. Jamais d'exception — cette
    fonction sert un affichage, pas une decision.
    """
    brut = _system_stats(url)
    gpu = _nvidia_smi()
    if brut is None:
        return {"en_ligne": False, "ram": None, "vram": None, "gpu": gpu}

    sys_ = brut.get("system") or {}
    ram_total = sys_.get("ram_total") or 0
    ram_libre = sys_.get("ram_free") or 0
    # La premiere carte : la plateforme tient sur UN GPU (CLAUDE.md §2, une
    # seule instance ComfyUI sert tous les personnages). Lister les autres
    # donnerait une colonne que rien ne lit.
    dev = (brut.get("devices") or [{}])[0]
    vram_total = dev.get("vram_total") or 0
    vram_libre = dev.get("vram_free") or 0
    return {
        "en_ligne": True,
        "version": sys_.get("comfyui_version"),
        "ram": {"total": ram_total, "libre": ram_libre,
                "utilisee": max(0, ram_total - ram_libre)},
        # `torch_*` : ce que PyTorch retient dans son propre cache, sous-ensemble
        # de la VRAM occupee. C'est LUI que le dechargement libere.
        "vram": {"nom": dev.get("name"), "total": vram_total, "libre": vram_libre,
                 "utilisee": max(0, vram_total - vram_libre),
                 "torch_reserve": dev.get("torch_vram_total") or 0},
        "gpu": gpu,
    }


def unload(url=DEFAULT_URL, timeout=30):
    """Decharge les modeles et rend la VRAM (POST /free de ComfyUI).

    Geste EXPLICITE de l'ecran Application, jamais automatique — meme regle que
    `stop()`. Rend (ok, erreur) ; l'appelant refuse deja quand un batch tourne,
    decharger sous un job en cours le ferait echouer.
    """
    corps = json.dumps({"unload_models": True, "free_memory": True}).encode()
    req = urllib.request.Request(url.rstrip("/") + "/free", data=corps,
                                 headers={"Content-Type": "application/json"},
                                 method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return (200 <= r.status < 300), None
    except urllib.error.HTTPError as e:
        return False, f"ComfyUI a refuse : HTTP {e.code}"
    except Exception as e:
        return False, f"{type(e).__name__} : {e}"


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
