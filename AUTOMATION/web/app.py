"""Tableau de bord local pour la production.

Serveur aiohttp (deja fourni par ComfyUI, aucune dependance a installer) qui
pilote le meme coeur que la CLI : runner.execute_jobs.

    python_embeded\\python.exe AUTOMATION\\web\\app.py
    -> http://127.0.0.1:8189

Ecoute sur 127.0.0.1 par defaut. --host 0.0.0.0 l'expose au reseau local (utile
pour valider les images depuis le telephone) : a ne faire que sur un reseau de
confiance, il n'y a aucune authentification.

Au demarrage, si un tableau de bord fantome tient deja le port (run precedent
mal ferme), il est arrete et on repart sur du propre — voir reclaim_port().
Jamais ComfyUI, jamais un process tiers.

STRUCTURE (J2 etape 4). Ce fichier ne fait plus que l'assemblage : middlewares,
enregistrement des routes, demarrage du serveur. Chaque responsabilite vit dans
son propre module (.claude/rules/backend.md) :

    shared_state.py   STATE, UNDO, CHECKER, cfg()/scenes_data(), bucket_dir(),
                       middlewares — importe par tous les modules de routes
    routes/etat.py       etat du systeme, health-check, config, cycle de vie
    routes/banque.py     banque de scenes, taxonomie creative, composeur
    routes/vignettes.py  images, miniatures, poses
    routes/production.py lancement de generation, file de jobs, declinaisons
    routes/tri.py         QC, revue, jugements, export
"""
import argparse
import os
import socket
import sys
import time
from pathlib import Path

from aiohttp import web

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import comfy_server  # noqa: E402
import shared_state as ss  # noqa: E402
from routes import etat, banque, vignettes, production, tri  # noqa: E402


def _port_libre(port, host="127.0.0.1"):
    """True si plus personne n'ecoute sur (host, port)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) != 0


def reclaim_port(port):
    """Un tableau de bord tourne deja sur ce port -> le tuer, repartir propre.

    Le fantome vient d'un run precedent mal ferme (fenetre console fermee sans
    Ctrl-C, fumigation HTTP interrompue, redemarrage brutal) : sous Windows le
    socket reste tenu par le process orphelin et un second `web.run_app` echoue
    en [WinError 10048]. Plutot que de refuser de demarrer, on reprend la place.

    Ne tue QUE un process dont la ligne de commande est notre propre
    AUTOMATION/web/app.py ET qui ecoute sur CE port — jamais "ce qui traine sur
    le port", qui pourrait etre un service tiers ; jamais ComfyUI (autre
    cmdline, autre port). Meme facon d'identifier un process par sa cmdline que
    comfy_server.find_process().
    """
    if _port_libre(port):
        return
    try:
        import psutil
    except ImportError:
        print("!! port occupe et psutil absent : demarrage tel quel "
              "(web.run_app dira si le port est pris).", flush=True)
        return

    moi = os.getpid()
    for p in psutil.process_iter(["pid", "cmdline"]):
        if p.info["pid"] == moi:
            continue
        try:
            cl = " ".join(str(c) for c in (p.info["cmdline"] or [])).replace("\\", "/")
            if "automation/web/app.py" not in cl.lower():
                continue
            ecoute = any(c.status == psutil.CONN_LISTEN and c.laddr
                         and c.laddr.port == port
                         for c in p.net_connections(kind="inet"))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        if not ecoute:
            continue
        print(f"tableau de bord fantome sur le port {port} (PID {p.info['pid']}) "
              f"-> arret, on repart propre.", flush=True)
        p.terminate()
        try:
            p.wait(timeout=8)
        except psutil.TimeoutExpired:
            p.kill()
            p.wait(timeout=3)
        break
    else:
        print(f"!! port {port} occupe, mais par aucun tableau de bord "
              f"identifiable (service tiers ou socket orphelin) : on n'y touche "
              f"pas, web.run_app rendra son message.", flush=True)
        return

    for _ in range(24):                  # laisser le socket se liberer (Windows)
        if _port_libre(port):
            return
        time.sleep(0.25)
    print(f"!! le port {port} est toujours occupe apres l'arret du fantome.",
          flush=True)


def main():
    ap = argparse.ArgumentParser(description="Tableau de bord")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8189)
    ap.add_argument("--no-comfy", action="store_true",
                    help="ne pas demarrer ComfyUI (il est deja gere a la main)")
    ap.add_argument("--no-browser", action="store_true",
                    help="ne pas ouvrir le navigateur")
    args = ap.parse_args()

    # Repartir sur du propre : un tableau de bord fantome sur le meme port
    # (run precedent mal ferme) est tue avant tout le reste. Ne touche jamais
    # ComfyUI ni un process tiers.
    reclaim_port(args.port)

    # ComfyUI d'abord : sans lui le tableau de bord s'ouvre sur un ecran
    # "hors ligne" et rien n'est lancable. Ne demarre rien s'il tourne deja.
    if not args.no_comfy:
        try:
            comfy_server.ensure(ss.cfg()["comfy_url"])
        except Exception as e:
            print(f"!! ComfyUI n'a pas pu demarrer : {e}")
            print("   Le tableau de bord s'ouvre quand meme (production indisponible).")
            print("   Relancer ComfyUI a la main, l'ecran se debloque tout seul.")

    retirees = ss.purger_vignettes()
    if retirees:
        print(f"{retirees} vignette(s) orpheline(s) retiree(s)", flush=True)

    # limite par defaut d'aiohttp : 1 Mo, trop court pour une photo encodee en
    # base64 (TAILLE_MAX_PHOTO=20 Mo, +33 % d'encodage). Relevee ici plutot que
    # sur la route : c'est le corps JSON entier qui est concerne, avant meme
    # que le handler puisse lire body["data_base64"].
    app = web.Application(middlewares=[ss.garde_erreurs, ss.garde_origine],
                          client_max_size=28 * 1024 * 1024)
    app.add_routes(etat.routes)
    app.add_routes(banque.routes)
    app.add_routes(vignettes.routes)
    app.add_routes(production.routes)
    app.add_routes(tri.routes)
    app.add_routes([web.static("/static", HERE / "static")])

    if args.host != "127.0.0.1":
        ss.RESEAU_OUVERT = True     # leve les gardes Host/Origin : choix explicite
        print("!! expose sur le reseau local, sans authentification. "
              "A n'utiliser que sur un reseau de confiance.", flush=True)
    url = f"http://{'127.0.0.1' if args.host == '0.0.0.0' else args.host}:{args.port}"
    print(f"Tableau de bord  ->  {url}", flush=True)
    if not args.no_browser:
        import webbrowser
        webbrowser.open(url)
    try:
        web.run_app(app, host=args.host, port=args.port, print=None)
    except OSError as e:
        # reclaim_port n'a pas libere la place : port tenu par un process tiers
        # (pas notre tableau de bord) ou socket encore en cours de liberation.
        print(f"!! impossible d'ecouter sur {args.host}:{args.port} — {e}\n"
              f"   Un autre programme tient ce port. Le liberer, ou lancer avec "
              f"--port <autre>.", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
