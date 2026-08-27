"""Etat et ressources partages entre tous les modules de routes (J2 etape 4).

Un seul etat d'execution (STATE), un seul verrou de tri (UNDO), un seul QC
d'identite en cache (CHECKER) — jamais duplique par module de route, exactement
comme avant le decoupage. Tout module de `routes/` importe ce module plutot que
de redefinir sa propre copie.
"""
import asyncio
import json
import re
import sys
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path

from aiohttp import web

HERE = Path(__file__).resolve().parent      # AUTOMATION/web/
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb  # noqa: E402

BUCKETS = ("OK", "A_REVOIR", "REJET", "SANS_VISAGE", "ARCHIVE")
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.\-]+\.(png|jpg|jpeg)$")
THUMBS = OFM / "PROD" / ".thumbs"

# JSON + base64, jamais multipart/form-data : multipart est un Content-Type
# "simple" au sens CORS (comme text/plain), donc PAS soumis au preflight que
# garde_origine exploite pour bloquer un site tiers. L'accepter rouvrirait
# exactement le trou que ce garde ferme. Le cout — un encodage +33 % — est
# negligeable en local. Partage entre vignettes.py (photo de pose) et tri.py
# (image editee).
TAILLE_MAX_PHOTO = 20 * 1024 * 1024


def bad_request(msg):
    """400 en JSON, pas en texte brut : le front (core.js api()/post()) attend
    un corps JSON sur toute reponse, succes ou echec, pour afficher un toast
    au lieu de planter sur un rejet de promesse non gere."""
    raise web.HTTPBadRequest(text=json.dumps({"ok": False, "erreur": msg}),
                             content_type="application/json")


# ------------------------------------------------------------------ garde-fous
# Le tableau de bord n'a aucune authentification : il se protege en n'acceptant
# que ce qui vient de lui-meme.
HOTES_LOCAUX = {"127.0.0.1", "localhost", "[::1]", "::1"}
RESEAU_OUVERT = False          # passe a True par --host autre que 127.0.0.1 (main())


def _hote(valeur):
    """Nom d'hote d'un en-tete Host ou Origin, sans le schema ni le port."""
    v = (valeur or "").strip().split("//")[-1]
    if v.startswith("["):                       # IPv6 litteral : [::1]:8189
        return v.split("]")[0] + "]"
    return v.split("/")[0].split(":")[0]


@web.middleware
async def garde_origine(request, handler):
    """Refuse ce qui ne vient pas du tableau de bord lui-meme.

    Il n'y a aucune authentification, et `request.json()` d'aiohttp ne regarde
    pas le Content-Type (verifie sur 3.13.5 : il fait `loads(await text())`).
    Sans ce garde, n'importe quelle page ouverte dans le navigateur peut poster
    ici en `text/plain` — une requete « simple », donc sans preflight CORS — et
    armer la branche NSFW, lancer une production ou reecrire scenes.json. La
    reponse reste cachee a l'attaquant, mais l'effet de bord, lui, a lieu.

    Trois verrous, tous sur les seules methodes qui ecrivent :
      - le Host doit etre local, contre le DNS rebinding ;
      - une Origin presente doit etre locale (un navigateur en envoie toujours
        une sur une requete inter-site ; son ABSENCE signale un outil en ligne
        de commande, pas une page web, d'ou la tolerance) ;
      - le Content-Type doit etre du JSON, ce qui suffit a interdire la requete
        « simple » : ce type declenche un preflight auquel on ne repond pas.

    `--host 0.0.0.0` releve les deux premiers : c'est le mode « valider depuis
    le telephone », un choix explicite deja signale au demarrage.
    """
    if request.method == "GET":
        return await handler(request)
    if not RESEAU_OUVERT:
        if _hote(request.headers.get("Host")) not in HOTES_LOCAUX:
            return web.json_response({"ok": False, "erreur": "hôte non autorisé"},
                                     status=403)
        origine = request.headers.get("Origin")
        if origine and _hote(origine) not in HOTES_LOCAUX:
            return web.json_response({"ok": False, "erreur": "origine refusée"},
                                     status=403)
    type_envoye = (request.headers.get("Content-Type") or "").split(";")[0].strip()
    if type_envoye != "application/json":
        return web.json_response(
            {"ok": False, "erreur": "Content-Type application/json requis"},
            status=415)
    return await handler(request)


@web.middleware
async def garde_erreurs(request, handler):
    """Toute exception sort en JSON, jamais en page HTML.

    Le front attend un corps JSON sur chaque reponse (core.js api()). Une
    exception non interceptee rendait un 500 en HTML, et l'ecran affichait
    « reponse invalide du serveur (500) » — un message qui ne dit rien. Les cas
    atteignables ne manquaient pas : une action inconnue dans /api/action, un
    `count` non numerique, ou une scene decrivant le visage qui fait lever
    FaceInPromptError a build_jobs.
    """
    try:
        return await handler(request)
    except web.HTTPException:
        raise                                   # 400/404 deliberes : deja formes
    except json.JSONDecodeError:
        return web.json_response({"ok": False, "erreur": "corps JSON invalide"},
                                 status=400)
    except (KeyError, ValueError, TypeError) as e:
        push_log(f"{request.path} : {type(e).__name__} — {e}")
        return web.json_response({"ok": False, "erreur": f"requête invalide : {e}"},
                                 status=400)
    except Exception as e:
        push_log(f"{request.path} : {type(e).__name__} — {e}")
        return web.json_response({"ok": False,
                                  "erreur": f"{type(e).__name__} : {e}"}, status=500)


STATE = {
    "running": False,
    "batch_id": None,
    "index": 0,
    "total": 0,
    "current": None,
    "log": [],
    "stats": {},
    "stop": False,
    "started_at": None,
    "recent": [],          # images du batch en cours, pour la bande en direct
    "eta": None,
    "intensity": 0,        # niveau DEMANDE : sert a estimer la duree par image
}
UNDO = []                  # dernieres actions de tri, pour le bouton annuler
# Il n'y a qu'UN etat d'execution. La branche NSFW avait le sien (NSTATE), avec
# son propre panneau, son propre journal a l'ecran et son propre bouton d'arret :
# deux batches ne peuvent de toute facon pas tourner sur le meme GPU, et deux
# etats concurrents ne servaient qu'a faire diverger les deux affichages.
# Retire le 26/08/2026 avec l'onglet NSFW parallele (P3).
CHECKER = None
# run_batch_blocking et /api/mesurer tournent tous deux dans un thread
# d'executeur : sans verrou, cliquer « Mesurer » pendant une production pouvait
# charger InsightFace une seconde fois (~1 Go) et concurrencer le batch en cours.
VERROU_CHECKER = threading.Lock()


def checker_partage(configuration):
    """Rend le QC d'identite, en le chargeant au plus une fois."""
    global CHECKER
    with VERROU_CHECKER:
        if CHECKER is None:
            push_log("chargement du QC d'identite (InsightFace)…")
            CHECKER = lb.make_checker(configuration)
        return CHECKER


def push_log(msg):
    STATE["log"].append(f"{datetime.now():%H:%M:%S} · {msg}")
    del STATE["log"][:-200]


# ------------------------------------------------------------------ ressources
# "lena" en dur : le selecteur de personnage (?character=) est J3, pas J2 —
# voir CHARACTERS/lena/{config,scenes,creative}.json (J2 etape 2).
def cfg():
    return lb.load_config("lena")


def scenes_data():
    return lb.load_scenes("lena")


def journal_index():
    """filename -> ligne du journal, pour afficher score/scene dans la galerie."""
    import csv
    path = OFM / "PROD" / "journal_batch.csv"
    if not path.exists():
        return {}
    out = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            if row.get("fichier"):
                out[row["fichier"]] = row
    return out


def _moyenne_duree(path, default):
    import csv
    if not path.exists():
        return default
    try:
        with open(path, encoding="utf-8", newline="") as f:
            vals = [float(r["duree_s"]) for r in csv.DictReader(f, delimiter=";")
                    if r.get("duree_s")]
        return sum(vals[-40:]) / len(vals[-40:]) if vals else default
    except Exception:
        return default


def avg_duration(default=55.0):
    """Duree moyenne par image, lue dans le journal (donnee reelle, pas estimee).

    Partagee entre etat.py (duree_unitaire, pour l'ETA) et banque.py (badge de
    l'ecran Creer)."""
    return _moyenne_duree(OFM / "PROD" / "journal_batch.csv", default)


def bucket_dir(bucket, space="lena"):
    if bucket not in BUCKETS:
        bad_request("bucket inconnu")
    if space == "nsfw":
        return OFM / "PROD" / "_NSFW" / bucket
    if space != "lena":
        bad_request("espace inconnu")
    return OFM / "PROD" / "LENA" / bucket


def oublier_vignette(nom, bucket, espace="lena"):
    """Retire la vignette d'une image qui quitte son dossier.

    Les vignettes sont rangees par espace/bucket : une image qui change de
    dossier laissait la sienne derriere elle. Constate le 25/08/2026 : 96
    fichiers dans PROD/.thumbs pour 46 PNG sur le disque.
    """
    (THUMBS / espace / bucket / (Path(nom).stem + ".jpg")).unlink(missing_ok=True)


def purger_vignettes():
    """Balaye les vignettes qui ne correspondent plus a rien. Rend le compte.

    Deux cas, et le second n'etait pas prevu :

      - la vignette est bien rangee en espace/bucket mais son PNG a disparu ;
      - la vignette date d'une DISPOSITION PRECEDENTE du cache. Avant la bascule
        d'espace Lena/NSFW, elles vivaient dans .thumbs/<bucket>/ sans niveau
        d'espace. Un balayage qui descend espace puis bucket ne les voit meme
        pas — constate le 25/08/2026 sur le disque reel : 9 fichiers oublies
        dans .thumbs/OK/, invisibles a la premiere version de cette fonction.

    Tout ce qui n'est pas a la profondeur attendue est donc perime par
    construction : la vignette se regenere a la demande, la jeter ne coute rien.

    Appelee au demarrage : c'est le seul moment ou le balayage complet ne coute
    rien a personne, et il rattrape ce qu'un arret brutal aurait laisse.
    """
    if not THUMBS.exists():
        return 0
    espaces = {"lena": OFM / "PROD" / "LENA", "nsfw": OFM / "PROD" / "_NSFW"}
    retirees = 0
    for v in THUMBS.rglob("*.jpg"):
        parts = v.relative_to(THUMBS).parts
        connue = (len(parts) == 3 and parts[0] in espaces and parts[1] in BUCKETS)
        if not connue or not (espaces[parts[0]] / parts[1]
                              / (v.stem + ".png")).exists():
            v.unlink(missing_ok=True)
            retirees += 1
    for d in sorted(THUMBS.rglob("*"), reverse=True):     # dossiers vides
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
    return retirees


# ----------------------------------------------------------------------- api
# Generation de vignettes : bornee, et jamais dans la boucle d'evenements.
# Mesure du 25/08/2026 : 26 ms par vignette sur une sortie 1080x1350, soit ~5 s
# de boucle gelee pour un dossier de 200 images a la premiere visite — pendant
# lesquelles /api/state ne repond plus et le tableau de bord parait fige. Meme
# raison que comfy_alive plus bas.
VIGNETTES = asyncio.Semaphore(4)


def _faire_vignette(source, cible):
    from PIL import Image
    im = Image.open(source).convert("RGB")
    im.thumbnail((420, 560), Image.LANCZOS)
    im.save(cible, quality=85)


COMFY_PROBE = {"ok": False, "at": 0.0}


def _probe_comfy(url):
    try:
        urllib.request.urlopen(url.rstrip("/") + "/system_stats", timeout=1.5).close()
        return True
    except Exception:
        return False


async def comfy_alive():
    """Sonde ComfyUI SANS bloquer la boucle d'evenements.

    urllib.urlopen est bloquant : l'appeler directement dans un handler async gele
    tout le serveur le temps du timeout. Le front interroge /api/state toutes les
    1,5 s, donc avec ComfyUI hors ligne (timeout plein) le tableau de bord etait
    bloque en permanence — mesure du 24/08/2026 : /api/plan passait de 1,7 ms a
    2005 ms. Le meme gel arrivait en production des que ComfyUI, occupe a generer,
    tardait a repondre. La sonde part donc dans un thread, et son resultat est
    garde une seconde.
    """
    now = time.monotonic()
    if now - COMFY_PROBE["at"] < 1.0:
        return COMFY_PROBE["ok"]
    ok = await asyncio.get_running_loop().run_in_executor(
        None, _probe_comfy, cfg()["comfy_url"])
    COMFY_PROBE.update(ok=ok, at=now)
    return ok
