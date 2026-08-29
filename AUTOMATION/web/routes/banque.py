"""Banque de scenes, taxonomie creative, composeur (.claude/rules/backend.md).

/api/scenes (GET/POST), /api/creative, /api/compose.
"""
import asyncio
import json
import shutil

from aiohttp import web

import shared_state as ss
import compose as composer
import nsfw_batch
import pose_tools
import runner as lb

routes = web.RouteTableDef()

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


def scene_stats(character):
    """Par scene : nombre d'images produites et score d'identite moyen.

    Depuis la base quand elle a des donnees — une requete au lieu d'un parcours
    de CSV, et l'historique complet plutot que les fichiers encore sur le disque.
    Repli sur le journal tant que la migration n'a pas ete lancee.
    """
    try:
        import base as db
        with db.ouvrir() as cx:
            s = db.stats_par_scene(cx, character)
        if s:
            return s
    except Exception as e:
        ss.push_log(f"base illisible, repli sur le journal : {e}")

    import csv
    chemin = ss.journal_path()
    if not chemin.exists():
        return {}
    acc = {}
    with open(chemin, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter=";"):
            sid = row.get("scene")
            if not sid or ss.ligne_character(row) != character:
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


def scene_previews(character):
    """scene -> derniere image produite PAR CE PERSONNAGE, pour illustrer le
    selecteur de scenes. Sans le personnage, les cartes de scene de l'ecran
    Creer s'illustraient avec les images de Lena, quel que soit le personnage
    ouvert."""
    index = ss.journal_index(character)
    best = {}
    for bucket in ("OK", "A_REVOIR", "REJET"):
        d = ss.bucket_dir(bucket, "sfw", character)
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


@routes.get("/api/scenes")
async def api_scenes(request):
    cid = ss.character(request)
    data = ss.scenes_data(cid)
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
                              "previews": scene_previews(cid),
                              "meta": meta,
                              "stats": scene_stats(cid),
                              "avg_duration": round(ss.avg_duration(cid)),
                              "poses": pose_tools.poses_disponibles()})


@routes.post("/api/scenes")
async def api_scenes_save(request):
    body = await request.json()
    cid = ss.character(request)
    try:
        data = json.loads(body["text"]) if "text" in body else body["data"]
    except Exception as e:
        return web.json_response({"ok": False, "erreur": f"JSON invalide : {e}"},
                                 status=400)
    # Le serveur ne fait plus confiance au front sur la forme de la banque :
    # c'est ce controle qui manquait le 25/08/2026 quand une reconstruction cote
    # interface a efface le parcours creatif des 16 scenes sans que rien ne
    # l'arrete. Il ecrit un fichier que build_jobs saura lire, ou il refuse.
    pbs = valider_banque(data, ancienne=ss.scenes_data(cid),
                         autoriser_pertes=bool(body.get("autoriser_pertes")))
    if pbs:
        ss.push_log(f"scenes.json REFUSE — {pbs[0]}")
        return web.json_response({"ok": False, "erreur": pbs[0],
                                  "problemes": pbs}, status=400)
    target = lb.scenes_path(cid)
    sauvegarder_rotation(target)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    ss.push_log(f"scenes.json enregistre ({len(data['scenes'])} scenes, .bak tourne)")
    return web.json_response({"ok": True})


@routes.get("/api/creative")
async def api_creative(request):
    """Taxonomie du parcours : intentions, tons, echelle d'intensite."""
    cid = ss.character(request)
    creative = lb.load_creative(cid)
    data = ss.scenes_data(cid)
    configuration = ss.cfg(cid)
    # L'outil d'edition existe pour CE personnage a deux conditions, jamais une
    # seule (J7) : son registre est arme, ET son pack declare un graphe
    # d'edition. Un pack sans graphe n'a pas l'outil, quel que soit l'armement.
    outil = nsfw_batch.edit_tool_state(cid)
    # compte une seule fois : la sonde disque est la meme pour tous les paliers
    n_sources = (len(nsfw_batch.sources_disponibles(configuration, cid))
                 if outil["available"] else 0)
    paliers = []
    for p in creative.get("intensity", []):
        exige = p.get("requires")
        edite = p.get("pipeline") == "flux+edit"
        # Un palier qui demande l'armement et ne l'a pas n'est PAS EMIS : le
        # cran est absent de l'interface, pas grise (ADR-0003 : le NSFW est off
        # par defaut, et un cran grise reste une invitation). Le curseur est
        # reconstruit depuis cette liste, il n'a donc rien a filtrer — et rien
        # a filtrer par nom de personnage (CLAUDE.md §8.7). guard_intensity
        # reste le verrou serveur : le masquage ne remplace pas la garde.
        if exige == "armed" and not outil["available"]:
            continue
        # Le cran qui edite ne choisit pas de scene : annoncer un nombre de
        # scenes y etait trompeur (il affichait « 16 », le compte du niveau de
        # base, alors qu'aucune scene n'y est utilisee). Il compte des images.
        # En mode `generer_avant`, c'est bien le niveau de base qui fait foi —
        # mais ce mode est un repli, pas ce que le cran annonce.
        niveau_scenes = p.get("base_level", p["level"])
        paliers.append({**p,
                        # La destination est MONTREE a l'utilisateur (confirmation
                        # de palier) : elle se calcule, elle ne se croit pas.
                        # Stockee dans creative.json, elle derive des que le
                        # fichier est repris d'un autre personnage — on a vu un
                        # palier annoncer PROD/LENA/_NSFW en ecrivant ailleurs.
                        # La verite disque est nsfw_batch.out_root / l'arbre du
                        # personnage ; c'est elle qu'on affiche.
                        "destination": (f"PROD/{cid.upper()}/_NSFW" if edite
                                        else f"PROD/{cid.upper()}"),
                        "besoin_instruction": edite,
                        "unite": "image" if edite else "scène",
                        "scenes": n_sources if edite else
                                  sum(1 for s in data["scenes"]
                                      if lb.scene_visible(s, niveau_scenes))})
    return web.json_response({"intentions": creative.get("intentions", []),
                              "tones": creative.get("tones", []),
                              "intensity": paliers})


# ------------------------------------------------------- composeur de scenes
@routes.post("/api/compose")
async def api_compose(request):
    """Transforme une intention en francais en scenes pretes a relire."""
    body = await request.json()
    cid = ss.character(request)
    intention = (body.get("intention") or "").strip()
    if not intention:
        return web.json_response({"ok": False, "erreur": "intention vide"}, status=400)
    data = ss.scenes_data(cid)
    creative = lb.load_creative(cid)
    # `intention` est le texte libre en francais decrivant ce qu'on veut ;
    # `intention_cible` est la CLE de taxonomie qu'on impose. Les confondre
    # collait la phrase francaise dans le champ intention des scenes.
    forced = (body.get("intention_cible") or body.get("category") or "").strip()
    try:
        loop = asyncio.get_running_loop()
        scenes, raw = await loop.run_in_executor(
            None, lambda: composer.compose(intention, int(body.get("count") or 3),
                                           creative, ss.cfg(cid)["comfy_url"]))
    except Exception as e:
        ss.push_log(f"composeur : {type(e).__name__} — {e}")
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
    ss.push_log(f"composeur : {len(scenes)} scene(s) proposee(s) pour « {intention[:60]} »")
    return web.json_response({"ok": True, "scenes": scenes, "brut": raw[:2000]})
