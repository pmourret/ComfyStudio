"""Banc de comparaison de variantes : DEUXIEME capacite de plateforme
(ADR-0017, ADR-0018, ADR-0021, J8.5) — agnostique de la famille de modele,
disponible pour tout personnage sans condition de pack.

CE QUE CE MODULE N'EST PAS. Il ne porte aucun graphe a lui (invariant 10) :
il fait varier UN champ de la config du personnage (ou du job) a la fois,
puis relance le graphe de PRODUCTION du pack tel quel via `execute_jobs`
(invariant 2) — la meme `WorkflowRunner`, deja pack-aware, inchangee. Ce
module lui-meme ne consulte JAMAIS le pack ni le personnage pour savoir
s'il a le droit de s'executer (invariant 7) : la liste blanche d'axes
ci-dessous est la meme pour tout le monde, Lena (flux) comme Abyssiaelle
(sdxl).

RESULTATS ISOLES DE LA PRODUCTION. `run_bench()` passe un `Sink`
(`AUTOMATION/runner/sortie.py`) a `execute_jobs` : les images rangent sous
`PROD/<CID>/_BENCH/<bench_id>/<variante>/<verdict>/` (invisible pour la
Revue/Galerie, qui ne construisent jamais un chemin en dehors des buckets
connus — voir `shared_state.bucket_dir`), et les scores vont dans
`bench_score` (AUTOMATION/base.py), jamais `image`/`score`/`batch`.

AUCUN SEUIL EN DUR (invariant 4). `min_seeds` et `margin` viennent de
`cfg["bench"]` — absents, `verdict_bench()` refuse explicitement plutot que
deviner une constante.
"""
import copy
import random
from datetime import datetime
from pathlib import Path

import base
import runner as lb
from runner.sortie import Sink

OFM = Path(__file__).resolve().parent.parent


# --------------------------------------------------- liste blanche des axes
# Jamais une surcharge cfg libre (pourrait toucher base_gelee/export/tout
# champ hors banc). CFG_AXES vit dans cfg ; JOB_AXES vit dans
# job["overrides"] (sampler_name/scheduler, poses par WorkflowRunner.api_for
# depuis J8.5 — voir AUTOMATION/runner/comfy.py).
CFG_AXES = {
    "identity_weight": ("identity", "weight"),
    "steps": ("preset", "steps"),
    "guidance": ("preset", "guidance"),
    "refiner": ("preset", "refiner"),
    "facedetailer": ("preset", "facedetailer"),
    "upscale_2k": ("preset", "upscale_2k"),
    "grain_export": ("preset", "grain_export"),
}
JOB_AXES = {
    "sampler": "sampler_name",
    "scheduler": "scheduler",
}
ALLOWED_AXES = sorted(set(CFG_AXES) | set(JOB_AXES))


class UnknownAxisError(ValueError):
    """Un axe demande n'est pas dans la liste blanche du banc."""


class MultiAxisError(ValueError):
    """Une variante touche plus d'un axe — la garantie du banc (un seul axe
    change entre deux variantes, y compris la reference) est rompue."""


class BenchConfigMissingError(ValueError):
    """cfg["bench"] (min_seeds/margin) absente — jamais une constante Python
    de repli (invariant 4)."""


def _check_axis(axis):
    if axis not in CFG_AXES and axis not in JOB_AXES:
        raise UnknownAxisError(
            f"axe inconnu : {axis!r} — axes declares : {', '.join(ALLOWED_AXES)}")


def build_variant_cfg(reference_cfg, axis, value):
    """Clone `reference_cfg` (deepcopy) et applique la surcharge de `axis`
    si c'est un axe de config (CFG_AXES) ; copie identique, inchangee, pour
    un axe de job (JOB_AXES) — voir `build_variant_job_overrides`."""
    _check_axis(axis)
    cfg = copy.deepcopy(reference_cfg)
    if axis in CFG_AXES:
        section, cle = CFG_AXES[axis]
        cfg.setdefault(section, {})[cle] = value
    return cfg


def build_variant_job_overrides(axis, value):
    """Surcharge de job["overrides"] pour un axe JOB_AXES ; {} pour un axe
    CFG_AXES (rien a passer au job, c'est cfg qui porte le changement)."""
    _check_axis(axis)
    return {JOB_AXES[axis]: value} if axis in JOB_AXES else {}


def _diff_paths(a, b, prefix=()):
    """Chemins (tuples de cles) dont la valeur differe entre deux dicts
    imbriques — compare les cles presentes dans l'un OU l'autre."""
    paths = []
    for k in set(a) | set(b):
        va, vb = a.get(k), b.get(k)
        if isinstance(va, dict) and isinstance(vb, dict):
            paths += _diff_paths(va, vb, prefix + (k,))
        elif va != vb:
            paths.append(prefix + (k,))
    return paths


def validate_variant_cfg(reference_cfg, variant_cfg, axis, is_reference=False):
    """Leve MultiAxisError si `variant_cfg` differe de `reference_cfg`
    ailleurs que sur le chemin declare par `axis` (ou differe DU TOUT si
    `is_reference` — la reference n'a droit a aucun ecart). Verifie par le
    code, jamais laisse a la discipline de l'appelant (§2 du chantier)."""
    diffs = sorted(_diff_paths(reference_cfg, variant_cfg))
    attendu = [] if is_reference or axis not in CFG_AXES else [CFG_AXES[axis]]
    if diffs != attendu:
        raise MultiAxisError(
            f"variante sur l'axe {axis!r} : attendu un ecart sur {attendu}, "
            f"obtenu {diffs} — un seul axe doit changer entre deux variantes")


# ---------------------------------------------------------- orchestration
def _bench_config(cfg):
    """cfg["bench"] : min_seeds, margin (par genre). Jamais un repli — un
    personnage sans cette section ne peut pas encore lancer de banc
    (invariant 4 : migrer d'abord, voir migrate_bench_config.py)."""
    section = cfg.get("bench")
    if not section or "min_seeds" not in section or "margin" not in section:
        raise BenchConfigMissingError(
            "cfg['bench'] (min_seeds/margin) absente ou incomplete — aucun "
            "repli en dur (invariant 4). Lancer "
            "AUTOMATION/tests/migrate_bench_config.py pour ce personnage.")
    return section


def run_bench(character_id, scene, seeds, axis, values, checker=None,
              on_event=None, should_stop=None):
    """Lance un banc : compare `values` (candidats pour `axis`) a la valeur
    ACTUELLE du personnage sur cet axe (la reference, ajoutee automatiquement
    — jamais declaree par l'appelant). `seeds` : liste explicite, rejouee a
    L'IDENTIQUE pour chaque variante (§3 du chantier) — jamais generee ici.

    Rend bench_id : cle a passer a `verdict_bench()`.
    """
    _check_axis(axis)
    if not seeds:
        raise ValueError("seeds ne peut pas etre vide — un banc sans seed ne mesure rien")
    reference_cfg = lb.load_config(character_id)
    checker = checker or lb.make_checker(reference_cfg)
    creative = lb.load_creative(character_id)
    scenes_path = lb.scenes_path(character_id)

    bench_id = f"{character_id}-{axis}-{datetime.now():%Y%m%d_%H%M%S}"
    with base.ouvrir() as cx:
        base.bench_creer_run(cx, bench_id, character_id, axis, scene, seeds)
        cx.commit()

    reference_value = None
    if axis in CFG_AXES:
        section, cle = CFG_AXES[axis]
        reference_value = reference_cfg.get(section, {}).get(cle)

    plan = [{"label": "reference", "value": reference_value, "is_reference": True}]
    plan += [{"label": f"{axis}={v}", "value": v, "is_reference": False} for v in values]

    for variante in plan:
        variant_cfg = build_variant_cfg(reference_cfg, axis, variante["value"])
        validate_variant_cfg(reference_cfg, variant_cfg, axis,
                             is_reference=variante["is_reference"])
        overrides = build_variant_job_overrides(axis, variante["value"])

        batch_id = f"{bench_id}-{variante['label']}"
        with base.ouvrir() as cx:
            variant_id = base.bench_enregistrer_variante(
                cx, bench_id, variante["label"], batch_id,
                {"axis": axis, "value": variante["value"]}, variante["is_reference"])
            cx.commit()

        args_template = lb.build_jobs(
            scenes_path,
            __import__("types").SimpleNamespace(
                scene=[scene], category=None, format=None, count=1, limit=1,
                seed=seeds[0], no_variants=True),
            character_id, creative=creative)
        if not args_template:
            raise ValueError(f"scene {scene!r} introuvable ou invisible au niveau 0")
        modele = args_template[0]

        jobs = []
        for seed in seeds:
            job = dict(modele)
            job["seed"] = seed
            job["overrides"] = {**job.get("overrides", {}), **overrides}
            jobs.append(job)

        dest_root = (OFM / "PROD" / character_id.upper() / "_BENCH"
                    / bench_id / variante["label"])

        def _record(job, verdict, score, reel, dest, _variant_id=variant_id):
            with base.ouvrir() as cx:
                if score is not None:
                    base.bench_enregistrer_score(cx, _variant_id, job["seed"],
                                                 "identite", score, dest.name)
                for genre, valeur in (reel or {}).items():
                    base.bench_enregistrer_score(cx, _variant_id, job["seed"],
                                                 genre, valeur, dest.name)
                cx.commit()

        sink = Sink(dest_root=dest_root, record=_record)
        runner = lb.WorkflowRunner(variant_cfg, character_id)
        lb.execute_jobs(jobs, variant_cfg, checker, batch_id, character_id,
                        runner=runner, on_event=on_event, should_stop=should_stop,
                        sink=sink)

    return bench_id


# --------------------------------------------------------------- verdict
def _stats(valeurs):
    n = len(valeurs)
    mean = sum(valeurs) / n
    var = sum((v - mean) ** 2 for v in valeurs) / n if n > 1 else 0.0
    return {"mean": mean, "std": var ** 0.5, "min": min(valeurs), "max": max(valeurs), "n": n}


def verdict_bench(character_id, bench_id):
    """Agrege bench_score par variante et par genre, compare chaque variante
    a la reference. Rend {variantes: {label: {genre: {...stats, delta,
    verdict}}}, global: {label: "amelioree"|"degradee"|"mixte"|"stable"|
    "insuffisant"}}.

    AUCUN SEUIL EN DUR : min_seeds/margin viennent de cfg["bench"]
    (invariant 4) — absente, leve BenchConfigMissingError plutot que deviner.
    """
    cfg = lb.load_config(character_id)
    reglage = _bench_config(cfg)
    min_seeds, margin = reglage["min_seeds"], reglage["margin"]

    with base.ouvrir() as cx:
        rows = base.bench_scores(cx, bench_id)

    par_variante = {}
    for r in rows:
        v = par_variante.setdefault(r["label"], {"est_reference": bool(r["est_reference"]),
                                                  "genres": {}})
        v["genres"].setdefault(r["genre"], []).append(r["valeur"])

    reference = next((v for v in par_variante.values() if v["est_reference"]), None)
    stats_reference = ({g: _stats(vals) for g, vals in reference["genres"].items()}
                       if reference else {})

    variantes = {}
    for label, v in par_variante.items():
        stats = {g: _stats(vals) for g, vals in v["genres"].items()}
        par_genre = {}
        for genre, s in stats.items():
            ref_s = stats_reference.get(genre)
            if v["est_reference"] or ref_s is None:
                par_genre[genre] = {**s, "delta": 0.0, "verdict": "reference"}
                continue
            if s["n"] < min_seeds or ref_s["n"] < min_seeds:
                verdict = "insuffisant"
            else:
                m = margin.get(genre, margin.get("_defaut", 0))
                delta = s["mean"] - ref_s["mean"]
                verdict = ("amelioree" if delta > m else
                          "degradee" if delta < -m else "stable")
            par_genre[genre] = {**s, "delta": s["mean"] - ref_s["mean"], "verdict": verdict}
        variantes[label] = {"est_reference": v["est_reference"], "genres": par_genre}

    global_verdict = {}
    for label, v in variantes.items():
        if v["est_reference"]:
            continue
        verdicts = {g["verdict"] for g in v["genres"].values()}
        if "insuffisant" in verdicts:
            global_verdict[label] = "insuffisant"
        elif verdicts <= {"amelioree", "stable"} and "amelioree" in verdicts:
            global_verdict[label] = "meilleure sur tous les axes suivis"
        elif verdicts <= {"degradee", "stable"} and "degradee" in verdicts:
            global_verdict[label] = "pire sur tous les axes suivis"
        elif verdicts == {"stable"}:
            global_verdict[label] = "stable"
        else:
            global_verdict[label] = "mixte"

    return {"variantes": variantes, "global": global_verdict}
