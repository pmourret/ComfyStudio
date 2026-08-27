"""Tableau de bord local pour la production.

Serveur aiohttp (deja fourni par ComfyUI, aucune dependance a installer) qui
pilote le meme coeur que la CLI : runner.execute_jobs.

    python_embeded\\python.exe AUTOMATION\\web\\app.py
    -> http://127.0.0.1:8189

Ecoute sur 127.0.0.1 par defaut. --host 0.0.0.0 l'expose au reseau local (utile
pour valider les images depuis le telephone) : a ne faire que sur un reseau de
confiance, il n'y a aucune authentification.

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
import sys
from pathlib import Path

from aiohttp import web

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import comfy_server  # noqa: E402
import shared_state as ss  # noqa: E402
from routes import etat, banque, vignettes, production, tri  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Tableau de bord")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8189)
    ap.add_argument("--no-comfy", action="store_true",
                    help="ne pas demarrer ComfyUI (il est deja gere a la main)")
    ap.add_argument("--no-browser", action="store_true",
                    help="ne pas ouvrir le navigateur")
    args = ap.parse_args()

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
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
