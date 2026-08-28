"""Etat du systeme, health-check, configuration (.claude/rules/backend.md).

/, /api/state, /api/config (GET/POST), /api/journal, /api/nsfw/state,
/api/app/* (cycle de vie du serveur et de ComfyUI).
"""
import asyncio
import csv
import json
import os
import shutil
import sys

from aiohttp import web

import shared_state as ss
import comfy_server
import nsfw_batch
import runner as lb
import universe
import worlds
import base_portrait

routes = web.RouteTableDef()


def duree_unitaire():
    """Secondes par image du batch EN COURS, passe d'edition comprise.

    Au niveau 3 la chaine est en deux temps : generation au niveau de base, puis
    edition NSFW sur sa propre sortie. Ne compter que la generation faisait
    annoncer un reste a faire environ deux fois trop court.
    """
    base = ss.avg_duration()
    palier = lb.by_level(lb.load_creative(ss.STATE.get("character") or "lena"),
                         ss.STATE.get("intensity") or 0)
    if palier and palier.get("pipeline") == "flux+edit":
        base += ss._moyenne_duree(nsfw_batch.JOURNAL, 60.0)
    return base


@routes.get("/")
async def index(request):
    return web.FileResponse(ss.HERE / "static" / "index.html")


@routes.get("/api/state")
async def api_state(request):
    ok = await ss.comfy_alive()
    counts = {b: len(list(ss.bucket_dir(b).glob("*.png"))) if ss.bucket_dir(b).exists() else 0
              for b in ss.BUCKETS}
    # memes buckets, espace NSFW : sert a l'ecran Galerie/Revue quand la bascule
    # d'espace y est sur NSFW, pour que les compteurs de bucket affiches
    # correspondent a ce qui est reellement liste (sinon ils restent colles
    # aux chiffres SFW pendant qu'on regarde des images NSFW)
    nsfw_counts = {b: len(list(ss.bucket_dir(b, "nsfw").glob("*.png")))
                   if ss.bucket_dir(b, "nsfw").exists() else 0 for b in ss.BUCKETS}
    eta = None
    if ss.STATE["running"] and ss.STATE["total"]:
        eta = round(duree_unitaire() * (ss.STATE["total"] - ss.STATE["index"] + 1))
    return web.json_response({**ss.STATE, "comfy": ok, "counts": counts,
                              "nsfw_counts": nsfw_counts, "eta": eta,
                              "undo": len(ss.UNDO)})


@routes.get("/api/config")
async def api_config(request):
    return web.json_response(ss.cfg(ss.character(request)))


def _world_brief(wid):
    """{id, label} d'un monde, ou None. Tolerant : un world absent ou inconnu
    ne casse pas l'en-tete (character(request) l'a deja valide s'il etait la)."""
    if wid and worlds.exists(wid):
        return {"id": wid, "label": worlds.label(wid)}
    return None


@routes.get("/api/character")
async def api_character(request):
    """Personnage courant, pour l'en-tete (registre J4 ; type + monde J7bis).

    `character(request)` a deja garanti que le personnage a un character.json
    coherent (univers reel, (type, style) qui resout le pack, world compatible)
    — pas de gestion d'erreur en plus ici.
    """
    cid = ss.character(request)
    reg = lb.load_character(cid)
    uid = reg.get("universe")
    u = universe.load_universe(uid)
    return web.json_response({
        "id": cid,
        "name": reg.get("name", cid),
        "type": reg.get("type") or uid,
        "world": _world_brief(reg.get("world")),
        "output_style": reg.get("output_style") or "realiste",
        # `universe` = le pack resolu : info machine, secondaire dans le chrome
        # depuis l'ADR-0012 (« machine : Flux · verrou visage »).
        "universe": {"id": uid, "label": u.get("label", uid),
                     "model_family": u.get("model_family"),
                     "output_styles": universe.style_names(uid)},
        "content_types": reg.get("content_types", {}),
        "nsfw": bool(reg.get("nsfw")),
    })


@routes.get("/api/characters")
async def api_characters(request):
    """Registre des personnages, pour le sas d'entree (J7bis).

    Liste seulement : la validation stricte reste dans character(request), au
    moment ou un personnage est reellement selectionne. Une fiche illisible est
    ignoree plutot que de faire echouer toute la liste."""
    out = []
    for cid in lb.list_characters():
        try:
            reg = lb.load_character(cid)
        except (OSError, ValueError):
            continue
        uid = reg.get("universe")
        out.append({
            "id": cid,
            "name": reg.get("name", cid),
            "type": reg.get("type") or uid,
            "world": _world_brief(reg.get("world")),
            "nsfw": bool(reg.get("nsfw")),
            "content_types": [k for k, v in (reg.get("content_types") or {}).items() if v],
            "known_universe": universe.exists(uid),
        })
    return web.json_response({"characters": out})


@routes.post("/api/characters/base/upload")
async def api_characters_base_upload(request):
    """Wizard « nouveau personnage » (J7bis) — base d'identite FOURNIE.

    Depose l'image dans ComfyUI/input/ (seul endroit que `LoadImage` lit) et
    rend le nom de fichier a mettre dans config.json/base_gelee. Le personnage
    n'existe pas encore ; on refuse seulement un cid deja pris, pour ne pas
    ecraser la base d'un personnage existant.
    """
    body = await request.json()
    cid = (body.get("cid") or "").strip()
    if lb.character_dir(cid).is_dir():
        ss.bad_request(f"le personnage {cid!r} existe deja")
    try:
        name = base_portrait.save_uploaded(cid, body.get("image_base64"))
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    ss.push_log(f"base d'identite fournie pour {cid!r} -> {name}")
    return web.json_response({"ok": True, "base_gelee": name})


@routes.get("/api/universe/tools")
async def api_universe_tools(request):
    """Panel d'outils declare pour l'univers du personnage (tools.json, §5).

    Expose des J4 ; l'ecran qui le consomme arrive avec le premier outil dedie
    (J5+). Ici pour que le panel ne soit jamais un `if character == "lena"` en
    dur le jour ou un second personnage existe (§8.7)."""
    uid = lb.character_universe(ss.character(request))
    return web.json_response({"universe": uid, "tools": universe.load_tools(uid)})


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
            ss.bad_request(f"{ou} : réglage inconnu « {cle} »")
        attendue, recue = famille(actuel[cle]), famille(v)
        if attendue != recue:
            ss.bad_request(f"{ou}.{cle} : {attendue} attendu, {recue} reçu")
        garde[cle] = v
    return garde


@routes.post("/api/config")
async def api_config_save(request):
    body = await request.json()
    cid = ss.character(request)
    target = lb.config_path(cid)
    current = ss.cfg(cid)
    current["preset"].update(fusion_validee(current["preset"],
                                            body.get("preset"), "preset"))
    if "qc" in body:
        current["qc"].update(fusion_validee(current["qc"], body["qc"], "qc"))
    shutil.copy(target, target.with_suffix(".json.bak"))
    target.write_text(json.dumps(current, ensure_ascii=False, indent=2),
                      encoding="utf-8")
    ss.push_log("config.json enregistre")
    return web.json_response({"ok": True, "config": current})


@routes.get("/api/journal")
async def api_journal(request):
    path = ss.OFM / "PROD" / "journal_batch.csv"
    if not path.exists():
        return web.json_response({"rows": []})
    with open(path, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    return web.json_response({"rows": rows[-300:][::-1]})


@routes.get("/api/nsfw/state")
async def api_nsfw_state(request):
    cid = ss.character(request)
    configuration = ss.cfg(cid)
    armed = nsfw_batch.is_armed(cid)
    counts = {}
    for b in ("OK", "A_REVOIR", "REJET"):
        d = ss.bucket_dir(b, "nsfw")
        counts[b] = len(list(d.glob("*.png"))) if d.exists() else 0
    # le bucket voyage avec le nom : la grille de sources doit pouvoir dire
    # d'ou vient chaque image, et /img en a besoin pour la retrouver
    sources = [{"name": f.name, "bucket": b}
               for f, b in nsfw_batch.sources_disponibles(configuration)[:120]]
    return web.json_response({"armed": armed, "counts": counts,
                              "sources": sources})


# ------------------------------------------------------- application (26/08/2026)
# Ecran de "parametrage de l'application", distinct du panneau de reglages de
# generation (le ⚙ de l'ecran Creer) : ici on controle les DEUX PROCESSUS, pas
# une production. Actions explicites uniquement, jamais automatiques.
@routes.post("/api/app/stop")
async def api_app_stop(request):
    """Arrete CE serveur web. Repond d'abord, sort ensuite — sinon le
    navigateur ne recoit jamais la confirmation."""
    ss.push_log("arrêt du tableau de bord demandé depuis l'interface")

    async def _sortir():
        await asyncio.sleep(0.3)
        os._exit(0)

    asyncio.create_task(_sortir())
    return web.json_response({"ok": True})


@routes.post("/api/app/restart")
async def api_app_restart(request):
    """Relance CE serveur (os.execv) : meme process ID, meme fenetre, code et
    config relus a froid. C'est un vrai redemarrage, pas un rechargement de
    donnees — la seule facon de faire reprendre en compte un changement de
    code sans repasser par run_web.bat a la main."""
    ss.push_log("redémarrage du tableau de bord demandé depuis l'interface")

    async def _relancer():
        await asyncio.sleep(0.3)
        os.execv(sys.executable, [sys.executable] + sys.argv)

    asyncio.create_task(_relancer())
    return web.json_response({"ok": True})


@routes.post("/api/app/comfy/stop")
async def api_app_comfy_stop(request):
    ok = await asyncio.get_running_loop().run_in_executor(None, comfy_server.stop)
    if not ok:
        return web.json_response(
            {"ok": False, "erreur": "ComfyUI n'était pas en cours"}, status=409)
    ss.push_log("ComfyUI arrêté depuis l'interface")
    return web.json_response({"ok": True})


@routes.post("/api/app/comfy/restart")
async def api_app_comfy_restart(request):
    """Arrete puis relance ComfyUI. Fire-and-forget : la reprise se voit deja
    sur le point vert du header (il sonde /api/state en boucle), pas besoin
    d'un etat dedie de plus a maintenir."""
    ss.push_log("redémarrage de ComfyUI demandé depuis l'interface")

    async def _cycle():
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, comfy_server.stop)
        await asyncio.sleep(1)
        try:
            await loop.run_in_executor(
                None, lambda: comfy_server.ensure(ss.cfg()["comfy_url"], log=ss.push_log))
        except Exception as e:
            ss.push_log(f"redémarrage de ComfyUI : {type(e).__name__} — {e}")

    asyncio.create_task(_cycle())
    return web.json_response({"ok": True})
