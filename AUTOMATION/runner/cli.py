"""Point d'entree ligne de commande du runner batch.

Invoque via AUTOMATION/run_batch.py (et run_batch.bat) plutot que directement
: un fichier a l'interieur d'un paquet ne peut pas etre lance comme script
autonome (imports relatifs), voir run_batch.py pour le detail.
"""
import argparse
from datetime import datetime

from . import load_json, log, OFM
from .prompt import build_jobs, config_path, scenes_path
from .comfy import WorkflowRunner
from .sortie import execute_jobs, make_checker


def main():
    ap = argparse.ArgumentParser(description="Runner batch")
    ap.add_argument("--character", default="lena", help="identifiant du personnage")
    ap.add_argument("--config", default=None,
                    help="chemin config.json (defaut : CHARACTERS/<character>/config.json)")
    ap.add_argument("--scenes-file", default=None,
                    help="chemin scenes.json (defaut : CHARACTERS/<character>/scenes.json)")
    ap.add_argument("--scene", action="append", help="id de scene (repetable)")
    ap.add_argument("--category", action="append", help="categorie (repetable)")
    ap.add_argument("--format", help="force le format (4:5, 2:3, 9:16, 1:1)")
    ap.add_argument("--count", type=int, help="images par scene (ecrase scenes.json)")
    ap.add_argument("--limit", type=int, help="nombre total de jobs maximum")
    ap.add_argument("--seed", type=int, help="seed fixe (reproductibilite)")
    ap.add_argument("--no-variants", action="store_true")
    ap.add_argument("--no-qc", action="store_true", help="pas de score d'identite")
    ap.add_argument("--dry-run", action="store_true", help="affiche le plan, ne lance rien")
    args = ap.parse_args()

    character_id = args.character
    config_file = args.config or str(config_path(character_id))
    scenes_file = args.scenes_file or str(scenes_path(character_id))

    cfg = load_json(config_file)
    jobs = build_jobs(scenes_file, args, character_id=character_id)
    if not jobs:
        log("aucune scene ne correspond aux filtres.")
        return 1

    batch_id = datetime.now().strftime("%Y%m%d_%H%M")
    log(f"batch {batch_id} : {len(jobs)} image(s) a produire ({character_id})")
    if args.dry_run:
        for j in jobs:
            v = f" [{j['variant'][:30]}]" if j["variant"] else ""
            print(f"  {j['category']:14} {j['scene']:22} {j['format']:5} "
                  f"seed={j['seed']}{v}")
            print(f"       {j['prompt'][:150]}...")
        return 0

    runner = WorkflowRunner(cfg, character_id)
    p = cfg["preset"]
    # .get() partout : un personnage dont le graphe n'a pas (encore) ces
    # groupes optionnels (refiner/facedetailer/grain, cf. WorkflowRunner.
    # __init__ et api_for) n'a aucune raison de porter ces cles dans son
    # preset -- Abyssiaelle (J6) n'en a aucune, contrairement a Lena.
    log(f"prereglage : guidance {p['guidance']} | refiner "
        f"{'ON ' + str(p.get('refiner_denoise', 0.4)) if p.get('refiner') else 'OFF'} | "
        f"facedetailer {'ON' if p.get('facedetailer') else 'OFF'} | "
        f"grain {'ON' if p.get('grain_export') else 'OFF'}")

    checker = None if args.no_qc else make_checker(cfg)

    def on_event(kind, **kw):
        if kind == "done":
            job, r = kw["job"], kw["result"]
            head = f"{kw['index']}/{kw['total']} {job['scene']} ({job['format']})"
            if r["verdict"] == "ERREUR":
                log(f"{head} : echec -> {r.get('error')}")
            else:
                sc = f"({r['score']:.3f}) " if r.get("score") else ""
                log(f"{head} : {r['verdict']} {sc}{r['duree']:.0f}s -> {r['fichier']}")

    rows, stats = execute_jobs(jobs, cfg, checker, batch_id, character_id=character_id,
                               runner=runner, on_event=on_event)
    log("termine : " + " | ".join(f"{k} {v}" for k, v in stats.items() if v))
    if rows:
        log(f"journal : {OFM / 'PROD' / 'journal_batch.csv'}")
        log(f"a publier : {OFM / 'PROD' / 'EXPORT'}")
    return 0
