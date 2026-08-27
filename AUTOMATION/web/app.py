"""Tableau de bord local pour la production.

Serveur aiohttp (deja fourni par ComfyUI, aucune dependance a installer) qui
pilote le meme coeur que la CLI : runner.execute_jobs.

    python_embeded\\python.exe ComfyUI\\output\\OFM\\AUTOMATION\\web\\app.py
    -> http://127.0.0.1:8189

Ecoute sur 127.0.0.1 par defaut. --host 0.0.0.0 l'expose au reseau local (utile
pour valider les images depuis le telephone) : a ne faire que sur un reseau de
confiance, il n'y a aucune authentification.
"""
import argparse
import asyncio
import base64
import csv
import json
import os
import re
import shutil
import sys
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

from aiohttp import web

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import env_config  # noqa: E402
import runner as lb      # noqa: E402
import mesures as mes  # noqa: E402
import compose as composer  # noqa: E402
import nsfw_batch  # noqa: E402
import comfy_server  # noqa: E402
import pose_tools  # noqa: E402

OFM = AUTOMATION.parent
COMFY = env_config.comfyui_root()

BUCKETS = ("OK", "A_REVOIR", "REJET", "SANS_VISAGE", "ARCHIVE")
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.\-]+\.(png|jpg|jpeg)$")
THUMBS = OFM / "PROD" / ".thumbs"


FORMATS_CONNUS = ("4:5", "2:3", "9:16", "1:1")
# Cles qui portent le parcours creatif. Elles ne sont pas obligatoires — une
# banque non migree n'en a pas — mais qu'un LOT de scenes en perde d'un coup
# n'est jamais une intention : c'est la signature de la regression du 25/08/2026,
# ou une reconstruction cote front les a effacees des 16 scenes en une
# sauvegarde. Voir DOCS/revue-web-2026-08-25.md.
CLES_SURVEILLEES = ("intention", "intensity", "tags", "tones", "wardrobe", "pose")


def valider_banque(data, ancienne=None, autoriser_pertes=False):
    """Rend la liste des problemes d'une banque de scenes. Liste vide = bonne.

    On refuse ici ce qui casserait la production plus tard et sans rapport
    apparent : `prefix`/`texture` absents font lever un KeyError a build_jobs,
    donc un 500 a chaque plan, tres loin de la sauvegarde qui l'a cause.
    """
    if not isinstance(data, dict):
        return ["le corps n'est pas un objet JSON"]
    pbs = []
    for cle in ("prefix", "anchor", "texture"):
        if not str(data.get(cle) or "").strip():
            pbs.append(f"champ racine manquant ou vide : « {cle} »")
    scenes = data.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        return pbs + ["« scenes » doit être une liste non vide"]

    vues = set()
    for i, s in enumerate(scenes):
        if not isinstance(s, dict):
            pbs.append(f"scène #{i + 1} : ce n'est pas un objet")
            continue
        sid = str(s.get("id") or "").strip()
        ou = sid or f"scène #{i + 1}"
        if not sid:
            pbs.append(f"{ou} : « id » manquant")
        elif sid in vues:
            pbs.append(f"{ou} : identifiant en double")
        vues.add(sid)
        if not str(s.get("prompt") or "").strip():
            pbs.append(f"{ou} : « prompt » vide")
        if s.get("format") and s["format"] not in FORMATS_CONNUS:
            pbs.append(f"{ou} : format inconnu « {s['format']} »")
        # Depuis le 26/08/2026 `intensity` porte le niveau MINIMUM, un entier.
        # Le maximum se deduit des tenues (lb.scene_band). L'ancienne forme
        # [bas, haut] reste acceptee : son `haut` est simplement ignore.
        band = s.get("intensity")
        entier = lambda v: isinstance(v, int) and not isinstance(v, bool)
        if band is not None and not (
                (entier(band) and 0 <= band <= 3)
                or (isinstance(band, list) and len(band) == 2
                    and all(entier(v) for v in band) and 0 <= band[0] <= band[1])):
            pbs.append(f"{ou} : « intensity » doit être le niveau minimum "
                       f"(entier de 0 à 3) — reçu {band!r}")
        wd = s.get("wardrobe")
        if wd is not None:
            if not isinstance(wd, dict):
                pbs.append(f"{ou} : « wardrobe » doit être un objet "
                           f"niveau → tenue")
            else:
                for lv, v in wd.items():
                    if not str(lv).isdigit():
                        pbs.append(f"{ou} : niveau de tenue non numérique "
                                   f"« {lv} »")
                    if not isinstance(v, (str, list)):
                        pbs.append(f"{ou} : tenue du niveau {lv} : ni texte "
                                   f"ni liste")
        # pose (26/08/2026) : un nom de fichier qui n'existe pas dans
        # INPUTS/POSE/ echouerait a l'execution, tres loin de l'ecran ou la
        # scene a ete enregistree — meme raisonnement que prefix/texture.
        pose = s.get("pose")
        if pose is not None:
            if not isinstance(pose, str) or not pose.strip():
                pbs.append(f"{ou} : « pose » doit être un nom de fichier")
            elif not (pose_tools.POSE_DIR / pose).exists():
                pbs.append(f"{ou} : squelette de pose introuvable — "
                           f"INPUTS/POSE/{pose}")

    # Garde anti-effacement en lot. Vider UNE scene est une edition legitime
    # (l'interface retire la cle quand on vide le champ) ; deux ou plus dans la
    # meme sauvegarde ne vient pas d'une main humaine sur cette interface.
    if ancienne and not autoriser_pertes:
        avant = {s.get("id"): s for s in ancienne.get("scenes", [])
                 if isinstance(s, dict)}
        touchees = {}
        for s in scenes:
            if not isinstance(s, dict):
                continue
            vieux = avant.get(s.get("id"))
            if not vieux:
                continue
            perdues = [c for c in CLES_SURVEILLEES if c in vieux and c not in s]
            if perdues:
                touchees[s.get("id")] = perdues
        if len(touchees) > 1:
            detail = " · ".join(f"{k} ({', '.join(v)})"
                                for k, v in list(touchees.items())[:4])
            pbs.append(f"{len(touchees)} scènes perdraient des réglages du "
                       f"parcours créatif d'un seul coup — refusé. {detail}"
                       + (" …" if len(touchees) > 4 else ""))
    return pbs


def sauvegarder_rotation(target, generations=3):
    """Rotation des .bak. Un slot unique ne protege que de la derniere erreur :
    le 25/08/2026 la sauvegarde saine allait etre ecrasee par la version abimee
    a la sauvegarde suivante, et c'etait la seule copie."""
    for n in range(generations, 1, -1):
        vieux = target.with_suffix(f".json.{n - 1}.bak" if n > 2 else ".json.bak")
        neuf = target.with_suffix(f".json.{n}.bak")
        if vieux.exists():
            shutil.copy(vieux, neuf)
    if target.exists():
        shutil.copy(target, target.with_suffix(".json.bak"))


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
RESEAU_OUVERT = False          # passe a True par --host autre que 127.0.0.1


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
def cfg():
    return lb.load_config("lena")


def scenes_data():
    return lb.load_scenes("lena")


def journal_index():
    """filename -> ligne du journal, pour afficher score/scene dans la galerie."""
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
    """Duree moyenne par image, lue dans le journal (donnee reelle, pas estimee)."""
    return _moyenne_duree(OFM / "PROD" / "journal_batch.csv", default)


def duree_unitaire():
    """Secondes par image du batch EN COURS, passe d'edition comprise.

    Au niveau 3 la chaine est en deux temps : generation au niveau de base, puis
    edition NSFW sur sa propre sortie. Ne compter que la generation faisait
    annoncer un reste a faire environ deux fois trop court.
    """
    base = avg_duration()
    palier = lb.by_level(lb.load_creative("lena"), STATE.get("intensity") or 0)
    if palier and palier.get("pipeline") == "flux+edit":
        base += _moyenne_duree(nsfw_batch.JOURNAL, 60.0)
    return base


def scene_stats():
    """Par scene : nombre d'images produites et score d'identite moyen.

    Depuis la base quand elle a des donnees — une requete au lieu d'un parcours
    de CSV, et l'historique complet plutot que les fichiers encore sur le disque.
    Repli sur le journal tant que la migration n'a pas ete lancee.
    """
    try:
        import base as db
        with db.ouvrir() as cx:
            s = db.stats_par_scene(cx, "lena")
        if s:
            return s
    except Exception as e:
        push_log(f"base illisible, repli sur le journal : {e}")

    path = OFM / "PROD" / "journal_batch.csv"
    if not path.exists():
        return {}
    acc = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            sid = row.get("scene")
            if not sid:
                continue
            e = acc.setdefault(sid, {"n": 0, "scores": [], "ok": 0})
            e["n"] += 1
            if row.get("verdict") == "OK":
                e["ok"] += 1
            try:
                e["scores"].append(float(row["score_identite"]))
            except (KeyError, TypeError, ValueError):
                pass
    out = {}
    for sid, e in acc.items():
        out[sid] = {"n": e["n"], "ok": e["ok"],
                    "avg": round(sum(e["scores"]) / len(e["scores"]), 3)
                           if e["scores"] else None}
    return out


def scene_previews():
    """scene -> derniere image produite, pour illustrer le selecteur de scenes."""
    index = journal_index()
    best = {}
    for bucket in ("OK", "A_REVOIR", "REJET"):
        d = bucket_dir(bucket)
        if not d.exists():
            continue
        for f in d.glob("*.png"):
            row = index.get(f.name)
            scene = row["scene"] if row else f.stem.rsplit("_", 2)[0]
            prev = best.get(scene)
            mtime = f.stat().st_mtime
            # priorite : image validee, puis la plus recente
            rank = (bucket == "OK", mtime)
            if not prev or rank > prev["rank"]:
                best[scene] = {"rank": rank, "bucket": bucket, "name": f.name}
    return {k: {"bucket": v["bucket"], "name": v["name"]} for k, v in best.items()}


def bucket_dir(bucket, space="lena"):
    if bucket not in BUCKETS:
        bad_request("bucket inconnu")
    if space == "nsfw":
        return OFM / "PROD" / "_NSFW" / bucket
    if space != "lena":
        bad_request("espace inconnu")
    return OFM / "PROD" / "LENA" / bucket


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


async def api_state(request):
    ok = await comfy_alive()
    counts = {b: len(list(bucket_dir(b).glob("*.png"))) if bucket_dir(b).exists() else 0
              for b in BUCKETS}
    # memes buckets, espace NSFW : sert a l'ecran Galerie/Revue quand la bascule
    # d'espace y est sur NSFW, pour que les compteurs de bucket affiches
    # correspondent a ce qui est reellement liste (sinon ils restent colles
    # aux chiffres SFW pendant qu'on regarde des images NSFW)
    nsfw_counts = {b: len(list(bucket_dir(b, "nsfw").glob("*.png")))
                   if bucket_dir(b, "nsfw").exists() else 0 for b in BUCKETS}
    eta = None
    if STATE["running"] and STATE["total"]:
        eta = round(duree_unitaire() * (STATE["total"] - STATE["index"] + 1))
    return web.json_response({**STATE, "comfy": ok, "counts": counts,
                              "nsfw_counts": nsfw_counts, "eta": eta,
                              "undo": len(UNDO)})


async def api_scenes(request):
    data = scenes_data()
    cats = sorted({lb.scene_intention(s) for s in data["scenes"]})
    # metadonnees du parcours, calculees ici pour que le front n'ait pas a
    # reimplementer les defauts de compatibilite du runner
    meta = {s["id"]: {"intention": lb.scene_intention(s),
                      "band": list(lb.scene_band(s)),
                      "tags": s.get("tags", []),
                      "tones": s.get("tones", []),
                      "pose": s.get("pose") or None}
            for s in data["scenes"]}
    return web.json_response({"data": data, "categories": cats,
                              "scene_ids": [s["id"] for s in data["scenes"]],
                              "previews": scene_previews(),
                              "meta": meta,
                              "stats": scene_stats(),
                              "avg_duration": round(avg_duration()),
                              "poses": pose_tools.poses_disponibles()})


async def api_scenes_save(request):
    body = await request.json()
    try:
        data = json.loads(body["text"]) if "text" in body else body["data"]
    except Exception as e:
        return web.json_response({"ok": False, "erreur": f"JSON invalide : {e}"},
                                 status=400)
    # Le serveur ne fait plus confiance au front sur la forme de la banque :
    # c'est ce controle qui manquait le 25/08/2026 quand une reconstruction cote
    # interface a efface le parcours creatif des 16 scenes sans que rien ne
    # l'arrete. Il ecrit un fichier que build_jobs saura lire, ou il refuse.
    pbs = valider_banque(data, ancienne=scenes_data(),
                         autoriser_pertes=bool(body.get("autoriser_pertes")))
    if pbs:
        push_log(f"scenes.json REFUSE — {pbs[0]}")
        return web.json_response({"ok": False, "erreur": pbs[0],
                                  "problemes": pbs}, status=400)
    target = lb.scenes_path("lena")
    sauvegarder_rotation(target)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    push_log(f"scenes.json enregistre ({len(data['scenes'])} scenes, .bak tourne)")
    return web.json_response({"ok": True})


async def api_config(request):
    return web.json_response(cfg())


def fusion_validee(actuel, envoye, ou):
    """N'accepte que des cles DEJA presentes, et du meme type.

    Cette route ecrivait config.json sans aucun controle. Une cle inconnue ne
    pilote rien — l'accepter ferait croire a un reglage qui n'existe pas, ce que
    le panneau se donne justement du mal a eviter (voir REGLAGES dans create.js).
    """
    def famille(v):
        # `bool` est un `int` en Python : le tester en premier, sinon True
        # passerait pour un nombre et guidance accepterait un booleen
        if isinstance(v, bool):
            return "booléen"
        if isinstance(v, (int, float)):
            return "nombre"
        if isinstance(v, str):
            return "texte"
        return "valeur non scalaire"

    garde = {}
    for cle, v in (envoye or {}).items():
        if cle not in actuel:
            bad_request(f"{ou} : réglage inconnu « {cle} »")
        attendue, recue = famille(actuel[cle]), famille(v)
        if attendue != recue:
            bad_request(f"{ou}.{cle} : {attendue} attendu, {recue} reçu")
        garde[cle] = v
    return garde


async def api_config_save(request):
    body = await request.json()
    target = lb.config_path("lena")
    current = cfg()
    current["preset"].update(fusion_validee(current["preset"],
                                            body.get("preset"), "preset"))
    if "qc" in body:
        current["qc"].update(fusion_validee(current["qc"], body["qc"], "qc"))
    shutil.copy(target, target.with_suffix(".json.bak"))
    target.write_text(json.dumps(current, ensure_ascii=False, indent=2),
                      encoding="utf-8")
    push_log("config.json enregistre")
    return web.json_response({"ok": True, "config": current})


def noter_bucket(nom, bucket, espace="lena", ancien_nom=None):
    """Reporte le TRI HUMAIN dans la base.

    `image.bucket` n'etait ecrit qu'a la generation, avec le verdict du QC. Or
    base.stats_par_scene compte `WHERE bucket = 'OK'` : le badge « n produites ·
    ok » des cartes de scene affichait donc le verdict automatique et ignorait
    tout du tri. Une image rejetee a la main y comptait encore comme validee.

    Ne doit jamais faire echouer un tri : le fichier, lui, a deja bouge.
    """
    try:
        import base as db
        with db.ouvrir() as cx:
            if ancien_nom and ancien_nom != nom:
                db.renommer(cx, ancien_nom, nom)
            db.enregistrer_image(cx, nom, bucket=bucket, espace=espace)
            cx.commit()
    except Exception as e:
        push_log(f"base : bucket non mis a jour pour {nom} — "
                 f"{type(e).__name__} : {e}")


def entier(body, cle, mini=None, maxi=None):
    """Entier d'un corps de requete, borne cote SERVEUR.

    Les attributs `max` du panneau de reglages ne valent que dans le navigateur :
    l'API acceptait n'importe quelle valeur, et `int()` sur une saisie non
    numerique levait un ValueError qui sortait en 500.
    """
    v = body.get(cle)
    if v in (None, ""):
        return None
    try:
        n = int(v)
    except (TypeError, ValueError):
        bad_request(f"« {cle} » doit être un nombre entier")
    if mini is not None:
        n = max(mini, n)
    if maxi is not None:
        n = min(maxi, n)
    return n


def scene_override(body):
    """Texte de scene amende POUR CE LANCEMENT, jamais enregistre.

    Borne a une seule scene retenue : avec plusieurs scenes, « la » scene ne
    designe rien, et appliquer le meme texte a toutes les ecraserait toutes.
    C'est aussi ce qui rend l'amendement lisible dans l'apercu — il n'y a qu'un
    prompt a montrer.

    Le texte passe par le meme `assert_no_face` que les scenes enregistrees :
    build_jobs le controle avec les autres fragments, il n'y a pas de porte
    derobee vers un prompt qui decrirait le visage.
    """
    txt = (body.get("scene_override") or "").strip()
    return txt if txt and len(body.get("scenes") or []) == 1 else None


def filters_from(body):
    return SimpleNamespace(
        scene_override=scene_override(body),
        scene=body.get("scenes") or None,
        category=body.get("categories") or None,
        format=body.get("format") or None,
        count=entier(body, "count", 1, 24),
        limit=entier(body, "limit", 1, 500),
        seed=entier(body, "seed"),          # un seed n'a pas de borne utile
        no_variants=bool(body.get("no_variants")),
        # parcours creatif : absent = niveau 0 (SFW strict)
        intensity=body.get("intensity"),
        tone=body.get("tone") or None,
        intention=body.get("intention") or None,
    )


def guard_intensity(body):
    """Verrous du curseur. Retourne un message d'erreur, ou None si c'est bon."""
    try:
        level = int(body.get("intensity") or 0)
    except (TypeError, ValueError):
        return "niveau d'intensite invalide"
    palier = lb.by_level(lb.load_creative("lena"), level)
    if palier is None:
        return f"niveau d'intensite inconnu : {level}"
    exige = palier.get("requires")
    if exige == "confirm" and not body.get("confirm_intensity"):
        return f"le niveau « {palier['label']} » demande une confirmation"
    if exige == "armed" and not nsfw_batch.is_armed(cfg()):
        return f"le niveau « {palier['label']} » demande la branche NSFW armee"
    if palier.get("pipeline") == "flux+edit" and not (
            body.get("edit_instruction") or "").strip():
        return (f"le niveau « {palier['label']} » demande une instruction "
                f"d'édition")
    if palier.get("pipeline") == "flux+edit" and body.get("no_qc"):
        # En mode `generer_avant`, le QC est le seul filtre qui protege
        # l'enchainement (chainage_nsfw) : sans lui execute_jobs code tout verdict
        # "OK" et absolument tout est edite, visage detecte ou non. En mode
        # edition, c'est lui qui donne son verdict — donc son dossier — a chaque
        # sortie : sans lui tout atterrit dans _NSFW/OK sans avoir ete mesure.
        return (f"le niveau « {palier['label']} » ne peut pas se passer du QC "
                f"d'identité — c'est lui qui décide du sort de chaque sortie")
    return None


async def api_creative(request):
    """Taxonomie du parcours : intentions, tons, echelle d'intensite."""
    creative = lb.load_creative("lena")
    data = scenes_data()
    configuration = cfg()
    armed = nsfw_batch.is_armed(configuration)
    # compte une seule fois : la sonde disque est la meme pour tous les paliers
    n_sources = len(nsfw_batch.sources_disponibles(configuration)) if armed else 0
    paliers = []
    for p in creative.get("intensity", []):
        exige = p.get("requires")
        verrouille = exige == "armed" and not armed
        edite = p.get("pipeline") == "flux+edit"
        # Le cran qui edite ne choisit pas de scene : annoncer un nombre de
        # scenes y etait trompeur (il affichait \u00ab 16 \u00bb, le compte du niveau de
        # base, alors qu'aucune scene n'y est utilisee). Il compte des images.
        # En mode `generer_avant`, c'est bien le niveau de base qui fait foi \u2014
        # mais ce mode est un repli, pas ce que le cran annonce.
        niveau_scenes = p.get("base_level", p["level"])
        paliers.append({**p,
                        "locked": verrouille,
                        "reason": "branche NSFW desarm\u00e9e" if verrouille else None,
                        "besoin_instruction": edite,
                        "unite": "image" if edite else "sc\u00e8ne",
                        "scenes": n_sources if edite else
                                  sum(1 for s in data["scenes"]
                                      if lb.scene_visible(s, niveau_scenes))})
    return web.json_response({"intentions": creative.get("intentions", []),
                              "tones": creative.get("tones", []),
                              "intensity": paliers})


# Reglages d'edition NSFW que le panneau a le droit de surcharger. Liste BLANCHE :
# `enabled` en est volontairement absent, l'armement de la branche est un rituel
# d'interface et ne doit pas pouvoir arriver par un corps de requete.
# Bornes cote serveur, en plus de la liste blanche. `max_pixels` sans plafond
# partait directement dans la surface de travail de Qwen.
NSFW_SURCHARGEABLES = {"steps": (1, 40), "cfg": (0.5, 8.0),
                       "max_pixels": (200_000, 4_000_000),
                       "face_denoise": (0.05, 0.95)}


def appliquer_nsfw(configuration, body):
    """Reporte les surcharges d'edition NSFW du payload dans la configuration."""
    retenu = {}
    for cle, (mini, maxi) in NSFW_SURCHARGEABLES.items():
        v = (body.get("nsfw") or {}).get(cle)
        if v is None:
            continue
        try:
            retenu[cle] = min(maxi, max(mini, float(v)))
        except (TypeError, ValueError):
            bad_request(f"nsfw.{cle} : valeur numérique attendue")
        if cle in ("steps", "max_pixels"):
            retenu[cle] = int(retenu[cle])
    if retenu:
        configuration.setdefault("nsfw", {}).update(retenu)
    return retenu


def appliquer_export(configuration, niveau_demande):
    """Coupe l'export quand le palier DEMANDE ne s'exporte pas.

    `sort_and_export` ne connait que `cfg["export"]["enabled"]` — et c'est tres
    bien : le runner n'a pas a connaitre les paliers d'intensite. C'est donc a
    l'appelant de traduire la regle du palier en configuration.

    Deux cas repares le 24/08/2026, tous deux constates en production :
      - niveau 2 (Suggestif, export false) : les images partaient quand meme dans
        PROD/EXPORT ;
      - niveau 3 : la passe INTERMEDIAIRE est generee en Soft, dont l'export est
        autorise. Une demande NSFW deposait donc silencieusement une image Soft
        dans le dossier de publication.
    """
    palier = lb.by_level(lb.load_creative("lena"), niveau_demande)
    if palier and not palier.get("export", True):
        configuration["export"] = dict(configuration["export"], enabled=False)
    return configuration


def niveau_generation(body):
    """Niveau auquel la PASSE DE GENERATION tourne.

    Au niveau 3 la chaine est en deux temps : on genere au `base_level` (Soft par
    defaut) puis on edite. Le curseur affiche 3, la generation tourne a 1.
    Ne concerne QUE le mode `generer_avant` — par defaut le cran NSFW n'engendre
    rien du tout (voir mode_edition).
    """
    corps = dict(body)
    palier = lb.by_level(lb.load_creative("lena"), int(body.get("intensity") or 0))
    if palier and palier.get("pipeline") == "flux+edit":
        corps["intensity"] = palier.get("base_level", 1)
    return corps


def mode_edition(body):
    """Vrai quand le cran demande EDITE une image existante au lieu d'engendrer.

    C'est le comportement par defaut du cran NSFW, et c'est la regle du projet :
    la branche edite une image deja validee, elle ne genere jamais de zero.
    `generer_avant` retablit l'enchainement generation -> edition pour le seul cas
    ou il sert : aucune image validee n'existe encore pour la scene voulue.

    Mesure du 26/08/2026 : sur 21 batches NSFW, 12 sont partis de l'edition d'une
    image existante. Le chemin qui regenerait avant d'editer coutait une passe
    Flux complete (~55 s) pour reproduire une image deja sur le disque.
    """
    palier = lb.by_level(lb.load_creative("lena"), int(body.get("intensity") or 0))
    return bool(palier and palier.get("pipeline") == "flux+edit"
                and not body.get("generer_avant"))


def sources_valides(body):
    """Sources cochees qui existent reellement dans PROD/LENA/OK.

    Filtre sur le disque et pas seulement sur la forme du nom : une image triee
    ailleurs entre la selection et le lancement ne doit pas partir en edition.
    """
    dispo = {f.name for f, _ in nsfw_batch.sources_disponibles(cfg())}
    return [n for n in (body.get("sources") or [])
            if SAFE_NAME.match(n) and n in dispo]


# Mots trop courants pour qu'un echo entre fragments veuille dire quelque chose.
MOTS_VIDES = {
    "with", "and", "the", "her", "his", "from", "into", "over", "onto", "that",
    "this", "some", "very", "more", "than", "then", "they", "them", "have",
    "been", "just", "only", "also", "such", "both", "each", "same", "other",
    "against", "around", "behind", "between", "through", "while", "where",
    "photo", "image", "woman", "shot",
}


def echos_entre_fragments(fragments):
    """Mots de fond qui reviennent dans PLUSIEURS fragments du prompt.

    Ni un mur ni un jugement : un constat. Deux fragments qui parlent du meme
    sujet se disputent — mesure du 26/08/2026 sur l'intention `boudoir`, ou le
    ton disait « close intimate framing » et l'intention « full figure in frame ».
    Le prompt final n'etant montre nulle part, ce genre de contradiction ne se
    voyait qu'en l'imprimant a la main.

    On rend le mot et les sources ou il apparait ; c'est l'humain qui tranche
    entre une repetition utile et une contradiction.
    """
    # Regroupement sur une racine legere : sans elle, « framing » et « frame »
    # sont deux mots differents, et c'est exactement le conflit qu'on cherche
    # (ton « close intimate framing » contre intention « full figure in frame »).
    # On genere les formes possibles d'un mot et on regroupe des qu'elles se
    # recoupent ; le mot AFFICHE reste celui qui a ete ecrit.
    def formes(mot):
        out = {mot}
        for suf in ("ing", "ed", "s"):
            if mot.endswith(suf) and len(mot) - len(suf) >= 3:
                base = mot[:-len(suf)]
                out |= {base, base + "e"}
        return out

    par_cle, mot_de = {}, {}
    for f in fragments:
        vus = set()
        for mot in re.findall(r"[a-zA-Z]{4,}", f["texte"].lower()):
            if mot in MOTS_VIDES:
                continue
            # suivre la cle CANONIQUE deja enregistree pour cette racine, et non
            # une des formes croisees : sinon « frame » vu apres « framing » se
            # rangeait sous sa propre cle et le rapprochement etait perdu
            communes = formes(mot) & set(mot_de)
            cle = mot_de[next(iter(communes))] if communes else mot
            if cle in vus:
                continue
            vus.add(cle)
            for forme in formes(mot):
                mot_de.setdefault(forme, cle)
            par_cle.setdefault(cle, {"mots": set(), "sources": []})
            par_cle[cle]["mots"].add(mot)
            par_cle[cle]["sources"].append(f["source"])
    echos = [{"mot": " / ".join(sorted(v["mots"])), "sources": v["sources"]}
             for v in par_cle.values() if len(v["sources"]) > 1]
    # les plus partages d'abord : ce sont les plus susceptibles de se disputer
    echos.sort(key=lambda e: (-len(e["sources"]), e["mot"]))
    return echos[:8]


def apercu_prompt(jobs):
    """Ce qui part vraiment, montre avant de lancer.

    Sur une scene type, 69 % du prompt final est assemble hors de la vue de qui
    ecrit la scene (mesure du 26/08/2026 : 179 caracteres ecrits sur 578). Tant
    que ce n'etait pas affiche, un resultat rate ne se diagnostiquait pas.
    """
    if not jobs:
        return None
    j = jobs[0]
    frags = j.get("fragments") or []
    total = len(j["prompt"])
    return {
        "total_car": total,
        "n_jobs": len(jobs),
        "scene": j["scene"],
        "fragments": [{**f, "part": round(100 * len(f["texte"]) / total)
                       if total else 0} for f in frags],
        "echos": echos_entre_fragments(frags),
    }


async def api_plan(request):
    body = await request.json()
    # les alertes ne dependent pas de la validite du plan : on les rend meme
    # quand le garde refuse, sinon l'ecran d'edition n'affiche rien tant que
    # l'instruction est vide — or c'est justement la qu'on la redige
    alertes = nsfw_batch.alertes_instruction(body.get("edit_instruction") or "")
    if err := guard_intensity(body):
        return web.json_response({"total": 0, "jobs": [], "erreur": err,
                                  "alertes": alertes})
    if mode_edition(body):
        # rien a batir : le « plan » est la liste des images cochees
        return web.json_response({"total": len(sources_valides(body)), "jobs": [],
                                  "edition": True, "alertes": alertes})
    jobs = lb.build_jobs(lb.scenes_path("lena"),
                         filters_from(niveau_generation(body)))
    return web.json_response({"total": len(jobs), "alertes": alertes,
                              "apercu": apercu_prompt(jobs), "jobs": [
        {"scene": j["scene"], "category": j["category"], "format": j["format"],
         "variant": j["variant"], "seed": j["seed"], "prompt": j["prompt"],
         "intensity": j["intensity"], "outfit": j["outfit"]}
        for j in jobs]})


def chainage_nsfw(configuration, use_qc, batch_id):
    """Crochet du niveau 3 : editer la sortie SFW, sans tri intermediaire.

    Rend None quand le batch n'est pas de niveau 3. Les garde-fous ne bougent pas :
    la sortie va dans PROD/_NSFW, elle n'est jamais exportee, et `editer` verifie
    l'armement une seconde fois.
    """
    niveau = configuration.get("_intensity", 0)
    palier = lb.by_level(lb.load_creative("lena"), niveau)
    if not palier or palier.get("pipeline") != "flux+edit":
        return None
    instruction = configuration.get("_edit_instruction", "")
    etat = {"runner": None, "rows": []}

    permis = configuration.get("nsfw", {}).get("chainer_si", ["OK", "A_REVOIR"])

    def crochet(job, verdict, dest):
        # L'etage NSFW RE-REND le visage depuis la base gelee (PuLID +
        # FaceDetailer) : mesure du 24/08/2026 sur 9 enchainements, l'identite
        # gagne +0.028 en moyenne, 8 fois sur 9. Une source un peu basse produit
        # donc tres souvent une sortie conforme. Refuser sur le seul verdict OK
        # rejetait du travail qui aboutit. On ne coupe que sous la bande de
        # surveillance, ou quand aucun visage n'a ete detecte : la, PuLID n'a
        # rien de coherent a rattraper.
        if verdict not in permis:
            push_log(f"{dest.name} : passe SFW {verdict}, édition non enchaînée")
            return
        if etat["runner"] is None:               # construit une seule fois
            etat["runner"] = nsfw_batch.NsfwRunner(configuration)
        result, ligne = nsfw_batch.editer(
            dest, instruction, configuration, CHECKER if use_qc else None,
            runner=etat["runner"], batch_id=batch_id)
        if ligne:
            etat["rows"].append(ligne)
            nsfw_batch.journal([ligne])
            sc = f" ({result['score']:.3f})" if result.get("score") else ""
            push_log(f"→ NSFW {result['fichier']} : {result['verdict']}{sc} "
                     f"— {result['duree']:.0f}s")
            # la bande en direct ne montrait que la passe SFW : au niveau 3 on
            # regardait donc l'image intermediaire, jamais celle qui est produite
            STATE["recent"].append({"bucket": result["verdict"],
                                    "name": result["fichier"],
                                    "scene": f"{job['scene']} · édité",
                                    "space": "nsfw", "score": result.get("score")})
            del STATE["recent"][:-24]
        else:
            push_log(f"→ NSFW échec sur {dest.name} : {result.get('error')}")

    return crochet


def run_batch_blocking(jobs, configuration, batch_id, use_qc):
    if use_qc:
        checker_partage(configuration)

    def on_event(kind, **kw):
        if kind == "start":
            STATE.update(index=kw["index"], total=kw["total"],
                         current=f"{kw['job']['scene']} ({kw['job']['format']})")
        else:
            job, r = kw["job"], kw["result"]
            if r["verdict"] == "ERREUR":
                push_log(f"{kw['index']}/{kw['total']} {job['scene']} : ECHEC — "
                         f"{r.get('error')}")
            else:
                sc = f" ({r['score']:.3f})" if r.get("score") else ""
                push_log(f"{kw['index']}/{kw['total']} {job['scene']} : "
                         f"{r['verdict']}{sc} — {r['duree']:.0f}s")
                STATE["recent"].append({"bucket": r["verdict"], "name": r["fichier"],
                                        "scene": job["scene"], "space": "lena",
                                        "score": r.get("score")})
                del STATE["recent"][:-24]

    rows, stats = lb.execute_jobs(jobs, configuration,
                                 CHECKER if use_qc else None, batch_id,
                                 on_event=on_event,
                                 should_stop=lambda: STATE["stop"],
                                 after=chainage_nsfw(configuration, use_qc, batch_id))
    return stats


def _lancer(travail):
    """Boucle d'execution commune : `travail()` hors boucle d'evenements.

    Range les stats, remonte l'erreur a l'ecran, et remet STATE au repos quoi
    qu'il arrive. Partagee par la production et par l'edition : c'est ce qui
    garantit qu'un seul batch tourne, et qu'un seul panneau le montre.
    """
    async def runner():
        try:
            stats = await asyncio.get_running_loop().run_in_executor(None, travail)
            STATE["stats"] = stats
            push_log("termine — " + " | ".join(f"{k} {v}" for k, v in stats.items() if v))
        except Exception as e:                       # remonte l'erreur a l'ecran
            push_log(f"ERREUR : {type(e).__name__} — {e}")
        finally:
            STATE.update(running=False, current=None)

    asyncio.create_task(runner())


def edition_blocking(sources, instruction, configuration, use_qc):
    """Edition d'images deja validees, sur le meme STATE que la production."""
    if use_qc:
        checker_partage(configuration)

    def on_event(kind, **kw):
        if kind == "start":
            STATE.update(index=kw["index"], total=kw["total"], current=kw["source"])
        else:
            r = kw["result"]
            if r["verdict"] == "ERREUR":
                push_log(f"{kw['index']}/{kw['total']} {kw['source']} : ECHEC — "
                         f"{r.get('error')}")
            else:
                sc = f" ({r['score']:.3f})" if r.get("score") else ""
                push_log(f"{kw['index']}/{kw['total']} {kw['source']} : "
                         f"{r['verdict']}{sc} — {r['duree']:.0f}s")
                # space nsfw : la sortie vit dans PROD/_NSFW, /img la cherche la
                STATE["recent"].append({"bucket": r["verdict"], "name": r["fichier"],
                                        "scene": kw["source"], "space": "nsfw",
                                        "score": r.get("score")})
                del STATE["recent"][:-24]

    return nsfw_batch.run(sources, instruction, configuration,
                          CHECKER if use_qc else None, on_event,
                          should_stop=lambda: STATE["stop"])[1]


def demarrer_edition(sources, instruction, configuration, use_qc, niveau):
    """Lance une edition. Pendant de `demarrer`, meme etat, meme panneau."""
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    STATE.update(running=True, stop=False, batch_id=batch_id, index=0,
                 total=len(sources), current=None, stats={}, recent=[],
                 intensity=niveau,
                 started_at=datetime.now().isoformat(timespec="seconds"))
    push_log(f"édition {batch_id} — {len(sources)} image(s) déjà validée(s) "
             f"· sortie dans PROD/_NSFW · hors export")
    push_log(f"instruction : {instruction[:100]}")
    for a in nsfw_batch.alertes_instruction(instruction):
        push_log(f"  ! {a}")
    _lancer(lambda: edition_blocking(sources, instruction, configuration, use_qc))
    return batch_id


def demarrer(jobs, configuration, use_qc, entete=None):
    """Demarre un batch et rend son identifiant. Un seul chemin de lancement.

    Utilise par /api/run (production) et /api/decline (boucle de raffinement).
    Dupliquer ce bloc, c'est se garantir deux comportements qui divergent.
    """
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    STATE.update(running=True, stop=False, batch_id=batch_id, index=0,
                 total=len(jobs), current=None, stats={}, recent=[],
                 started_at=datetime.now().isoformat(timespec="seconds"))
    p = configuration["preset"]
    # le niveau DEMANDE, pas celui de la passe de generation : au niveau 3 les
    # jobs sont batis en Soft, annoncer « Soft » induirait en erreur
    demande = configuration.get("_intensity", jobs[0]["intensity"])
    palier = lb.by_level(lb.load_creative("lena"), demande)
    STATE["intensity"] = demande
    exporte = "" if not palier or palier.get("export", True) else " · hors export"
    push_log(entete or (f"batch {batch_id} — intensite "
                        f"« {palier['label'] if palier else '?'} »"
                        + (f" · ton {jobs[0]['tone']}" if jobs[0]["tone"] else "")
                        + exporte))
    push_log(f"batch {batch_id} — {len(jobs)} image(s) · guidance {p['guidance']} · "
             f"refiner {'ON' if p['refiner'] else 'OFF'} · "
             f"detail {'ON' if p['facedetailer'] else 'OFF'} · "
             f"grain {'ON' if p['grain_export'] else 'OFF'}")

    _lancer(lambda: run_batch_blocking(jobs, configuration, batch_id, use_qc))
    return batch_id


DECLINAISONS = {
    "lumiere":   "autre lumière",
    "ton":       "autre ton",
    "seeds":     "même scène, autres tirages",
    "intensite": "monter d'un cran",
    "editer":    "éditer en NSFW",
}


def palier_edition(creative):
    """Le palier qui edite une image au lieu d'en engendrer une, s'il existe."""
    return next((p for p in creative.get("intensity", [])
                 if p.get("pipeline") == "flux+edit"), None)


def lancer_edition_depuis(name, body, niveau):
    """Edite UNE image de la revue, sans rien regenerer.

    Avant le 26/08/2026, ce geste passait par build_jobs et REGENERAIT la source
    au meme seed (~55 s) pour la reproduire a l'identique avant de l'editer —
    alors qu'on l'a sous les yeux, sur le disque. Depuis une image Soft il fallait
    en plus decliner deux fois, donc deux regenerations, et l'image Suggestif
    intermediaire etait produite et rangee pour rien.
    """
    err = guard_intensity({"intensity": niveau,
                           "confirm_intensity": body.get("confirm_intensity"),
                           "edit_instruction": body.get("edit_instruction"),
                           "no_qc": body.get("no_qc")})
    if err:
        return web.json_response({"ok": False, "erreur": err}, status=403)
    if nsfw_batch.resoudre_source(name, cfg()) is None:
        return web.json_response(
            {"ok": False, "erreur": "cette image n'est pas éditable — seules les "
                                    "images validées ou à revoir le sont"}, status=400)
    configuration = cfg()
    configuration["_intensity"] = niveau
    appliquer_export(configuration, niveau)
    batch_id = demarrer_edition([name], (body.get("edit_instruction") or "").strip(),
                                configuration, not body.get("no_qc"), niveau)
    return web.json_response({"ok": True, "batch_id": batch_id, "total": 1,
                              "mode": "editer", "edition": True,
                              "libelle": DECLINAISONS["editer"]})


async def api_decline(request):
    """Boucle courte : repartir d'une image deja produite.

    `dry` rend seulement ce que chaque mode produirait, pour que l'interface
    n'affiche que les declinaisons qui ont un sens sur cette image.
    """
    body = await request.json()
    name = body.get("name", "")
    if not SAFE_NAME.match(name):
        bad_request("nom de fichier invalide")
    row = journal_index().get(name)
    if not row:
        return web.json_response(
            {"ok": False, "erreur": "image absente du journal — impossible de la "
                                    "rejouer (scène et seed inconnus)"}, status=404)
    creative = lb.load_creative("lena")
    scenes = lb.scenes_path("lena")
    niveau = int(row.get("intensite") or 0)

    if body.get("dry"):
        dispo = {}
        for mode in lb.MODES_DECLINAISON:
            if mode == "ton":
                dispo[mode] = [t for t in creative.get("tones", [])
                               if t["key"] != (row.get("ton") or None)]
            else:
                dispo[mode] = len(lb.jobs_declinaison(
                    scenes, row, mode, creative, n=int(body.get("n") or 3)))
        suivant = lb.by_level(creative, niveau + 1)
        # le bouton "monter d'un cran" doit refleter les MEMES verrous que le
        # curseur principal : confirmation a montrer, armement a proposer
        # plutot que de laisser cliquer puis echouer sur un toast generique
        configuration = cfg()
        arme = nsfw_batch.is_armed(configuration)
        verrouille = (suivant is not None and suivant.get("requires") == "armed"
                      and not arme)
        # L'edition ne monte pas d'un cran : elle part de l'image affichee, quel
        # que soit son niveau. C'est le geste « j'aime celle-ci, edite-la », qui
        # n'existait jusqu'ici que dans un onglet a part.
        edit = palier_edition(creative)
        dispo["editer"] = bool(
            edit and nsfw_batch.resoudre_source(name, configuration))
        return web.json_response({
            "ok": True, "modes": dispo, "scene": row.get("scene"),
            "intensite": niveau, "ton": row.get("ton") or "",
            "niveau_suivant": suivant["label"] if suivant else None,
            "suivant_requires": suivant.get("requires") if suivant else None,
            "suivant_verrouille": verrouille,
            "edition_label": edit["label"] if edit else None,
            "edition_verrouillee": bool(edit and edit.get("requires") == "armed"
                                        and not arme),
            "suivant_instruction": bool(suivant and
                                        suivant.get("pipeline") == "flux+edit")})

    if STATE["running"]:
        return web.json_response({"ok": False, "erreur": "un batch tourne deja"},
                                 status=409)
    mode = body.get("mode")
    edit = palier_edition(creative)
    # « editer » ne rebatit aucun job : elle edite l'image affichee. Traitee avant
    # MODES_DECLINAISON, qui ne connait que les modes de build_jobs. « monter d'un
    # cran » y aboutit aussi quand le cran vise est celui qui edite : monter vers
    # lui, c'est editer, pas regenerer.
    if mode == "editer" or (mode == "intensite" and edit
                            and edit["level"] == niveau + 1):
        if edit is None:
            return web.json_response(
                {"ok": False, "erreur": "aucun palier d'édition configuré"},
                status=400)
        return lancer_edition_depuis(name, body, edit["level"])
    if mode not in lb.MODES_DECLINAISON:
        return web.json_response({"ok": False, "erreur": "mode inconnu"}, status=400)
    if mode == "intensite":
        # le curseur a des verrous : une declinaison ne doit pas les contourner
        err = guard_intensity({"intensity": niveau + 1,
                               "confirm_intensity": body.get("confirm_intensity"),
                               "edit_instruction": body.get("edit_instruction"),
                               "no_qc": body.get("no_qc")})
        if err:
            return web.json_response({"ok": False, "erreur": err}, status=403)

    jobs = lb.jobs_declinaison(scenes, row, mode, creative,
                               n=int(body.get("n") or 3), tone=body.get("tone"))
    if not jobs:
        raison = {"lumiere": "cette scène n'a pas d'autre variante de lumière",
                  "ton": "choisis un ton différent de celui de l'image",
                  "intensite": "cette image est déjà au niveau le plus haut",
                  "seeds": "aucune scène correspondante"}[mode]
        return web.json_response({"ok": False, "erreur": raison}, status=400)

    configuration = cfg()
    if mode == "intensite":
        # meme cablage que /api/run : c'est ce qui declenche l'enchainement
        configuration["_intensity"] = niveau + 1
        configuration["_edit_instruction"] = (body.get("edit_instruction") or "").strip()
        appliquer_export(configuration, niveau + 1)
    batch_id = demarrer(jobs, configuration, not body.get("no_qc"),
                        entete=f"déclinaison « {DECLINAISONS[mode]} » depuis {name}")
    return web.json_response({"ok": True, "batch_id": batch_id, "total": len(jobs),
                              "mode": mode, "libelle": DECLINAISONS[mode]})


async def api_run(request):
    # Le corps se lit AVANT le garde : `await` rend la main a la boucle, donc
    # tester STATE avant la lecture laissait deux requetes concurrentes franchir
    # le test toutes les deux et lancer deux batches sur le meme GPU.
    body = await request.json()
    if STATE["running"]:
        return web.json_response({"ok": False, "erreur": "un batch tourne deja"},
                                 status=409)
    if err := guard_intensity(body):
        return web.json_response({"ok": False, "erreur": err}, status=403)

    # Cran NSFW : on edite des images deja validees, on n'engendre rien. Un seul
    # point d'entree pour les deux modes — c'est ce qui a permis de retirer
    # l'onglet NSFW parallele et ses trois champs d'instruction concurrents.
    if mode_edition(body):
        sources = sources_valides(body)
        if not sources:
            return web.json_response(
                {"ok": False, "erreur": "aucune image source valide — coche au "
                                        "moins une image déjà validée"}, status=400)
        configuration = cfg()
        configuration["preset"].update(body.get("preset", {}))
        appliquer_nsfw(configuration, body)
        niveau = int(body.get("intensity") or 0)
        configuration["_intensity"] = niveau
        appliquer_export(configuration, niveau)
        batch_id = demarrer_edition(
            sources, (body.get("edit_instruction") or "").strip(),
            configuration, not body.get("no_qc"), niveau)
        return web.json_response({"ok": True, "batch_id": batch_id,
                                  "total": len(sources), "edition": True})

    jobs = lb.build_jobs(lb.scenes_path("lena"),
                         filters_from(niveau_generation(body)))
    if not jobs:
        return web.json_response({"ok": False, "erreur": "aucune scene ne correspond"},
                                 status=400)

    configuration = cfg()
    configuration["preset"].update(body.get("preset", {}))
    appliquer_nsfw(configuration, body)
    # l'instruction voyage avec la configuration du batch : run_batch_blocking la
    # relit pour cabler l'enchainement
    configuration["_intensity"] = int(body.get("intensity") or 0)
    configuration["_edit_instruction"] = (body.get("edit_instruction") or "").strip()
    appliquer_export(configuration, configuration["_intensity"])
    batch_id = demarrer(jobs, configuration, not body.get("no_qc"))
    return web.json_response({"ok": True, "batch_id": batch_id, "total": len(jobs)})


async def api_stop(request):
    if not STATE["running"]:
        # repondre « ok » sans rien arreter laissait STATE["stop"] arme, et le
        # batch suivant s'arretait tout seul apres sa premiere image
        return web.json_response({"ok": False, "erreur": "aucun batch en cours"},
                                 status=409)
    STATE["stop"] = True
    push_log("arret demande — le batch s'arrete apres l'image en cours")
    return web.json_response({"ok": True})


async def api_gallery(request):
    bucket = request.query.get("bucket", "OK")
    space = request.query.get("space", "lena")
    d = bucket_dir(bucket, space)
    files = sorted(d.glob("*.png"), key=lambda f: f.stat().st_mtime,
                   reverse=True) if d.exists() else []
    index = journal_index() if space == "lena" else nsfw_journal_index()
    store = mes.charger()
    # Compte sur TOUT le dossier, pas sur les 200 affichees : le bouton annonce
    # ce que /api/mesurer aura reellement a faire, et lui parcourt tout. Les deux
    # chiffres se contredisaient des que le dossier depassait 200 images.
    sans_mesure = sum(1 for f in files if "nettete" not in store.get(f.name, {}))
    items = []
    for f in files[:200]:
        row = index.get(f.name, {})
        m = store.get(f.name, {})
        items.append({
            "name": f.name, "bucket": bucket, "space": space,
            "score": row.get("score_identite", "") or (
                f"{m['identite']:.3f}" if isinstance(m.get("identite"), float) else ""),
            "scene": row.get("scene", ""), "categorie": row.get("categorie", ""),
            "format": row.get("format", ""), "seed": row.get("seed", ""),
            "date": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d/%m %H:%M"),
            "prompt": row.get("prompt", ""),
            "nettete": m.get("nettete"), "texture": m.get("texture_visage"),
            "fond": m.get("bruit_fond"), "flag": m.get("flag"),
        })
    entrees = list(store.values())
    refs = [e for e in entrees if e.get("role") == "reference"]
    return web.json_response({
        "items": items, "sans_mesure": sans_mesure,
        "references": {"mesurees": len(refs), "total": len(mes.fichiers_reference())},
        # bandes d'etalonnage : deduites des images jugees convaincantes, jamais
        # ecrites en dur. None tant qu'il n'y a pas assez de jugements.
        "bandes": {c: mes.bande(entrees, c)
                   for c in ("nettete", "texture_visage", "bruit_fond")},
        "juges": sum(1 for e in entrees if e.get("flag"))})


async def api_flag(request):
    """Jugement humain sur le realisme. Independant du tri : il ne bouge rien."""
    body = await request.json()
    name = body.get("name", "")
    if not SAFE_NAME.match(name):
        bad_request("nom de fichier invalide")
    flag = body.get("flag")
    if flag not in (None, "ok", "ia"):
        return web.json_response({"ok": False, "erreur": "flag inconnu"}, status=400)
    mes.poser_flag(name, flag)
    return web.json_response({"ok": True, "flag": flag})


async def api_mesurer(request):
    """Rattrape les mesures manquantes d'un dossier.

    Par paquets : une passe InsightFace coute ~190 ms, mesurer 200 images d'un
    coup ferait expirer la requete. Le front rappelle tant que `restant` > 0.
    Tout tourne dans un thread — un handler async ne doit jamais bloquer la
    boucle (voir le commentaire de comfy_alive).
    """
    body = await request.json()
    if STATE["running"]:
        # InsightFace tourne sur le CPU pendant que ComfyUI occupe le GPU :
        # mesurer pendant une production ralentit le batch pour rien, et les
        # images non mesurees seront de toute facon la a la fin.
        return web.json_response(
            {"ok": False, "erreur": "une production tourne — mesure après"},
            status=409)
    bucket = body.get("bucket", "OK")
    space = body.get("space", "lena")
    lot = max(1, min(40, int(body.get("lot") or 20)))
    d = bucket_dir(bucket, space)
    if not d.exists():
        return web.json_response({"ok": True, "faites": 0, "restant": 0})

    store = mes.charger()
    a_faire = [f for f in sorted(d.glob("*.png"), key=lambda f: f.stat().st_mtime,
                                 reverse=True)
               if "nettete" not in store.get(f.name, {})]
    refs_a_faire = [f for f in mes.fichiers_reference()
                    if "nettete" not in store.get(f.name, {})]
    if not a_faire and not refs_a_faire:
        return web.json_response({"ok": True, "faites": 0, "restant": 0})

    checker = await asyncio.get_running_loop().run_in_executor(
        None, checker_partage, cfg())

    paquet = a_faire[:lot]

    def travail():
        # le corpus de reference d'abord : sans lui les bandes n'ont pas d'echelle
        if refs_a_faire:
            n, tot = mes.mesurer_references(checker=checker)
            push_log(f"corpus de reference : {n}/{tot} image(s) mesurée(s)")
        for f in paquet:
            try:
                mes.mesurer(f, checker=checker)
            except Exception as e:
                push_log(f"mesure impossible sur {f.name} : {e}")
        return len(paquet)

    faites = await asyncio.get_running_loop().run_in_executor(None, travail)
    restant = len(a_faire) - faites
    push_log(f"realisme : {faites} image(s) mesurée(s), {restant} restante(s)")
    return web.json_response({"ok": True, "faites": faites, "restant": restant})


ACTIONS = {"valider": "OK", "revoir": "A_REVOIR", "rejeter": "REJET",
           "archiver": "ARCHIVE"}


def exporter(src, nom_journal, espace="lena"):
    """Produit le JPEG publiable. Rend son nom, ou "" si rien n'a ete ecrit.

    `nom_journal` est le nom sous lequel l'image est INSCRITE AU JOURNAL, pas
    forcement celui du fichier : un renommage de collision les separe. Relire le
    journal avec le nom final rendait une ligne vide, donc `categorie = divers`
    et `format = 4:5` par defaut — l'export partait dans le mauvais dossier et
    une image 9:16 se retrouvait redimensionnee en 1080x1350.
    """
    if espace != "lena":                  # la branche NSFW ne s'exporte jamais
        return ""
    row = journal_index().get(nom_journal, {})
    configuration = cfg()
    fmt = row.get("format") or "4:5"
    cat = row.get("categorie") or "divers"
    try:
        from PIL import Image
        exp_dir = OFM / "PROD" / "EXPORT" / cat
        exp_dir.mkdir(parents=True, exist_ok=True)
        out = exp_dir / (Path(src).stem + "." + configuration["export"]["format"])
        im = Image.open(src).convert("RGB")
        size = tuple(configuration["export_sizes"].get(fmt, im.size))
        if im.size != size:
            im = im.resize(size, Image.LANCZOS)
        im.save(out, quality=configuration["export"]["quality"], subsampling=0)
        return out.name
    except Exception as e:
        push_log(f"export impossible pour {Path(src).name} : {e}")
        return ""


def retirer_export(nom):
    """Sort une image de la publication. Rend le nombre de fichiers retires."""
    retires = 0
    for f in (OFM / "PROD" / "EXPORT").rglob(Path(nom).stem + ".*"):
        f.unlink(missing_ok=True)
        retires += 1
    return retires


async def api_action(request):
    body = await request.json()
    name = body.get("name", "")
    bucket, action = body.get("bucket", ""), body.get("action", "")
    space = body.get("space", "lena")
    if not SAFE_NAME.match(name):
        bad_request("nom de fichier invalide")
    if action not in ACTIONS:
        bad_request(f"action inconnue : « {action} »")
    origine = name                      # nom sous lequel le journal la connait
    src = bucket_dir(bucket, space) / name
    if not src.exists():
        return web.json_response({"ok": False, "erreur": "fichier introuvable"},
                                 status=404)
    dest_bucket = ACTIONS[action]
    dest_dir = bucket_dir(dest_bucket, space)
    dest_dir.mkdir(parents=True, exist_ok=True)
    final = name
    if dest_bucket != bucket:
        # Jamais d'ecrasement : un homonyme dans le dossier d'arrivee est une
        # image differente (cas historique, voir lb.nom_libre). shutil.move
        # l'ecraserait sans rien dire.
        if (dest_dir / name).exists():
            final = lb.nom_libre(Path(name).stem, dest_dir.parent,
                                 Path(name).suffix)
            push_log(f"{name} existait déjà dans {dest_bucket} — renommé {final}")
            mes.renommer(name, final)
        shutil.move(str(src), str(dest_dir / final))
        oublier_vignette(origine, bucket, space)   # elle repartait du dossier quitte
        src = dest_dir / final
    name = final

    exported = ""
    if action == "valider":
        exported = exporter(src, origine, space)
    elif space == "lena" and dest_bucket != "OK":
        # Sortir une image de OK doit la sortir AUSSI de la publication. Sans ca
        # le dossier d'export accumule des images rejetees : constate le
        # 25/08/2026, 11 JPEG dont le PNG etait en REJET. Seul le bouton
        # « annuler » nettoyait, un rejet normal ne nettoyait pas.
        retires = retirer_export(name)
        if retires:
            push_log(f"{name} sort de l'export ({retires} fichier(s) retire(s))")
    if dest_bucket != bucket:
        noter_bucket(name, dest_bucket, space,
                     ancien_nom=origine if name != origine else None)
        UNDO.append({"name": name, "from": bucket, "to": dest_bucket,
                     "export": exported, "space": space, "journal": origine})
        del UNDO[:-50]
    push_log(f"{name} → {dest_bucket}" + (f" (export {exported})" if exported else ""))
    return web.json_response({"ok": True, "bucket": dest_bucket, "export": exported,
                              "undo": len(UNDO)})


async def api_delete(request):
    """Suppression DEFINITIVE — pas un tri, pas dans UNDO, pas de retour.

    Retire le fichier, sa vignette et sa copie d'export. `journal_batch.csv`,
    `mesures.json` et `PROD/comfystudio.db` restent intacts : ce sont des historiques
    append-only ailleurs dans le projet (meme raison que le jugement humain ne
    vit pas dans le journal), pas un index de ce qui existe sur le disque — une
    ligne qui pointe vers un fichier disparu reste un fait vrai : cette image a
    existé, a été notée, et a été supprimée.
    """
    body = await request.json()
    name = body.get("name", "")
    bucket, space = body.get("bucket", ""), body.get("space", "lena")
    if not SAFE_NAME.match(name):
        bad_request("nom de fichier invalide")
    path = bucket_dir(bucket, space) / name
    if not path.exists():
        return web.json_response({"ok": False, "erreur": "fichier introuvable"},
                                 status=404)
    path.unlink()
    oublier_vignette(name, bucket, space)
    retires = retirer_export(name) if space == "lena" else 0
    push_log(f"{name} supprimée définitivement" +
             (f" (export retiré : {retires} fichier(s))" if retires else ""))
    return web.json_response({"ok": True})


async def api_edit_save(request):
    """Enregistre une copie retouchee (recadrage/couleur/grain, cote navigateur).

    Toujours un NOUVEAU fichier, dans le meme bucket que l'original — jamais un
    ecrasement : l'original reste comparable, et supprimable a part via
    api_delete. Ni mesure ni export automatique : ce n'est pas une generation,
    `api_mesurer` reste le chemin pour noter la copie si besoin.
    """
    body = await request.json()
    name = (body.get("name") or "").strip()
    bucket, space = body.get("bucket", ""), body.get("space", "lena")
    b64 = body.get("data_base64") or ""
    if not SAFE_NAME.match(name):
        bad_request("nom de fichier invalide")
    if not b64:
        return web.json_response({"ok": False, "erreur": "image vide"}, status=400)
    try:
        data = base64.b64decode(b64, validate=True)
    except Exception:
        return web.json_response({"ok": False, "erreur": "image mal encodée"},
                                 status=400)
    if len(data) > TAILLE_MAX_PHOTO:
        return web.json_response(
            {"ok": False, "erreur": "image trop lourde (20 Mo max)"}, status=400)
    dest_dir = bucket_dir(bucket, space)
    if not (dest_dir / name).exists():
        return web.json_response(
            {"ok": False, "erreur": "image d'origine introuvable"}, status=404)
    final = lb.nom_libre(f"{Path(name).stem}_edit", dest_dir.parent)
    (dest_dir / final).write_bytes(data)
    push_log(f"{final} enregistrée (édition de {name})")
    return web.json_response({"ok": True, "name": final})


async def api_undo(request):
    """Annule le dernier tri : remet l'image dans son dossier d'origine."""
    if not UNDO:
        return web.json_response({"ok": False, "erreur": "rien a annuler"}, status=400)
    act = UNDO.pop()
    space = act.get("space", "lena")
    src = bucket_dir(act["to"], space) / act["name"]
    retour = bucket_dir(act["from"], space)
    nom = act["name"]
    if src.exists():
        retour.mkdir(parents=True, exist_ok=True)
        # Meme garde qu'a l'aller : un homonyme dans le dossier d'origine est une
        # image DIFFERENTE, et shutil.move l'ecraserait sans rien dire. Le chemin
        # retour n'avait pas la protection que le chemin aller prend soin d'avoir.
        if (retour / nom).exists():
            nom = lb.nom_libre(Path(nom).stem, retour.parent, Path(nom).suffix)
            push_log(f"{act['name']} existait déjà dans {act['from']} — "
                     f"renommé {nom}")
            mes.renommer(act["name"], nom)
        shutil.move(str(src), str(retour / nom))
        oublier_vignette(act["name"], act["to"], space)
    if act.get("export"):
        for f in (OFM / "PROD" / "EXPORT").rglob(act["export"]):
            f.unlink(missing_ok=True)
    # Annuler un rejet doit REMETTRE l'image en publication : le rejet avait
    # supprime le JPEG, et l'annulation le laissait supprime. L'image revenait
    # dans OK sans son export, sans que rien ne le signale.
    refait = ""
    if act["from"] == "OK" and space == "lena":
        cible = retour / nom
        if cible.exists():
            refait = exporter(cible, act.get("journal", act["name"]), space)
    # l'annulation est un tri comme un autre : la base doit la suivre, sinon
    # elle garde le bucket de l'action qu'on vient justement de defaire
    noter_bucket(nom, act["from"], space,
                 ancien_nom=act["name"] if nom != act["name"] else None)
    push_log(f"annule : {nom} → {act['from']}"
             + (f" (export {refait} refait)" if refait else ""))
    return web.json_response({"ok": True, "bucket": act["from"], "name": nom,
                              "export": refait, "undo": len(UNDO)})


async def api_journal(request):
    path = OFM / "PROD" / "journal_batch.csv"
    if not path.exists():
        return web.json_response({"rows": []})
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    return web.json_response({"rows": rows[-300:][::-1]})


async def serve_image(request):
    bucket = request.query.get("bucket", "OK")
    space = request.query.get("space", "lena")
    name = request.query.get("name", "")
    if not SAFE_NAME.match(name):
        bad_request("nom invalide")
    path = bucket_dir(bucket, space) / name
    if not path.exists():
        raise web.HTTPNotFound()
    if request.query.get("thumb"):
        tdir = THUMBS / space / bucket
        tdir.mkdir(parents=True, exist_ok=True)
        thumb = tdir / (path.stem + ".jpg")
        if not thumb.exists() or thumb.stat().st_mtime < path.stat().st_mtime:
            async with VIGNETTES:
                # re-teste sous le verrou : la grille demande 200 vignettes d'un
                # coup, plusieurs requetes visent souvent le meme fichier
                if (not thumb.exists()
                        or thumb.stat().st_mtime < path.stat().st_mtime):
                    await asyncio.get_running_loop().run_in_executor(
                        None, _faire_vignette, path, thumb)
        path = thumb
    return web.FileResponse(path)


async def serve_pose(request):
    """Vignette d'un squelette de INPUTS/POSE/, pour le selecteur de la carte
    de scene. Pas de bucket ici — c'est un dossier plat, pas un tri — donc pas
    le meme chemin que serve_image. Fichiers petits (~50 Ko, fond transparent) :
    aucun besoin de vignette redimensionnee."""
    name = request.query.get("name", "")
    if not SAFE_NAME.match(name):
        bad_request("nom invalide")
    path = pose_tools.POSE_DIR / name
    if not path.exists():
        raise web.HTTPNotFound()
    return web.FileResponse(path)


def nsfw_journal_index():
    path = nsfw_batch.JOURNAL
    if not path.exists():
        return {}
    out = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            if row.get("fichier"):
                out[row["fichier"]] = {"scene": row.get("source", ""),
                                       "score_identite": row.get("score_identite", ""),
                                       "seed": row.get("seed", ""),
                                       "categorie": "nsfw", "format": "",
                                       "prompt": row.get("instruction", "")}
    return out


# ------------------------------------------------------- composeur de scenes
async def api_compose(request):
    """Transforme une intention en francais en scenes pretes a relire."""
    body = await request.json()
    intention = (body.get("intention") or "").strip()
    if not intention:
        return web.json_response({"ok": False, "erreur": "intention vide"}, status=400)
    data = scenes_data()
    creative = lb.load_creative("lena")
    # `intention` est le texte libre en francais decrivant ce qu'on veut ;
    # `intention_cible` est la CLE de taxonomie qu'on impose. Les confondre
    # collait la phrase francaise dans le champ intention des scenes.
    forced = (body.get("intention_cible") or body.get("category") or "").strip()
    try:
        loop = asyncio.get_running_loop()
        scenes, raw = await loop.run_in_executor(
            None, lambda: composer.compose(intention, int(body.get("count") or 3),
                                           creative, cfg()["comfy_url"]))
    except Exception as e:
        push_log(f"composeur : {type(e).__name__} — {e}")
        return web.json_response({"ok": False, "erreur": str(e)}, status=500)
    existing = {s["id"] for s in data["scenes"]}
    for sc in scenes:
        if forced:
            sc["intention"] = forced      # `category` n'existe plus : c'est elle
        base = sc["id"]
        n = 2
        while sc["id"] in existing:              # jamais deux scenes du meme nom
            sc["id"] = f"{base}_{n}"
            n += 1
        existing.add(sc["id"])
    push_log(f"composeur : {len(scenes)} scene(s) proposee(s) pour « {intention[:60]} »")
    return web.json_response({"ok": True, "scenes": scenes, "brut": raw[:2000]})


# --------------------------------------------------------- banque de poses
# JSON + base64, jamais multipart/form-data : multipart est un Content-Type
# "simple" au sens CORS (comme text/plain), donc PAS soumis au preflight que
# garde_origine exploite pour bloquer un site tiers. L'accepter ici rouvrirait
# exactement le trou que ce garde ferme (voir sa docstring). Le cout — un
# encodage +33 % — est negligeable en local.
TAILLE_MAX_PHOTO = 20 * 1024 * 1024


async def api_pose_extract(request):
    """Photo envoyee par l'utilisateur -> squelette OpenPose, vers INPUTS/POSE/.

    Seul point d'entree web ou une photo reelle de tiers peut arriver — voir
    AUTOMATION/pose_tools.py, qui garantit qu'elle ne persiste jamais.
    """
    body = await request.json()
    b64 = body.get("data_base64") or ""
    nom = (body.get("filename") or "photo.png").strip()
    if not b64:
        return web.json_response({"ok": False, "erreur": "aucune image reçue"},
                                 status=400)
    try:
        data = base64.b64decode(b64, validate=True)
    except Exception:
        return web.json_response({"ok": False, "erreur": "image mal encodée"},
                                 status=400)
    if len(data) > TAILLE_MAX_PHOTO:
        return web.json_response(
            {"ok": False, "erreur": "image trop lourde (20 Mo max)"}, status=400)
    if not await comfy_alive():
        return web.json_response({"ok": False, "erreur": "ComfyUI hors ligne"},
                                 status=503)
    try:
        squelette = await asyncio.get_running_loop().run_in_executor(
            None, pose_tools.extraire, data, nom, cfg()["comfy_url"])
    except pose_tools.ExtractionError as e:
        return web.json_response({"ok": False, "erreur": str(e)}, status=400)
    push_log(f"squelette extrait : {squelette}")
    return web.json_response({"ok": True, "name": squelette})


async def api_pose_delete(request):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not SAFE_NAME.match(name):
        bad_request("nom de fichier invalide")
    if not pose_tools.supprimer_pose(name):
        return web.json_response({"ok": False, "erreur": "squelette introuvable"},
                                 status=404)
    push_log(f"squelette retiré : {name}")
    return web.json_response({"ok": True})


# -------------------------------------------------------------- branche NSFW
async def api_nsfw_state(request):
    configuration = cfg()
    armed = nsfw_batch.is_armed(configuration)
    counts = {}
    for b in ("OK", "A_REVOIR", "REJET"):
        d = bucket_dir(b, "nsfw")
        counts[b] = len(list(d.glob("*.png"))) if d.exists() else 0
    # le bucket voyage avec le nom : la grille de sources doit pouvoir dire
    # d'ou vient chaque image, et /img en a besoin pour la retrouver
    sources = [{"name": f.name, "bucket": b}
               for f, b in nsfw_batch.sources_disponibles(configuration)[:120]]
    return web.json_response({"armed": armed, "counts": counts,
                              "sources": sources})


def historique_instructions(limite=20):
    """Instructions deja employees, avec ce qu'elles ont donne.

    Le journal NSFW porte deja `instruction` et `score_identite` : la
    bibliotheque ne demande aucune saisie nouvelle, elle relit ce qui a servi.
    Triee par identite moyenne obtenue — la seule mesure comparable dont on
    dispose sur une instruction.

    Constat du 26/08/2026 qui motive cet ecran : 25 editions pour 15 instructions
    distinctes, la plus frequente retapee 6 fois. Le journal savait deja tout ce
    qu'il fallait pour ne pas la retaper.
    """
    path = nsfw_batch.JOURNAL
    if not path.exists():
        return []
    par_texte = {}
    with open(path, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            txt = " ".join((row.get("instruction") or "").split())
            if not txt:
                continue
            e = par_texte.setdefault(txt, {"n": 0, "scores": []})
            e["n"] += 1
            try:
                e["scores"].append(float(row["score_identite"]))
            except (TypeError, ValueError):
                pass                      # SANS_VISAGE / ERREUR : pas de score
    out = []
    for txt, e in par_texte.items():
        moy = sum(e["scores"]) / len(e["scores"]) if e["scores"] else None
        out.append({"texte": txt, "n": e["n"],
                    "identite": round(moy, 3) if moy is not None else None,
                    "alertes": nsfw_batch.alertes_instruction(txt)})
    # les sans-score en dernier : ils n'ont jamais abouti a une mesure
    out.sort(key=lambda e: (e["identite"] is None, -(e["identite"] or 0), -e["n"]))
    return out[:limite]


async def api_nsfw_instructions(request):
    """Preambule REEL du graphe + instructions deja employees.

    Le preambule etait decrit par une phrase dans l'interface (« la pose et le
    decor sont deja proteges ») sans jamais etre montre. Resultat mesure : 5 des
    16 instructions posterieures a la refonte reecrivaient `same pose`. On montre
    le texte, on arrete de le paraphraser.
    """
    return web.json_response({
        "preambule": nsfw_batch.PREAMBLE.split("Instruction:")[0].strip(),
        "historique": historique_instructions()})


async def api_nsfw_arm(request):
    """Armement explicite : il faut recopier le mot exact, pas un simple clic."""
    body = await request.json()
    target = lb.config_path("lena")
    configuration = cfg()
    if body.get("arm"):
        if (body.get("confirm") or "").strip().upper() != "ARMER":
            return web.json_response(
                {"ok": False, "erreur": "confirmation manquante"}, status=400)
        configuration.setdefault("nsfw", {})["enabled"] = True
        push_log("branche NSFW ARMEE")
    else:
        configuration.setdefault("nsfw", {})["enabled"] = False
        push_log("branche NSFW desarmee")
    shutil.copy(target, target.with_suffix(".json.bak"))
    target.write_text(json.dumps(configuration, ensure_ascii=False, indent=2),
                      encoding="utf-8")
    return web.json_response({"ok": True, "armed": configuration["nsfw"]["enabled"]})


# ------------------------------------------------------- application (26/08/2026)
# Ecran de "parametrage de l'application", distinct du panneau de reglages de
# generation (le ⚙ de l'ecran Creer) : ici on controle les DEUX PROCESSUS, pas
# une production. Actions explicites uniquement, jamais automatiques.
async def api_app_stop(request):
    """Arrete CE serveur web. Repond d'abord, sort ensuite — sinon le
    navigateur ne recoit jamais la confirmation."""
    push_log("arrêt du tableau de bord demandé depuis l'interface")

    async def _sortir():
        await asyncio.sleep(0.3)
        os._exit(0)

    asyncio.create_task(_sortir())
    return web.json_response({"ok": True})


async def api_app_restart(request):
    """Relance CE serveur (os.execv) : meme process ID, meme fenetre, code et
    config relus a froid. C'est un vrai redemarrage, pas un rechargement de
    donnees — la seule facon de faire reprendre en compte un changement de
    code sans repasser par run_web.bat a la main."""
    push_log("redémarrage du tableau de bord demandé depuis l'interface")

    async def _relancer():
        await asyncio.sleep(0.3)
        os.execv(sys.executable, [sys.executable] + sys.argv)

    asyncio.create_task(_relancer())
    return web.json_response({"ok": True})


async def api_app_comfy_stop(request):
    ok = await asyncio.get_running_loop().run_in_executor(None, comfy_server.stop)
    if not ok:
        return web.json_response(
            {"ok": False, "erreur": "ComfyUI n'était pas en cours"}, status=409)
    push_log("ComfyUI arrêté depuis l'interface")
    return web.json_response({"ok": True})


async def api_app_comfy_restart(request):
    """Arrete puis relance ComfyUI. Fire-and-forget : la reprise se voit deja
    sur le point vert du header (il sonde /api/state en boucle), pas besoin
    d'un etat dedie de plus a maintenir."""
    push_log("redémarrage de ComfyUI demandé depuis l'interface")

    async def _cycle():
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, comfy_server.stop)
        await asyncio.sleep(1)
        try:
            await loop.run_in_executor(
                None, lambda: comfy_server.ensure(cfg()["comfy_url"], log=push_log))
        except Exception as e:
            push_log(f"redémarrage de ComfyUI : {type(e).__name__} — {e}")

    asyncio.create_task(_cycle())
    return web.json_response({"ok": True})


async def index(request):
    return web.FileResponse(HERE / "static" / "index.html")


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
            comfy_server.ensure(cfg()["comfy_url"])
        except Exception as e:
            print(f"!! ComfyUI n'a pas pu demarrer : {e}")
            print("   Le tableau de bord s'ouvre quand meme (production indisponible).")
            print("   Relancer ComfyUI a la main, l'ecran se debloque tout seul.")

    retirees = purger_vignettes()
    if retirees:
        print(f"{retirees} vignette(s) orpheline(s) retiree(s)", flush=True)

    # limite par defaut d'aiohttp : 1 Mo, trop court pour une photo encodee en
    # base64 (TAILLE_MAX_PHOTO=20 Mo, +33 % d'encodage). Relevee ici plutot que
    # sur la route : c'est le corps JSON entier qui est concerne, avant meme
    # que le handler puisse lire body["data_base64"].
    app = web.Application(middlewares=[garde_erreurs, garde_origine],
                          client_max_size=28 * 1024 * 1024)
    app.add_routes([
        web.get("/", index),
        web.get("/api/state", api_state),
        web.get("/api/scenes", api_scenes),
        web.post("/api/scenes", api_scenes_save),
        web.get("/api/creative", api_creative),
        web.get("/api/config", api_config),
        web.post("/api/config", api_config_save),
        web.post("/api/plan", api_plan),
        web.post("/api/run", api_run),
        web.post("/api/decline", api_decline),
        web.post("/api/stop", api_stop),
        web.get("/api/gallery", api_gallery),
        web.post("/api/action", api_action),
        web.post("/api/flag", api_flag),
        web.post("/api/mesurer", api_mesurer),
        web.post("/api/undo", api_undo),
        web.post("/api/compose", api_compose),
        web.post("/api/pose/extract", api_pose_extract),
        web.post("/api/pose/delete", api_pose_delete),
        web.post("/api/delete", api_delete),
        web.post("/api/edit/save", api_edit_save),
        web.post("/api/app/stop", api_app_stop),
        web.post("/api/app/restart", api_app_restart),
        web.post("/api/app/comfy/stop", api_app_comfy_stop),
        web.post("/api/app/comfy/restart", api_app_comfy_restart),
        web.get("/api/nsfw/state", api_nsfw_state),
        web.post("/api/nsfw/arm", api_nsfw_arm),
        web.get("/api/nsfw/instructions", api_nsfw_instructions),
        web.get("/api/journal", api_journal),
        web.get("/img", serve_image),
        web.get("/img/pose", serve_pose),
        web.static("/static", HERE / "static"),
    ])
    if args.host != "127.0.0.1":
        global RESEAU_OUVERT
        RESEAU_OUVERT = True     # leve les gardes Host/Origin : choix explicite
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
