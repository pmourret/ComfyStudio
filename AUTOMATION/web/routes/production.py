"""Lancement de generation, file de jobs (.claude/rules/backend.md).

/api/plan, /api/run, /api/decline, /api/stop, /api/nsfw/arm,
/api/nsfw/instructions.
"""
import asyncio
import csv
import json
import re
import shutil
from datetime import datetime
from types import SimpleNamespace

from aiohttp import web

import shared_state as ss
import nsfw_batch
import runner as lb

routes = web.RouteTableDef()


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
        ss.bad_request(f"« {cle} » doit être un nombre entier")
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


def guard_intensity(body, character):
    """Verrous du curseur. Retourne un message d'erreur, ou None si c'est bon."""
    try:
        level = int(body.get("intensity") or 0)
    except (TypeError, ValueError):
        return "niveau d'intensite invalide"
    palier = lb.by_level(lb.load_creative(character), level)
    if palier is None:
        return f"niveau d'intensite inconnu : {level}"
    exige = palier.get("requires")
    if exige == "confirm" and not body.get("confirm_intensity"):
        return f"le niveau « {palier['label']} » demande une confirmation"
    if exige == "armed" and not nsfw_batch.is_armed(character):
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


# Reglages d'edition NSFW que le panneau a le droit de surcharger. Liste BLANCHE :
# l'armement de la branche n'y figure pas (il vit dans character.json depuis J4,
# et reste un rituel d'interface qui ne doit pas pouvoir arriver par un corps de
# requete de reglages).
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
            ss.bad_request(f"nsfw.{cle} : valeur numérique attendue")
        if cle in ("steps", "max_pixels"):
            retenu[cle] = int(retenu[cle])
    if retenu:
        configuration.setdefault("nsfw", {}).update(retenu)
    return retenu


def appliquer_export(configuration, niveau_demande, character="lena"):
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
    palier = lb.by_level(lb.load_creative(character), niveau_demande)
    if palier and not palier.get("export", True):
        configuration["export"] = dict(configuration["export"], enabled=False)
    return configuration


def niveau_generation(body, character="lena"):
    """Niveau auquel la PASSE DE GENERATION tourne.

    Au niveau 3 la chaine est en deux temps : on genere au `base_level` (Soft par
    defaut) puis on edite. Le curseur affiche 3, la generation tourne a 1.
    Ne concerne QUE le mode `generer_avant` — par defaut le cran NSFW n'engendre
    rien du tout (voir mode_edition).
    """
    corps = dict(body)
    palier = lb.by_level(lb.load_creative(character), int(body.get("intensity") or 0))
    if palier and palier.get("pipeline") == "flux+edit":
        corps["intensity"] = palier.get("base_level", 1)
    return corps


def mode_edition(body, character):
    """Vrai quand le cran demande EDITE une image existante au lieu d'engendrer.

    C'est le comportement par defaut du cran NSFW, et c'est la regle du projet :
    la branche edite une image deja validee, elle ne genere jamais de zero.
    `generer_avant` retablit l'enchainement generation -> edition pour le seul cas
    ou il sert : aucune image validee n'existe encore pour la scene voulue.

    Mesure du 26/08/2026 : sur 21 batches NSFW, 12 sont partis de l'edition d'une
    image existante. Le chemin qui regenerait avant d'editer coutait une passe
    Flux complete (~55 s) pour reproduire une image deja sur le disque.
    """
    palier = lb.by_level(lb.load_creative(character), int(body.get("intensity") or 0))
    return bool(palier and palier.get("pipeline") == "flux+edit"
                and not body.get("generer_avant"))


def sources_valides(body, character):
    """Sources cochees qui existent reellement dans l'arbre de CE personnage.

    Filtre sur le disque et pas seulement sur la forme du nom : une image triee
    ailleurs entre la selection et le lancement ne doit pas partir en edition.
    Le disque consulte est PROD/<CID>/ : un nom coche ne peut pas designer
    l'image d'un autre personnage.
    """
    dispo = {f.name
             for f, _ in nsfw_batch.sources_disponibles(ss.cfg(character), character)}
    return [n for n in (body.get("sources") or [])
            if ss.SAFE_NAME.match(n) and n in dispo]


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


@routes.post("/api/plan")
async def api_plan(request):
    body = await request.json()
    cid = ss.character(request)
    # les alertes ne dependent pas de la validite du plan : on les rend meme
    # quand le garde refuse, sinon l'ecran d'edition n'affiche rien tant que
    # l'instruction est vide — or c'est justement la qu'on la redige
    alertes = nsfw_batch.alertes_instruction(body.get("edit_instruction") or "")
    if err := guard_intensity(body, cid):
        return web.json_response({"total": 0, "jobs": [], "erreur": err,
                                  "alertes": alertes})
    if mode_edition(body, cid):
        # rien a batir : le « plan » est la liste des images cochees
        return web.json_response({"total": len(sources_valides(body, cid)), "jobs": [],
                                  "edition": True, "alertes": alertes})
    jobs = lb.build_jobs(lb.scenes_path(cid),
                         filters_from(niveau_generation(body, cid)))
    return web.json_response({"total": len(jobs), "alertes": alertes,
                              "apercu": apercu_prompt(jobs), "jobs": [
        {"scene": j["scene"], "category": j["category"], "format": j["format"],
         "variant": j["variant"], "seed": j["seed"], "prompt": j["prompt"],
         "intensity": j["intensity"], "outfit": j["outfit"]}
        for j in jobs]})


def chainage_nsfw(configuration, use_qc, batch_id, character):
    """Crochet du niveau 3 : editer la sortie SFW, sans tri intermediaire.

    Rend None quand le batch n'est pas de niveau 3. Les garde-fous ne bougent pas :
    la sortie va dans PROD/<CID>/_NSFW, elle n'est jamais exportee, et `editer` verifie
    l'armement une seconde fois.
    """
    niveau = configuration.get("_intensity", 0)
    palier = lb.by_level(lb.load_creative(character), niveau)
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
            ss.push_log(f"{dest.name} : passe SFW {verdict}, édition non enchaînée")
            return
        if etat["runner"] is None:               # construit une seule fois
            etat["runner"] = nsfw_batch.NsfwRunner(configuration, character)
        result, ligne = nsfw_batch.editer(
            dest, instruction, configuration, ss.CHECKER if use_qc else None,
            runner=etat["runner"], batch_id=batch_id, character_id=character)
        if ligne:
            etat["rows"].append(ligne)
            nsfw_batch.journal([ligne], character)
            sc = f" ({result['score']:.3f})" if result.get("score") else ""
            ss.push_log(f"→ NSFW {result['fichier']} : {result['verdict']}{sc} "
                       f"— {result['duree']:.0f}s")
            # la bande en direct ne montrait que la passe SFW : au niveau 3 on
            # regardait donc l'image intermediaire, jamais celle qui est produite
            ss.STATE["recent"].append({"bucket": result["verdict"],
                                      "name": result["fichier"],
                                      "scene": f"{job['scene']} · édité",
                                      "space": "nsfw", "score": result.get("score")})
            del ss.STATE["recent"][:-24]
        else:
            ss.push_log(f"→ NSFW échec sur {dest.name} : {result.get('error')}")

    return crochet


def run_batch_blocking(jobs, configuration, batch_id, use_qc, character="lena"):
    if use_qc:
        ss.checker_partage(configuration)

    def on_event(kind, **kw):
        if kind == "start":
            ss.STATE.update(index=kw["index"], total=kw["total"],
                           current=f"{kw['job']['scene']} ({kw['job']['format']})")
        else:
            job, r = kw["job"], kw["result"]
            if r["verdict"] == "ERREUR":
                ss.push_log(f"{kw['index']}/{kw['total']} {job['scene']} : ECHEC — "
                          f"{r.get('error')}")
            else:
                sc = f" ({r['score']:.3f})" if r.get("score") else ""
                ss.push_log(f"{kw['index']}/{kw['total']} {job['scene']} : "
                          f"{r['verdict']}{sc} — {r['duree']:.0f}s")
                ss.STATE["recent"].append({"bucket": r["verdict"], "name": r["fichier"],
                                          "scene": job["scene"], "space": "sfw",
                                          "score": r.get("score")})
                del ss.STATE["recent"][:-24]

    rows, stats = lb.execute_jobs(jobs, configuration,
                                 ss.CHECKER if use_qc else None, batch_id,
                                 character_id=character, on_event=on_event,
                                 should_stop=lambda: ss.STATE["stop"],
                                 after=chainage_nsfw(configuration, use_qc, batch_id,
                                                     character))
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
            ss.STATE["stats"] = stats
            ss.push_log("termine — " + " | ".join(f"{k} {v}" for k, v in stats.items() if v))
        except Exception as e:                       # remonte l'erreur a l'ecran
            ss.push_log(f"ERREUR : {type(e).__name__} — {e}")
            ss.STATE["last_error"] = {
                "at": datetime.now().strftime("%H:%M:%S"),
                "msg": f"{type(e).__name__} — {e}"}
        finally:
            ss.STATE.update(running=False, current=None)

    asyncio.create_task(runner())


def edition_blocking(sources, instruction, configuration, use_qc, character):
    """Edition d'images deja validees, sur le meme STATE que la production."""
    if use_qc:
        ss.checker_partage(configuration)

    def on_event(kind, **kw):
        if kind == "start":
            ss.STATE.update(index=kw["index"], total=kw["total"], current=kw["source"])
        else:
            r = kw["result"]
            if r["verdict"] == "ERREUR":
                ss.push_log(f"{kw['index']}/{kw['total']} {kw['source']} : ECHEC — "
                          f"{r.get('error')}")
            else:
                sc = f" ({r['score']:.3f})" if r.get("score") else ""
                ss.push_log(f"{kw['index']}/{kw['total']} {kw['source']} : "
                          f"{r['verdict']}{sc} — {r['duree']:.0f}s")
                # space nsfw : la sortie vit dans PROD/<CID>/_NSFW, /img la cherche la
                ss.STATE["recent"].append({"bucket": r["verdict"], "name": r["fichier"],
                                          "scene": kw["source"], "space": "nsfw",
                                          "score": r.get("score")})
                del ss.STATE["recent"][:-24]

    return nsfw_batch.run(sources, instruction, configuration,
                          ss.CHECKER if use_qc else None, on_event,
                          should_stop=lambda: ss.STATE["stop"],
                          character_id=character)[1]


def demarrer_edition(sources, instruction, configuration, use_qc, niveau,
                     character):
    """Lance une edition. Pendant de `demarrer`, meme etat, meme panneau."""
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    ss.STATE.update(running=True, stop=False, batch_id=batch_id, index=0,
                   total=len(sources), current=None, stats={}, recent=[],
                   intensity=niveau, character=character, last_error=None,
                   edition=True,
                   started_at=datetime.now().isoformat(timespec="seconds"))
    ss.push_log(f"édition {batch_id} — {len(sources)} image(s) déjà validée(s) "
              f"· sortie dans PROD/{character.upper()}/_NSFW · hors export")
    ss.push_log(f"instruction : {instruction[:100]}")
    for a in nsfw_batch.alertes_instruction(instruction):
        ss.push_log(f"  ! {a}")
    _lancer(lambda: edition_blocking(sources, instruction, configuration, use_qc,
                                     character))
    return batch_id


def demarrer(jobs, configuration, use_qc, entete=None, character="lena"):
    """Demarre un batch et rend son identifiant. Un seul chemin de lancement.

    Utilise par /api/run (production) et /api/decline (boucle de raffinement).
    Dupliquer ce bloc, c'est se garantir deux comportements qui divergent.
    """
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    ss.STATE.update(running=True, stop=False, batch_id=batch_id, index=0,
                   total=len(jobs), current=None, stats={}, recent=[],
                   character=character, last_error=None, edition=False,
                   started_at=datetime.now().isoformat(timespec="seconds"))
    p = configuration["preset"]
    # le niveau DEMANDE, pas celui de la passe de generation : au niveau 3 les
    # jobs sont batis en Soft, annoncer « Soft » induirait en erreur
    demande = configuration.get("_intensity", jobs[0]["intensity"])
    palier = lb.by_level(lb.load_creative(character), demande)
    ss.STATE["intensity"] = demande
    exporte = "" if not palier or palier.get("export", True) else " · hors export"
    ss.push_log(entete or (f"batch {batch_id} — intensite "
                        f"« {palier['label'] if palier else '?'} »"
                        + (f" · ton {jobs[0]['tone']}" if jobs[0]["tone"] else "")
                        + exporte))
    ss.push_log(f"batch {batch_id} — {len(jobs)} image(s) · guidance {p['guidance']} · "
              f"refiner {'ON' if p['refiner'] else 'OFF'} · "
              f"detail {'ON' if p['facedetailer'] else 'OFF'} · "
              f"grain {'ON' if p['grain_export'] else 'OFF'}")

    _lancer(lambda: run_batch_blocking(jobs, configuration, batch_id, use_qc,
                                      character))
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


def lancer_edition_depuis(name, body, niveau, character):
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
                           "no_qc": body.get("no_qc")}, character)
    if err:
        return web.json_response({"ok": False, "erreur": err}, status=403)
    if nsfw_batch.resoudre_source(name, ss.cfg(character), character) is None:
        return web.json_response(
            {"ok": False, "erreur": "cette image n'est pas éditable — seules les "
                                    "images validées ou à revoir le sont"}, status=400)
    configuration = ss.cfg(character)
    configuration["_intensity"] = niveau
    appliquer_export(configuration, niveau, character)
    batch_id = demarrer_edition([name], (body.get("edit_instruction") or "").strip(),
                                configuration, not body.get("no_qc"), niveau,
                                character)
    return web.json_response({"ok": True, "batch_id": batch_id, "total": 1,
                              "mode": "editer", "edition": True,
                              "libelle": DECLINAISONS["editer"]})


@routes.post("/api/decline")
async def api_decline(request):
    """Boucle courte : repartir d'une image deja produite.

    `dry` rend seulement ce que chaque mode produirait, pour que l'interface
    n'affiche que les declinaisons qui ont un sens sur cette image.
    """
    body = await request.json()
    cid = ss.character(request)
    name = body.get("name", "")
    if not ss.SAFE_NAME.match(name):
        ss.bad_request("nom de fichier invalide")
    row = ss.journal_index(cid).get(name)
    if not row:
        return web.json_response(
            {"ok": False, "erreur": "image absente du journal — impossible de la "
                                    "rejouer (scène et seed inconnus)"}, status=404)
    creative = lb.load_creative(cid)
    scenes = lb.scenes_path(cid)
    niveau = int(row.get("intensite") or 0)

    if body.get("dry"):
        dispo = {}
        for mode in lb.MODES_DECLINAISON:
            if mode == "ton":
                dispo[mode] = [t for t in creative.get("tones", [])
                               if t["key"] != (row.get("ton") or None)]
            else:
                dispo[mode] = len(lb.jobs_declinaison(
                    scenes, row, mode, creative=creative, n=int(body.get("n") or 3)))
        suivant = lb.by_level(creative, niveau + 1)
        # le bouton "monter d'un cran" doit refleter les MEMES verrous que le
        # curseur principal : confirmation a montrer, armement a proposer
        # plutot que de laisser cliquer puis echouer sur un toast generique
        configuration = ss.cfg(cid)
        # Meme verite que le curseur : l'outil d'edition demande l'armement ET
        # un graphe declare par le pack. Le geste d'armement, lui, ne vit plus
        # ici — il a un seul endroit, l'ecran Application (J7).
        outil = nsfw_batch.edit_tool_state(cid)
        verrouille = (suivant is not None and suivant.get("requires") == "armed"
                      and not outil["available"])
        # L'edition ne monte pas d'un cran : elle part de l'image affichee, quel
        # que soit son niveau. C'est le geste « j'aime celle-ci, edite-la », qui
        # n'existait jusqu'ici que dans un onglet a part.
        edit = palier_edition(creative)
        dispo["editer"] = bool(
            edit and nsfw_batch.resoudre_source(name, configuration, cid))
        return web.json_response({
            "ok": True, "modes": dispo, "scene": row.get("scene"),
            "intensite": niveau, "ton": row.get("ton") or "",
            "niveau_suivant": suivant["label"] if suivant else None,
            "suivant_requires": suivant.get("requires") if suivant else None,
            "suivant_verrouille": verrouille,
            "edition_label": edit["label"] if edit else None,
            "edition_verrouillee": bool(edit and edit.get("requires") == "armed"
                                        and not outil["available"]),
            "edition_raison": outil["reason"],
            "suivant_instruction": bool(suivant and
                                        suivant.get("pipeline") == "flux+edit")})

    if ss.STATE["running"]:
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
        return lancer_edition_depuis(name, body, edit["level"], cid)
    if mode not in lb.MODES_DECLINAISON:
        return web.json_response({"ok": False, "erreur": "mode inconnu"}, status=400)
    if mode == "intensite":
        # le curseur a des verrous : une declinaison ne doit pas les contourner
        err = guard_intensity({"intensity": niveau + 1,
                               "confirm_intensity": body.get("confirm_intensity"),
                               "edit_instruction": body.get("edit_instruction"),
                               "no_qc": body.get("no_qc")}, cid)
        if err:
            return web.json_response({"ok": False, "erreur": err}, status=403)

    jobs = lb.jobs_declinaison(scenes, row, mode, creative=creative,
                               n=int(body.get("n") or 3), tone=body.get("tone"))
    if not jobs:
        raison = {"lumiere": "cette scène n'a pas d'autre variante de lumière",
                  "ton": "choisis un ton différent de celui de l'image",
                  "intensite": "cette image est déjà au niveau le plus haut",
                  "seeds": "aucune scène correspondante"}[mode]
        return web.json_response({"ok": False, "erreur": raison}, status=400)

    configuration = ss.cfg(cid)
    if mode == "intensite":
        # meme cablage que /api/run : c'est ce qui declenche l'enchainement
        configuration["_intensity"] = niveau + 1
        configuration["_edit_instruction"] = (body.get("edit_instruction") or "").strip()
        appliquer_export(configuration, niveau + 1, cid)
    batch_id = demarrer(jobs, configuration, not body.get("no_qc"),
                        entete=f"déclinaison « {DECLINAISONS[mode]} » depuis {name}",
                        character=cid)
    return web.json_response({"ok": True, "batch_id": batch_id, "total": len(jobs),
                              "mode": mode, "libelle": DECLINAISONS[mode]})


@routes.post("/api/run")
async def api_run(request):
    # Le corps se lit AVANT le garde : `await` rend la main a la boucle, donc
    # tester STATE avant la lecture laissait deux requetes concurrentes franchir
    # le test toutes les deux et lancer deux batches sur le meme GPU.
    body = await request.json()
    cid = ss.character(request)
    if ss.STATE["running"]:
        return web.json_response({"ok": False, "erreur": "un batch tourne deja"},
                                 status=409)
    if err := guard_intensity(body, cid):
        return web.json_response({"ok": False, "erreur": err}, status=403)

    # Cran NSFW : on edite des images deja validees, on n'engendre rien. Un seul
    # point d'entree pour les deux modes — c'est ce qui a permis de retirer
    # l'onglet NSFW parallele et ses trois champs d'instruction concurrents.
    if mode_edition(body, cid):
        sources = sources_valides(body, cid)
        if not sources:
            return web.json_response(
                {"ok": False, "erreur": "aucune image source valide — coche au "
                                        "moins une image déjà validée"}, status=400)
        configuration = ss.cfg(cid)
        configuration["preset"].update(body.get("preset", {}))
        appliquer_nsfw(configuration, body)
        niveau = int(body.get("intensity") or 0)
        configuration["_intensity"] = niveau
        appliquer_export(configuration, niveau, cid)
        batch_id = demarrer_edition(
            sources, (body.get("edit_instruction") or "").strip(),
            configuration, not body.get("no_qc"), niveau, cid)
        return web.json_response({"ok": True, "batch_id": batch_id,
                                  "total": len(sources), "edition": True})

    jobs = lb.build_jobs(lb.scenes_path(cid),
                         filters_from(niveau_generation(body, cid)))
    if not jobs:
        return web.json_response({"ok": False, "erreur": "aucune scene ne correspond"},
                                 status=400)

    configuration = ss.cfg(cid)
    configuration["preset"].update(body.get("preset", {}))
    appliquer_nsfw(configuration, body)
    # l'instruction voyage avec la configuration du batch : run_batch_blocking la
    # relit pour cabler l'enchainement
    configuration["_intensity"] = int(body.get("intensity") or 0)
    configuration["_edit_instruction"] = (body.get("edit_instruction") or "").strip()
    appliquer_export(configuration, configuration["_intensity"], cid)
    batch_id = demarrer(jobs, configuration, not body.get("no_qc"), character=cid)
    return web.json_response({"ok": True, "batch_id": batch_id, "total": len(jobs)})


@routes.post("/api/stop")
async def api_stop(request):
    if not ss.STATE["running"]:
        # repondre « ok » sans rien arreter laissait STATE["stop"] arme, et le
        # batch suivant s'arretait tout seul apres sa premiere image
        return web.json_response({"ok": False, "erreur": "aucun batch en cours"},
                                 status=409)
    ss.STATE["stop"] = True
    ss.push_log("arret demande — le batch s'arrete apres l'image en cours")
    return web.json_response({"ok": True})


def historique_instructions(character_id, limite=20):
    """Instructions deja employees, avec ce qu'elles ont donne.

    Le journal NSFW porte deja `instruction` et `score_identite` : la
    bibliotheque ne demande aucune saisie nouvelle, elle relit ce qui a servi.
    Triee par identite moyenne obtenue — la seule mesure comparable dont on
    dispose sur une instruction.

    Constat du 26/08/2026 qui motive cet ecran : 25 editions pour 15 instructions
    distinctes, la plus frequente retapee 6 fois. Le journal savait deja tout ce
    qu'il fallait pour ne pas la retaper.
    """
    path = nsfw_batch.journal_path(character_id)
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


@routes.get("/api/nsfw/instructions")
async def api_nsfw_instructions(request):
    """Preambule REEL du graphe + instructions deja employees.

    Le preambule etait decrit par une phrase dans l'interface (« la pose et le
    decor sont deja proteges ») sans jamais etre montre. Resultat mesure : 5 des
    16 instructions posterieures a la refonte reecrivaient `same pose`. On montre
    le texte, on arrete de le paraphraser.
    """
    cid = ss.character(request)
    return web.json_response({
        "preambule": nsfw_batch.PREAMBLE.split("Instruction:")[0].strip(),
        "historique": historique_instructions(cid)})


@routes.post("/api/nsfw/arm")
async def api_nsfw_arm(request):
    """Armement explicite : il faut recopier le mot exact, pas un simple clic.

    Ecrit l'interrupteur dans le registre personnage (character.json, cle
    `nsfw`) depuis J4 (ADR-0010) — plus dans config.json, qui ne garde que les
    reglages de workflow NSFW.
    """
    body = await request.json()
    cid = ss.character(request)
    target = lb.character_json_path(cid)
    registre = lb.load_character(cid)
    if body.get("arm"):
        if (body.get("confirm") or "").strip().upper() != "ARMER":
            return web.json_response(
                {"ok": False, "erreur": "confirmation manquante"}, status=400)
        registre["nsfw"] = True
        ss.push_log("branche NSFW ARMEE")
    else:
        registre["nsfw"] = False
        ss.push_log("branche NSFW desarmee")
    shutil.copy(target, target.with_suffix(".json.bak"))
    target.write_text(json.dumps(registre, ensure_ascii=False, indent=2),
                      encoding="utf-8")
    return web.json_response({"ok": True, "armed": registre["nsfw"]})
