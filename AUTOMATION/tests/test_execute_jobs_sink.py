# -*- coding: utf-8 -*-
"""`execute_jobs(..., sink=...)` : redirection hors production, J8.5 etape 1.

POURQUOI CE TEST EXISTE. `execute_jobs` est le coeur d'execution unique
(CLAUDE.md §8.2) — le banc de comparaison de variantes (J8.5) doit passer
par lui plutot que par une boucle a part, mais sans jamais ecrire dans
PROD/<CID>/<verdict>/ ni dans mesures.json/le journal partage. Ce test
verrouille les DEUX faces : `sink=None` (tout appelant existant) ne change
RIEN, `sink` fourni ne touche JAMAIS la production normale.

Aucun appel a ComfyUI : un faux `runner` produit un faux fichier directement
sous COMFY_OUTPUT, comme le ferait ComfyUI. `checker=None` (pas
d'InsightFace/cv2 necessaire ici — ce test tourne sous le venv de dev).

Lancer :  python AUTOMATION\\tests\\test_execute_jobs_sink.py
"""
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb                    # noqa: E402
from runner.sortie import Sink         # noqa: E402
from runner import COMFY_OUTPUT        # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


CID = "probe_sink_j85"
PROD_CID = OFM / "PROD" / CID.upper()
BENCH_ROOT = OFM / "PROD" / CID.upper() / "_BENCH" / "probe-run" / "variante-a"
JOURNAL = OFM / "PROD" / "journal_batch.csv"


def _job(seed):
    return {"character_id": CID, "scene": "probe_scene", "category": "probe",
            "intention": "probe", "tone": "", "intensity": 0, "outfit": "",
            "format": "1:1", "variant": "", "index": 1,
            "prompt": "prompt de test", "fragments": [], "seed": seed,
            "overrides": {}, "pose": None}


class _StubRunner:
    """Ne parle jamais a ComfyUI : depose directement un vrai (mais minuscule)
    PNG la ou execute_jobs ira le chercher (COMFY_OUTPUT), comme ComfyUI
    l'aurait fait. Un PNG REEL, pas des octets arbitraires : sort_and_export
    tente un export (cfg['export']['enabled']=True) qui ouvre le fichier
    avec PIL — de faux octets font echouer CETTE ouverture avant que le test
    n'ait pu observer ce qu'il voulait, sans rapport avec sink."""

    def __init__(self):
        self.n = 0

    def api_for(self, job, batch_id):
        return {}

    def queue(self, api):
        from PIL import Image
        self.n += 1
        name = f"stub_{self.n}.png"
        Image.new("RGB", (8, 8), (120, 60, 200)).save(COMFY_OUTPUT / name)
        self._name = name
        return "fake_prompt_id", None

    def wait(self, prompt_id, timeout=900):
        return [{"filename": self._name, "subfolder": ""}], None, 0.05


CFG = {"comfy_url": "http://127.0.0.1:8188", "base_gelee": "x.png",
      "preset": {"grain_telephone": False, "expression": False},
      "export": {"enabled": True, "format": "jpg", "quality": 92},
      "export_sizes": {"1:1": [512, 512]}, "formats": {"1:1": [512, 512]},
      "qc": {"threshold_ok": 0.5, "threshold_watch": 0.3}}


try:
    print("=" * 70)
    print("execute_jobs(sink=...) : redirection hors production (J8.5 etape 1)")
    print("=" * 70)

    journal_avant = JOURNAL.read_bytes() if JOURNAL.is_file() else None

    # ------------------------------------------------- [1] sink=None inchange
    print("\n[1] sink=None : comportement identique a avant (aucun changement)")
    rows, stats = lb.execute_jobs([_job(111)], CFG, checker=None,
                                  batch_id="probe-normal", character_id=CID,
                                  runner=_StubRunner())
    verifie(bool(rows), "des lignes sont produites")
    verifie((PROD_CID / "OK").is_dir() and any((PROD_CID / "OK").iterdir()),
            "l'image atterrit dans PROD/<CID>/OK/, comme toujours")
    verifie(JOURNAL.is_file(), "le journal partage a ete ecrit")

    # ------------------------------------------------ [2] sink fourni : isole
    print("\n[2] sink fourni : rien dans PROD/<CID>/<verdict>/, rien dans le journal")
    recorded = []
    sink = Sink(dest_root=BENCH_ROOT, record=lambda *a: recorded.append(a))
    journal_apres_1 = JOURNAL.read_bytes()
    export_dir = OFM / "PROD" / "EXPORT" / CID / "probe"
    export_avant = set(export_dir.glob("*")) if export_dir.is_dir() else set()
    rows2, stats2 = lb.execute_jobs([_job(222)], CFG, checker=None,
                                    batch_id="probe-bench", character_id=CID,
                                    runner=_StubRunner(), sink=sink)
    verifie(bool(rows2), "execute_jobs rend quand meme des lignes a l'appelant")
    verifie(len(recorded) == 1, f"sink.record() appele une fois par image ({len(recorded)})")
    verifie((BENCH_ROOT / "OK").is_dir() and any((BENCH_ROOT / "OK").iterdir()),
            "l'image atterrit sous sink.dest_root, pas PROD/<CID>/")
    verifie(not any((PROD_CID / "OK").glob("*222*")),
            "aucun fichier lie a ce job n'apparait dans PROD/<CID>/OK/")
    verifie(JOURNAL.read_bytes() == journal_apres_1,
            "le journal partage n'a PAS bouge — sink remplace append_log entierement")
    export_apres = set(export_dir.glob("*")) if export_dir.is_dir() else set()
    verifie(export_apres == export_avant,
            "aucun NOUVEL export, meme si cfg['export']['enabled'] est vrai "
            "(le job [1], sink=None, a legitimement exporte le sien avant)")

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)
finally:
    shutil.rmtree(PROD_CID, ignore_errors=True)
    shutil.rmtree(OFM / "PROD" / "EXPORT" / CID, ignore_errors=True)
    # [1] est le seul cas (sink=None) qui touche le journal/la base PARTAGES —
    # nettoye ce que ce personnage jetable y a laisse, rien d'autre.
    if JOURNAL.is_file():
        lignes = JOURNAL.read_text(encoding="utf-8").splitlines(keepends=True)
        propre = [l for l in lignes if f";{CID};" not in l]
        if propre != lignes:
            JOURNAL.write_text("".join(propre), encoding="utf-8")
    try:
        import base
        with base.ouvrir() as cx:
            cx.execute("DELETE FROM image WHERE character_id = ?", (CID,))
            cx.execute("DELETE FROM batch WHERE character_id = ?", (CID,))
            cx.commit()
    except Exception:
        pass

sys.exit(1 if KO else 0)
