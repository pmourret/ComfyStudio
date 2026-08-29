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
import universe  # noqa: E402
import worlds  # noqa: E402

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
    "character": "lena",   # personnage du batch en cours (pose par demarrer*)
    # derniere erreur de batch, {at, msg} ou None. Pose au niveau du batch (pas
    # par job) et efface au demarrage du suivant : le chrome la montre meme
    # quand on a quitte l'ecran Creer (J7bis, chrome honnete).
    "last_error": None,
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
# Selecteur de personnage (J3 etape 4). Le front passe ?character=<id> a chaque
# requete /api/* (api.js) ; les handlers resolvent l'id par `character(request)`
# et le passent explicitement (regle backend : jamais un contextvar cache). Le
# defaut "lena" reste la seule valeur en dur, aux frontieres — pas un
# `if character == "lena"` (CLAUDE.md §8.7).
#
# J4 : `character(request)` valide aussi que le personnage a un character.json
# (registre) pointant vers un univers existant. J7bis (ADR-0012) : il valide en
# plus que (type, style) resolvent bien le pack ecrit dans `universe`, et que le
# monde, s'il est declare, existe et est compatible avec la famille du pack.
#
# Isolation disque (29/08/2026) : la disposition par personnage n'est plus hors
# perimetre. `bucket_dir` exige desormais un character_id, le journal porte une
# colonne `character`, les vignettes vivent sous .thumbs/<cid>/, et UNDO est
# scope a la lecture. Ce qui reste global et assume : `PROD/mesures.json`
# (indexe par nom de fichier nu — la base porte deja les memes scores par
# personnage) et le corpus de reference INPUTS/REALISME/.
_CHARACTER_RE = re.compile(r"^[a-z][a-z0-9_-]*$")


def character(request, requis=False):
    """character_id de la requete, valide AVANT de toucher au disque.

    `requis=True` : l'absence du parametre est elle-meme une erreur, au lieu de
    retomber sur le defaut. Reserve aux routes qui servent des OCTETS d'un arbre
    de personnage (/img) : y laisser un defaut, c'est rendre les images de Lena
    a qui ne les a pas demandees — le bug d'isolation du 29/08/2026.

    Rejette en 400 JSON (jamais un 500, jamais un chemin) :
      - un parametre absent quand `requis` ;
      - un id qui n'est pas un slug simple (`?character=../x`) ;
      - un dossier CHARACTERS/<id>/ absent ;
      - un dossier sans character.json (registre personnage manquant, J4) ;
      - un character.json dont l'univers declare n'existe pas dans UNIVERS/ ;
      - un output_style hors des styles declares par l'univers (J5) ;
      - un couple (type, style) qui ne resout pas le pack ecrit dans `universe`
        (ADR-0012 : le pack est deduit, pas choisi — s'il diverge, le registre
        est casse) ;
      - un `world` inconnu, ou incompatible avec la famille du pack (J7bis).
    """
    cid = request.query.get("character")
    if cid is None:
        if requis:
            bad_request("parametre character= obligatoire sur cette route")
        cid = "lena"
    if not _CHARACTER_RE.match(cid):
        bad_request(f"character_id invalide : {cid!r}")
    if not lb.character_dir(cid).is_dir():
        bad_request(f"personnage inconnu : {cid!r}")
    if not lb.character_json_path(cid).is_file():
        bad_request(f"personnage {cid!r} sans character.json (registre J4)")
    reg = lb.load_character(cid)
    uid = reg.get("universe")
    if not universe.exists(uid):
        bad_request(f"personnage {cid!r} : univers inconnu {uid!r}")
    style = reg.get("output_style") or "realiste"
    if style not in universe.style_names(uid):
        bad_request(f"personnage {cid!r} : style {style!r} absent de l'univers "
                    f"{uid!r} ({', '.join(universe.style_names(uid))})")

    # Le pack se deduit de (type, style) ; il doit retomber sur `universe`.
    ctype = reg.get("type") or uid          # repli V1 : id du type == id du pack
    try:
        pack = universe.resolve(ctype, style)
    except universe.UnresolvedPackError as e:
        bad_request(f"personnage {cid!r} : {e}")
    if pack != uid:
        bad_request(f"personnage {cid!r} : type {ctype!r} + style {style!r} "
                    f"resolvent le pack {pack!r}, mais character.json declare "
                    f"l'univers {uid!r}")

    # Le monde n'est pas encore obligatoire (un registre d'avant J7bis n'en a
    # pas) — mais s'il est la, il doit etre reel et compatible avec la famille.
    world = reg.get("world")
    if world is not None:
        if not worlds.exists(world):
            bad_request(f"personnage {cid!r} : monde inconnu {world!r}")
        family = universe.model_family(pack)
        if not worlds.is_compatible(world, family):
            bad_request(f"personnage {cid!r} : monde {world!r} incompatible avec "
                        f"la famille {family!r} du pack {pack!r}")
    return cid


def cfg(character="lena"):
    return lb.load_config(character)


def scenes_data(character="lena"):
    return lb.load_scenes(character)


def journal_path():
    """Journal de production, unique pour toute la plateforme.

    Une FONCTION et pas une constante : les tests montent un faux PROD/ en
    reassignant `ss.OFM`, et une constante calculee a l'import pointerait
    encore sur le disque reel.
    """
    return OFM / "PROD" / "journal_batch.csv"


def ligne_character(row):
    """Personnage d'une ligne de journal. Repli "lena" pour une ligne d'avant la
    colonne `character` (journal non migre : voir
    AUTOMATION/tests/migrer_prod_par_personnage.py)."""
    return row.get("character") or "lena"


def journal_index(character_id):
    """filename -> ligne du journal, pour CE personnage.

    Le journal est un CSV unique (il le reste : il se lit hors outil, et la
    base porte deja la meme information par personnage). Le filtre est donc
    ici : sans lui, une ligne de Lena illustre l'image d'un autre personnage
    des que deux noms de fichier se croisent — `nom_libre` ne garantit
    l'unicite qu'a l'interieur d'un seul arbre PROD/<CID>/.
    """
    import csv
    chemin = journal_path()
    if not chemin.exists():
        return {}
    out = {}
    with open(chemin, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            if row.get("fichier") and ligne_character(row) == character_id:
                out[row["fichier"]] = row
    return out


def _moyenne_duree(path, default, character_id=None):
    """Duree moyenne des dernieres lignes d'un journal.

    `character_id` ne s'applique qu'au journal SFW, seul a porter la colonne :
    celui de la branche NSFW est deja propre a un personnage par son chemin
    (PROD/<CID>/_NSFW/journal_nsfw.csv).
    """
    import csv
    if not path.exists():
        return default
    try:
        with open(path, encoding="utf-8", newline="") as f:
            vals = [float(r["duree_s"]) for r in csv.DictReader(f, delimiter=";")
                    if r.get("duree_s")
                    and (character_id is None or ligne_character(r) == character_id)]
        return sum(vals[-40:]) / len(vals[-40:]) if vals else default
    except Exception:
        return default


def avg_duration(character_id, default=55.0):
    """Duree moyenne par image de CE personnage, lue dans le journal (donnee
    reelle, pas estimee). Un pack SDXL et un pack Flux n'ont pas la meme duree
    par image : moyenner les deux donnait une ETA fausse pour les deux.

    Partagee entre etat.py (duree_unitaire, pour l'ETA) et banque.py (badge de
    l'ecran Creer)."""
    return _moyenne_duree(journal_path(), default, character_id)


# ---------------------------------------------------------------- deux axes
# `character_id` et `space` sont deux axes distincts, jamais derives l'un de
# l'autre (CLAUDE.md §8.7) :
#   - character_id : QUI. Choisit l'arbre disque, PROD/<CID>/.
#   - space        : SFW ou NSFW. Choisit le sous-arbre a l'interieur.
# La valeur SFW s'est longtemps appelee "lena" — un nom de personnage pour un
# axe qui n'en est pas un. Confondre les deux est exactement ce qui faisait
# servir les images de Lena a tout autre personnage (29/08/2026). La valeur
# canonique est "sfw" ; "lena" reste ACCEPTEE en entree (marque-page, corps
# JSON d'un client pas encore a jour) et n'est plus jamais rendue ni ecrite.
SPACES = ("sfw", "nsfw")
_ALIAS_ESPACE = {"lena": "sfw", "sfw": "sfw", "nsfw": "nsfw"}


def space_id(valeur):
    """Valeur canonique de l'axe SFW/NSFW. 400 sur une valeur inconnue."""
    canon = _ALIAS_ESPACE.get((valeur or "sfw").strip().lower())
    if canon is None:
        bad_request(f"espace inconnu : {valeur!r}")
    return canon


def espace_db(space):
    """Valeur ecrite dans la colonne `image.espace` (base.py).

    La base garde son vocabulaire historique — 'lena' y designe le SFW, et
    trois requetes de base.py filtrent dessus. Migrer la valeur serait un
    chantier a part, sans effet visible ; la conversion vit donc ICI, au seul
    point de contact entre le vocabulaire des routes et celui de la base.
    """
    return "nsfw" if space_id(space) == "nsfw" else "lena"


def bucket_dir(bucket, space, character_id):
    """Dossier de tri d'UN personnage.

        PROD/<CID>/<bucket>/            SFW
        PROD/<CID>/_NSFW/<bucket>/      NSFW

    Les trois arguments sont obligatoires, sans aucun defaut : c'est le point
    de la fonction. Un appelant qui oublie le personnage doit lever bruyamment
    plutot que retomber en silence sur l'arbre de Lena — cette retombee etait
    le bug d'isolation (la Revue d'Abyssiaelle montrait les images de Lena).
    Pour character_id="lena", les chemins SFW sont a l'octet pres ceux d'avant
    (PROD/LENA/<bucket>) : aucune donnee SFW deplacee.
    """
    if bucket not in BUCKETS:
        bad_request("bucket inconnu")
    if not _CHARACTER_RE.match(character_id or ""):
        bad_request(f"character_id invalide : {character_id!r}")
    racine = OFM / "PROD" / character_id.upper()
    if space_id(space) == "nsfw":
        return racine / "_NSFW" / bucket
    return racine / bucket


def export_dir(character_id):
    """Dossier de publication d'un personnage : PROD/EXPORT/<cid>/<categorie>/.

    Meme disposition que celle que le runner ecrit deja (runner/sortie.py,
    sort_and_export) : la route de tri ecrivait PROD/EXPORT/<categorie>/ sans
    personnage, ce qui melangeait deux dispositions dans le meme arbre.
    """
    if not _CHARACTER_RE.match(character_id or ""):
        bad_request(f"character_id invalide : {character_id!r}")
    return OFM / "PROD" / "EXPORT" / character_id


def undo_disponible(character_id):
    """Actions de tri annulables pour CE personnage.

    UNDO reste UNE pile (un seul etat partage, comme STATE) : c'est la lecture
    qui est scopee. Annuler ne doit jamais deplacer le fichier d'un autre
    personnage que celui qu'on regarde.
    """
    return [a for a in UNDO if a.get("character") == character_id]


def oublier_vignette(nom, bucket, space, character_id):
    """Retire la vignette d'une image qui quitte son dossier.

    Les vignettes sont rangees par personnage/espace/bucket : une image qui
    change de dossier laissait la sienne derriere elle. Constate le 25/08/2026 :
    96 fichiers dans PROD/.thumbs pour 46 PNG sur le disque.
    """
    (THUMBS / character_id / space_id(space) / bucket
     / (Path(nom).stem + ".jpg")).unlink(missing_ok=True)


def purger_vignettes():
    """Balaye les vignettes qui ne correspondent plus a rien. Rend le compte.

    Deux cas, et le second n'etait pas prevu :

      - la vignette est bien rangee en personnage/espace/bucket mais son PNG a
        disparu ;
      - la vignette date d'une DISPOSITION PRECEDENTE du cache. Il y en a eu
        trois : .thumbs/<bucket>/ (avant l'axe SFW/NSFW), puis
        .thumbs/<space>/<bucket>/ (avant l'isolation par personnage), et
        aujourd'hui .thumbs/<cid>/<space>/<bucket>/. Un balayage qui descend a
        la profondeur du jour ne voit meme pas les precedentes — constate le
        25/08/2026 sur le disque reel : 9 fichiers oublies dans .thumbs/OK/,
        invisibles a la premiere version de cette fonction.

    Tout ce qui n'est pas a la profondeur attendue est donc perime par
    construction : la vignette se regenere a la demande, la jeter ne coute rien.
    C'est aussi ce qui dispense la bascule par personnage de migrer ce cache —
    le premier demarrage le refait tout seul.

    Appelee au demarrage : c'est le seul moment ou le balayage complet ne coute
    rien a personne, et il rattrape ce qu'un arret brutal aurait laisse.
    """
    if not THUMBS.exists():
        return 0
    connus = set(lb.list_characters())
    retirees = 0
    for v in THUMBS.rglob("*.jpg"):
        parts = v.relative_to(THUMBS).parts
        garder = False
        if len(parts) == 4:
            cid, space, bucket, _ = parts
            if cid in connus and space in SPACES and bucket in BUCKETS:
                garder = (bucket_dir(bucket, space, cid)
                          / (v.stem + ".png")).exists()
        if not garder:
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
