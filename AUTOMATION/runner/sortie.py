"""Tri, export, journal, base — et execute_jobs, la colonne vertebrale unique
(CLAUDE.md §8.2) : appelee par la CLI et par la web UI, jamais dupliquee.
"""
import csv
import shutil
from datetime import datetime
from pathlib import Path

from . import OFM, COMFY, COMFY_OUTPUT, load_json, log
from .comfy import WorkflowRunner


# ------------------------------------------------------------------- tri/export
def nom_libre(stem, racine, ext=".png"):
    """Nom libre dans TOUS les dossiers de tri, pas seulement celui d'arrivee.

    Une image change de dossier au tri. Un nom unique par dossier ne suffit donc
    pas : deux homonymes finissent par se croiser au meme endroit et `shutil.move`
    en ecrase un — perte seche. Le journal et PROD/mesures.json sont eux aussi
    indexes par nom, un doublon y melange deux images.
    Constate le 24/08/2026 : selfie_voiture_20260823_01.png existait a la fois
    dans OK et dans REJET, avec deux seeds et deux scores differents.
    """
    dossiers = [d for d in racine.glob("*") if d.is_dir()] or [racine]
    nom, n = f"{stem}{ext}", 1
    while any((d / nom).exists() for d in dossiers):
        n += 1
        nom = f"{stem}_{n}{ext}"
    return nom


def sort_and_export(src, job, verdict, score, cfg, batch_id, character_id="lena"):
    """Range l'image selon le verdict QC et produit l'export publiable.

    Dossier de tri derive de `character_id` (`character_id.upper()`, ex.
    "lena" -> PROD/LENA/) plutot qu'un nom en dur : pour "lena" c'est
    exactement le dossier deja la (aucune donnee deplacee), et un futur
    personnage obtient le sien sans `if character == "lena"` (CLAUDE.md §8.7).
    L'export est namespace par personnage (PROD/EXPORT/<character_id>/<categorie>)
    pour que deux personnages ne melangent jamais leurs publications.
    """
    day = datetime.now().strftime("%Y%m%d")
    suffix = f"_{job['index']:02d}"
    # evite "selfie_miroir_selfie_miroir_entree" quand l'id reprend la categorie
    label = (job["scene"] if job["scene"].startswith(job["category"])
             else f"{job['category']}_{job['scene']}")
    stem = f"{label}_{day}{suffix}"
    racine_tri = OFM / "PROD" / character_id.upper()
    dest_dir = racine_tri / verdict
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / nom_libre(stem, racine_tri)
    shutil.move(str(src), str(dest))

    export_path = ""
    if cfg["export"]["enabled"] and verdict == "OK":
        try:
            from PIL import Image
            exp_dir = OFM / "PROD" / "EXPORT" / character_id / job["category"]
            exp_dir.mkdir(parents=True, exist_ok=True)
            export_path = exp_dir / f"{dest.stem}.{cfg['export']['format']}"
            im = Image.open(dest).convert("RGB")
            ew, eh = cfg["export_sizes"][job["format"]]
            if im.size != (ew, eh):
                im = im.resize((ew, eh), Image.LANCZOS)
            im.save(export_path, quality=cfg["export"]["quality"], subsampling=0)
        except Exception as e:                       # export non bloquant
            log(f"   export impossible : {e}")
            export_path = ""
    return dest, export_path


# `character` : le journal est un CSV UNIQUE pour toute la plateforme (il se lit
# hors outil, et la base porte deja la meme information par personnage). Sans
# cette colonne, rien n'y distingue la ligne d'un personnage de celle d'un
# autre — la galerie d'Abyssiaelle pouvait donc s'illustrer d'une ligne de Lena
# des que deux noms de fichier se croisaient. Ajoutee le 29/08/2026 ; migration
# des lignes existantes : AUTOMATION/tests/migrer_prod_par_personnage.py.
JOURNAL_COLS = ["date", "batch", "character", "scene", "categorie", "intensite",
                "ton", "variante", "format", "seed", "score_identite", "verdict",
                "fichier", "export", "duree_s", "prompt"]


def ecrire_en_base(rows, character_id="lena"):
    """Double ecriture : le CSV reste lisible hors outil, la base devient la
    source de verite en lecture. Ne doit jamais faire echouer un batch."""
    try:
        import base
        with base.ouvrir() as cx:
            for r in rows:
                d = dict(zip(JOURNAL_COLS, r))
                cx.execute("INSERT INTO batch (id, character_id, debut) VALUES (?,?,?) "
                           "ON CONFLICT(id) DO NOTHING",
                           (d["batch"], character_id, d["date"]))
                iid = base.enregistrer_image(
                    cx, d["fichier"], character_id=character_id, batch_id=d["batch"],
                    espace="lena", bucket=d["verdict"], scene=d["scene"],
                    intention=d["categorie"], ton=d["ton"] or None,
                    intensite=int(d["intensite"]) if str(d["intensite"]).isdigit() else None,
                    format=d["format"], variante=d["variante"] or None,
                    seed=int(d["seed"]) if str(d["seed"]).isdigit() else None,
                    prompt=d["prompt"], cree_le=d["date"],
                    duree_s=float(d["duree_s"]) if d["duree_s"] else None,
                    export=d["export"] or None)
                if d["score_identite"]:
                    base.enregistrer_score(cx, iid, "identite",
                                           float(d["score_identite"]), d["date"])
            cx.commit()
    except Exception as e:
        log(f"   base : ecriture impossible — {type(e).__name__} : {e}")


def append_log(rows, character_id="lena"):
    path = OFM / "PROD" / "journal_batch.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists()
    with open(path, "a", newline="", encoding="utf-8") as f:
        wr = csv.writer(f, delimiter=";")
        if new:
            wr.writerow(JOURNAL_COLS)
        wr.writerows(rows)
    ecrire_en_base(rows, character_id=character_id)
    return path


# --------------------------------------------------------------- coeur partage
def appliquer_grain(path, cfg, seed=None):
    """Grain de capteur telephone, avant toute mesure.

    Applique AVANT le QC pour que ce qu'on mesure et ce qu'on trie soit ce qui
    sera publie. Ne doit jamais faire echouer un batch : l'image est deja produite.
    """
    p = cfg.get("preset", {})
    if not p.get("grain_telephone"):
        return None
    try:
        import grain
        return grain.appliquer(path, seed=seed)
    except Exception as e:
        log(f"   grain impossible : {type(e).__name__} — {e}")
        return None


def reglage(cfg, cle, defaut=None):
    """Reglage d'etage, avec heritage NSFW -> SFW.

    Regle posee le 24/08/2026 : tout ce qui s'applique a la branche SFW s'applique
    a la branche NSFW. Les deux branches partagent donc `preset`, et `nsfw` ne
    porte qu'une SURCHARGE explicite — pas une valeur dupliquee qui derive en
    silence. Trois reglages restent legitimement propres au NSFW parce qu'ils ne
    designent pas la meme chose : `steps` et `cfg` (Qwen-Rapid distille, pas Flux)
    et `face_denoise` (re-rendre un visage apres edition, pas le retoucher).
    """
    n = cfg.get("nsfw", {})
    if cle in n and n[cle] is not None:
        return n[cle]
    return cfg.get("preset", {}).get(cle, defaut)


def mesurer_realisme(path, bbox):
    """Mesures de realisme (~32 ms). Ne doit JAMAIS faire echouer un batch.

    Elles sont informatives : elles ne deplacent aucun fichier et n'entrent pas
    dans le verdict tant qu'elles ne sont pas calibrees (voir 5.4 de la spec).
    Une image qui se genere bien mais se mesure mal reste une image produite.
    """
    try:
        import qc_realisme
        return qc_realisme.mesure(path, bbox)
    except Exception as e:
        log(f"   mesure de realisme impossible : {type(e).__name__} — {e}")
        return None


def appliquer_expression(path, job, cfg, checker=None, avant=None, character_id="lena"):
    """Pose l'expression du ton, sous budget d'identite. Rend (params, apres).

    APRES le controle d'identite, jamais avant : la mesure d'identite n'est pas
    neutre vis-a-vis de l'expression (voir AUTOMATION/expression.py). Poser
    l'expression avant le QC rendrait la bande 0.72-0.78 incomparable.

    Le budget est necessaire parce que le cout du warp varie fortement selon
    l'image — mesure entre -0.007 et -0.105 pour des reglages comparables. On
    essaie plein, puis moitie, puis on renonce et l'image reste telle quelle.
    """
    if not cfg.get("preset", {}).get("expression"):
        return {}, avant
    try:
        from .prompt import load_creative
        import expression as ex
        params = ex.tirage(load_creative(character_id), job.get("tone"), job["seed"])
        if not params:
            return {}, avant
        if checker is None or avant is None:
            return (params, None) if ex.appliquer(path, params,
                                                  cfg["comfy_url"]) else ({}, avant)
        budget = float(cfg.get("preset", {}).get("expression_budget", 0.05))
        return ex.poser_sous_budget(
            path, params, cfg["comfy_url"],
            mesurer=lambda p: checker.mesure(p)["score"],
            avant=avant, budget=budget, journal=lambda m: log("   " + m))
    except Exception as e:
        log(f"   expression impossible : {type(e).__name__} — {e}")
    return {}, avant


def ranger_mesures(nom, identite, reel, embedding=None, apres_expression=None,
                   expression=None, character_id="lena"):
    quand = datetime.now().isoformat(timespec="seconds")
    try:
        import mesures
        mesures.maj(nom, identite=identite, mesure_le=quand,
                    identite_apres_expression=apres_expression,
                    expression=expression or None, **(reel or {}))
    except Exception as e:
        log(f"   enregistrement des mesures impossible : {type(e).__name__} — {e}")
    try:
        import base
        with base.ouvrir() as cx:
            iid = base.enregistrer_image(cx, nom, character_id=character_id)
            base.enregistrer_score(cx, iid, "identite", identite, quand)
            # score d'apres expression : ENREGISTRE, jamais utilise pour trier.
            # Meme regle que identite_centroide — le verdict reste celui du
            # visage neutre, seul comparable a la bande.
            base.enregistrer_score(cx, iid, "identite_apres_expression",
                                   apres_expression, quand)
            for genre, v in (reel or {}).items():
                base.enregistrer_score(cx, iid, genre, v, quand)
            base.enregistrer_embedding(cx, iid, embedding)
            cx.commit()
    except Exception as e:
        log(f"   base : mesures non enregistrees — {type(e).__name__} : {e}")


def make_checker(cfg):
    """Charge le QC d'identite (InsightFace). Import tardif : ~5 s au 1er appel."""
    import qc_identity
    return qc_identity.IdentityChecker(
        COMFY / "input" / cfg["base_gelee"],
        str(COMFY / "models" / "insightface"),
        cfg["qc"]["threshold_ok"], cfg["qc"]["threshold_watch"])


def execute_jobs(jobs, cfg, checker, batch_id, character_id="lena", runner=None,
                 on_event=None, should_stop=None, after=None):
    """Execute la liste de jobs. Utilise par la CLI et par la web UI.

    Seule fonction d'execution du projet (CLAUDE.md §8.2) : jamais dupliquee
    par personnage ou par univers. `character_id` est enfile jusqu'au
    rangement et a la base — le choix du personnage se fait AVANT cet appel,
    pas a l'interieur.

    on_event(kind, **kw) est appele avec kind="start" puis kind="done".
    should_stop() -> True interrompt proprement entre deux jobs.

    after(job, verdict, dest) est appele apres le rangement de chaque image. C'est
    le point d'accroche du niveau d'intensite 3 : l'appelant y enchaine l'edition
    NSFW sur la sortie SFW. Ce module n'a pas a connaitre cette branche — il offre
    un crochet, rien de plus. Une exception dans le crochet ne fait jamais echouer
    le batch : l'image SFW est deja produite et rangee.
    """
    runner = runner or WorkflowRunner(cfg, character_id)
    on_event = on_event or (lambda kind, **kw: None)
    rows, stats = [], {"OK": 0, "A_REVOIR": 0, "REJET": 0,
                       "SANS_VISAGE": 0, "ERREUR": 0}

    for i, job in enumerate(jobs, 1):
        if should_stop and should_stop():
            break
        on_event("start", index=i, total=len(jobs), job=job)
        result = {"verdict": "ERREUR", "score": None, "fichier": "", "export": "",
                  "duree": 0.0, "error": None}

        pid, err = runner.queue(runner.api_for(job, batch_id))
        if err:
            result["error"] = f"refuse par ComfyUI : {err}"
        else:
            images, err, secs = runner.wait(pid)
            result["duree"] = secs
            if err or not images:
                result["error"] = err or "aucune image produite"
            else:
                for im in images:
                    src = COMFY_OUTPUT / im.get("subfolder", "") / im["filename"]
                    # 1. le QC juge le visage NEUTRE : c'est lui qui decide du
                    #    verdict, et c'est le seul score comparable a la bande
                    if checker:
                        m = checker.mesure(src)     # score ET cadre du visage
                        score, bbox = m["score"], m["bbox"]
                        verdict = checker.verdict(score)
                    else:
                        m = None
                        score, bbox, verdict = None, None, "OK"
                    # 2. expression puis grain : cosmetiques, apres le verdict.
                    #    L'expression d'abord : le noeud recompose une zone de
                    #    visage et effacerait le grain qu'on y aurait mis.
                    params_expr, apres = appliquer_expression(
                        src, job, cfg, checker=checker, avant=score,
                        character_id=character_id)
                    appliquer_grain(src, cfg, seed=job["seed"])
                    # 3. le cadre du visage a pu bouger : on le reprend
                    if checker and params_expr:
                        m2 = checker.mesure(src)
                        if m2["bbox"] is not None:
                            bbox = m2["bbox"]
                    reel = mesurer_realisme(src, bbox)
                    dest, export = sort_and_export(src, job, verdict, score, cfg,
                                                   batch_id, character_id=character_id)
                    if reel or score is not None:
                        ranger_mesures(dest.name, score, reel,
                                       embedding=(m or {}).get("embedding"),
                                       apres_expression=apres,
                                       expression=params_expr,
                                       character_id=character_id)
                    if params_expr:
                        import expression as _ex
                        log(f"   expression ({job.get('tone') or '—'}) : "
                            f"{_ex.resume(params_expr)}"
                            + (f" · identite {score:.3f} -> {apres:.3f}"
                               if apres is not None and score is not None else ""))
                    if after:
                        try:
                            after(job, verdict, dest)
                        except Exception as e:
                            log(f"   enchainement impossible : {type(e).__name__} — {e}")
                    result.update(verdict=verdict, score=score, fichier=dest.name,
                                  export=Path(export).name if export else "")
                    stats[verdict] = stats.get(verdict, 0) + 1
                    rows.append([datetime.now().isoformat(timespec="seconds"),
                                 batch_id, character_id,
                                 job["scene"], job["category"],
                                 job.get("intensity", 0), job.get("tone", ""),
                                 job["variant"], job["format"], job["seed"],
                                 f"{score:.3f}" if score else "", verdict,
                                 dest.name, result["export"], f"{secs:.0f}",
                                 job["prompt"]])
        if result["verdict"] == "ERREUR":
            stats["ERREUR"] += 1
        on_event("done", index=i, total=len(jobs), job=job, result=result)

    # Balaye TOUS les dossiers de transit vides, pas seulement celui du batch qui
    # vient de finir : un batch interrompu (ComfyUI absent, arret manuel) laissait
    # le sien derriere lui et ils s'accumulaient.
    racine = OFM / "PROD" / "_BATCH"
    if racine.exists():
        for d in racine.iterdir():
            if d.is_dir() and not any(d.iterdir()):
                d.rmdir()
        if not any(racine.iterdir()):
            racine.rmdir()
    if rows:
        append_log(rows, character_id=character_id)
    return rows, stats
