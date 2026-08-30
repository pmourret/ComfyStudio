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
import time

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
    # personnage du BATCH en cours, pas celui de l'URL : c'est sa duree reelle
    # qu'on extrapole. Un pack SDXL et un pack Flux ne vont pas a la meme vitesse.
    cid = ss.STATE.get("character") or "lena"
    base = ss.avg_duration(cid)
    palier = lb.by_level(lb.load_creative(cid), ss.STATE.get("intensity") or 0)
    if palier and palier.get("pipeline") == "flux+edit":
        base += ss._moyenne_duree(nsfw_batch.journal_path(cid), 60.0)
    return base


@routes.get("/")
async def index(request):
    return web.FileResponse(ss.HERE / "static" / "index.html")


@routes.get("/api/state")
async def api_state(request):
    """Etat du systeme + compteurs de buckets DU personnage demande.

    Les compteurs sont ceux d'un arbre PROD/<CID>/ precis : sans le personnage,
    le selecteur de bucket de la Revue annoncait les chiffres de Lena au-dessus
    des images d'un autre.
    """
    cid = ss.character(request)
    ok = await ss.comfy_alive()

    def compte(space):
        return {b: len(list(ss.bucket_dir(b, space, cid).glob("*.png")))
                if ss.bucket_dir(b, space, cid).exists() else 0 for b in ss.BUCKETS}

    counts = compte("sfw")
    # memes buckets, espace NSFW : sert a l'ecran Galerie/Revue quand la bascule
    # d'espace y est sur NSFW, pour que les compteurs de bucket affiches
    # correspondent a ce qui est reellement liste (sinon ils restent colles
    # aux chiffres SFW pendant qu'on regarde des images NSFW)
    nsfw_counts = compte("nsfw")
    eta = None
    if ss.STATE["running"] and ss.STATE["total"]:
        eta = round(duree_unitaire() * (ss.STATE["total"] - ss.STATE["index"] + 1))
    return web.json_response({**ss.STATE, "comfy": ok, "counts": counts,
                              "nsfw_counts": nsfw_counts, "eta": eta,
                              "undo": len(ss.undo_disponible(cid))})


@routes.get("/api/config")
async def api_config(request):
    return web.json_response(ss.cfg(ss.character(request)))


def _world_brief(wid):
    """{id, label} d'un monde, ou None. Tolerant : un world absent ou inconnu
    ne casse pas l'en-tete (character(request) l'a deja valide s'il etait la)."""
    if wid and worlds.exists(wid):
        return {"id": wid, "label": worlds.label(wid)}
    return None


def _base_brief(cid):
    """Base gelee du personnage : presente ou non, et sous quel nom.

    Le nom vient de `config.json / base_gelee` ; les octets vivent dans
    `ComfyUI/input/` (un `LoadImage` ne lit que la), donc HORS de PROD/. On dit
    seulement si le fichier est la — aucune route ne sert cette image, et en
    inventer une qui lise ce dossier sans borne character_id rouvrirait la
    fuite fermee le 29/08/2026. La fiche affiche donc l'initiale, comme le
    chrome (F6 : portrait de base, plus tard).
    """
    try:
        name = (ss.cfg(cid) or {}).get("base_gelee") or ""
    except (OSError, ValueError):
        return {"name": None, "present": False}
    if not name:
        return {"name": None, "present": False}
    try:
        present = (base_portrait.COMFY_INPUT / name).exists()
    except OSError:
        present = False
    return {"name": name, "present": present}


@routes.get("/api/character")
async def api_character(request):
    """Personnage courant, pour l'en-tete (registre J4 ; type + monde J7bis)
    et pour sa FICHE (F1.2, 30/08/2026).

    `character(request)` a deja garanti que le personnage a un character.json
    coherent (univers reel, (type, style) qui resout le pack, world compatible)
    — pas de gestion d'erreur en plus ici.

    La fiche lit tout ici, en UN appel deja borne au personnage : ajouter
    `base` et `nsfw_tool` a cette reponse coute deux lectures de registre, la
    ou une seconde route aurait duplique la resolution du pack et l'isolation
    qui va avec. Rien de nouveau n'est calcule — `edit_tool_state` est celui
    que l'ecran Application affiche deja.
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
        # base gelee et outil d'edition : LECTURE seule, pour la fiche (F1.2).
        # L'armement, lui, ne se prend qu'a un seul endroit — la section
        # « Contenu adulte » de l'ecran Application (J7, ADR-0010).
        "base": _base_brief(cid),
        "nsfw_tool": nsfw_batch.edit_tool_state(cid),
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


@routes.get("/api/wizard/options")
async def api_wizard_options(request):
    """Choix offerts par le wizard « nouveau personnage » (J7bis). Un type par
    entree, avec ses styles (du pack resolu) et ses mondes (de la famille du
    pack). Tout vient des registres — jamais un `if` en dur (§8.7)."""
    out = []
    for uid in universe.list_universes():
        u = universe.load_universe(uid)
        family = u.get("model_family")
        for t in universe.types(uid):
            out.append({
                "id": t,
                "label": u.get("label", t),
                "family": family,
                "styles": universe.style_names(uid),
                "worlds": [
                    {"id": w, "label": worlds.label(w), "tone": worlds.tone(w),
                     "suggested_styles": worlds.suggested_styles(w)}
                    for w in worlds.worlds_for_family(family)
                ],
            })
    return web.json_response({"types": out})


@routes.post("/api/characters")
async def api_characters_create(request):
    """Ecrit un nouveau personnage (wizard J7bis). `base_gelee` doit deja avoir
    ete produit (upload ou freeze). Tout choix invalide -> 400, jamais un
    dossier a moitie ecrit (create_character fait le rollback)."""
    body = await request.json()
    try:
        cid = lb.create_character(
            (body.get("cid") or "").strip(), (body.get("name") or "").strip(),
            body.get("type"), body.get("style"), body.get("world"),
            (body.get("base_gelee") or "").strip())
    except (ValueError, FileExistsError) as e:      # inclut Unresolved/World*
        ss.bad_request(str(e))
    ss.push_log(f"personnage cree par le wizard : {cid!r}")
    return web.json_response({"ok": True, "id": cid})


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


@routes.post("/api/characters/base/generate")
async def api_characters_base_generate(request):
    """Wizard (J7bis) — base d'identite GENEREE : met N portraits en file
    (verrou bypasse, aucune reference n'existe encore). Repond tout de suite ;
    le front suit via /api/characters/base/candidates. GPU requis."""
    body = await request.json()
    try:
        out = base_portrait.generate(
            (body.get("cid") or "").strip(), body.get("type"), body.get("style"),
            body.get("world"), n=body.get("n") or 4, seed=body.get("seed"))
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    ss.push_log(f"portraits de base : {len(out['candidates'])} en file "
                f"pour {body.get('cid')!r} ({out['pack']})")
    return web.json_response({"ok": True, **out})


@routes.post("/api/characters/base/candidates")
async def api_characters_base_candidates(request):
    """Etat des portraits de base en cours (pending / ready+file / error)."""
    body = await request.json()
    try:
        res = base_portrait.candidates(body.get("pack"), body.get("items") or [])
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    return web.json_response({"ok": True, "results": res})


@routes.get("/api/characters/base/image")
async def api_characters_base_image(request):
    """Apercu d'un candidat (fichier sous ComfyUI/output/, chemin borne)."""
    try:
        data = base_portrait.candidate_bytes(request.query.get("file", ""))
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    return web.Response(body=data, content_type="image/png")


@routes.post("/api/characters/base/freeze")
async def api_characters_base_freeze(request):
    """Gele le candidat choisi -> ComfyUI/input/<CID>_BASE.<ext>. Rend le nom
    a ecrire dans config.json/base_gelee."""
    body = await request.json()
    cid = (body.get("cid") or "").strip()
    if lb.character_dir(cid).is_dir():
        ss.bad_request(f"le personnage {cid!r} existe deja")
    try:
        name = base_portrait.freeze(cid, body.get("file"))
    except base_portrait.BaseImageError as e:
        ss.bad_request(str(e))
    ss.push_log(f"base d'identite generee gelee pour {cid!r} -> {name}")
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
    """Journal de production, filtre sur le personnage demande."""
    cid = ss.character(request)
    chemin = ss.journal_path()
    if not chemin.exists():
        return web.json_response({"rows": []})
    with open(chemin, encoding="utf-8", newline="") as f:
        rows = [r for r in csv.DictReader(f, delimiter=";")
                if ss.ligne_character(r) == cid]
    return web.json_response({"rows": rows[-300:][::-1]})


@routes.get("/api/nsfw/state")
async def api_nsfw_state(request):
    cid = ss.character(request)
    configuration = ss.cfg(cid)
    # `outil` porte les DEUX conditions et la raison quand l'une manque : c'est
    # ce que la section « Contenu adulte » de l'ecran Application affiche, et
    # ce que le curseur suit pour montrer ou non son cran (J7).
    outil = nsfw_batch.edit_tool_state(cid)
    counts = {}
    for b in ("OK", "A_REVOIR", "REJET"):
        d = ss.bucket_dir(b, "nsfw", cid)
        counts[b] = len(list(d.glob("*.png"))) if d.exists() else 0
    # le bucket voyage avec le nom : la grille de sources doit pouvoir dire
    # d'ou vient chaque image, et /img en a besoin pour la retrouver
    sources = [{"name": f.name, "bucket": b}
               for f, b in nsfw_batch.sources_disponibles(configuration, cid)[:120]]
    return web.json_response({"armed": outil["armed"], "outil": outil,
                              "nom": lb.load_character(cid).get("name") or cid,
                              "sortie": f"PROD/{cid.upper()}/_NSFW/",
                              "counts": counts, "sources": sources})


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


# Cache court, meme motif que `comfy_alive` : deux sondes bloquantes (HTTP vers
# ComfyUI + un sous-processus nvidia-smi) derriere un bandeau present sur tous
# les ecrans. Sans lui, plusieurs onglets ouverts multiplieraient les spawns.
_STATS = {"at": 0.0, "val": None}
_STATS_TTL = 1.5
_STATS_LOCK = None          # cree paresseusement : il faut une boucle en cours


@routes.get("/api/app/comfy/stats")
async def api_app_comfy_stats(request):
    """Memoire et thermique de la machine, pour le bandeau et l'ecran Application.

    Les deux sondes partent dans un THREAD : `comfy_alive` a coute un gel de
    boucle d'evenements a 2005 ms le 24/08 pour avoir sonde en bloquant, et on
    ne rejoue pas ca. Le resultat est garde une seconde et demie.

    DEUX PIEGES, tous deux constates le 30/08 avec ComfyUI arrete — le cas ou
    la sonde est LENTE (urlopen attend sur un port mort, ~2 s) :

      1. L'horodatage se pose APRES le travail, pas avant. Estampille au debut
         de la requete, une sonde plus longue que le TTL rendait le cache
         perime des sa naissance : il ne resservait JAMAIS rien, et chaque
         appel relancait nvidia-smi et l'attente. Mesure : 2087 ms sur un appel
         cense sortir du cache.
      2. Un verrou, sinon deux appels concurrents font tous deux le travail.
         Le second attend le premier et lit son resultat.
    """
    global _STATS_LOCK
    if _STATS_LOCK is None:
        _STATS_LOCK = asyncio.Lock()
    if _STATS["val"] is not None and time.monotonic() - _STATS["at"] < _STATS_TTL:
        return web.json_response(_STATS["val"])
    url = ss.cfg(ss.character(request))["comfy_url"]
    async with _STATS_LOCK:
        # relire sous le verrou : pendant l'attente, un autre appel a pu servir
        if _STATS["val"] is not None and time.monotonic() - _STATS["at"] < _STATS_TTL:
            return web.json_response(_STATS["val"])
        val = await asyncio.get_running_loop().run_in_executor(
            None, comfy_server.stats, url)
        _STATS.update(at=time.monotonic(), val=val)
    return web.json_response(val)


@routes.post("/api/app/comfy/unload")
async def api_app_comfy_unload(request):
    """Decharge modeles et VRAM. Geste explicite, jamais automatique.

    Refuse pendant un batch : decharger sous un job en cours le ferait echouer,
    et l'utilisateur perdrait une production pour gagner de la VRAM.
    """
    if ss.STATE["running"]:
        return web.json_response(
            {"ok": False, "erreur": "une production est en cours — "
                                    "décharger la mémoire la ferait échouer"}, status=409)
    url = ss.cfg(ss.character(request))["comfy_url"]
    ok, err = await asyncio.get_running_loop().run_in_executor(
        None, comfy_server.unload, url)
    if not ok:
        return web.json_response({"ok": False, "erreur": err or "échec"}, status=502)
    _STATS["val"] = None                      # la prochaine sonde doit voir l'effet
    ss.push_log("mémoire ComfyUI déchargée depuis l'interface")
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
