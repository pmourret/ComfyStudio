# -*- coding: utf-8 -*-
"""Banc de comparaison de variantes — deuxieme capacite de plateforme (J8.5,
ADR-0021). Grandit etape par etape (§5 du chantier) :

  [1] base.py : les trois tables bench_run/bench_variant/bench_score,
      aller-retour + isolation (jamais dans image/score/batch)
  [2] liste blanche d'axes + garantie « un seul axe change »
  [3] verdict : agregation, marge/min_seeds configurables, jamais un seuil
      en dur — sur des scores SYNTHETIQUES (pas une generation reelle dont
      l'issue n'est pas pilotable en test)
  [4] LE test que l'enonce exige : run_bench() reel, meme code, sur Lena
      (flux) PUIS Abyssiaelle (sdxl) — ComfyUI + python_embeded requis,
      degrade proprement sinon (meme discipline que test_platform_
      capabilities.py, J8.4)

Personnage/run jetables (prefixe "probe-"), nettoyes a la fin — jamais dans
un personnage reel. [1]-[3] ne touchent jamais ComfyUI.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_bench.py
"""
import importlib.util
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import base   # noqa: E402
import bench  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


RUN_ID = "probe-bench-test"
CID = "probe_bench_j85"

try:
    print("=" * 70)
    print("banc de comparaison de variantes (J8.5)")
    print("=" * 70)

    # --------------------------------------------- [1] base.py : aller-retour
    print("\n[1] bench_run/bench_variant/bench_score : aller-retour + isolation")
    with base.ouvrir() as cx:
        avant_image = cx.execute("SELECT COUNT(*) FROM image").fetchone()[0]
        avant_score = cx.execute("SELECT COUNT(*) FROM score").fetchone()[0]
        avant_batch = cx.execute("SELECT COUNT(*) FROM batch").fetchone()[0]

        base.bench_creer_run(cx, RUN_ID, CID, "steps", "probe_scene", [1, 2, 3])
        base.bench_creer_run(cx, RUN_ID, CID, "steps", "probe_scene", [9, 9, 9])
        vid_ref = base.bench_enregistrer_variante(cx, RUN_ID, "reference", "batch-a",
                                                   {}, est_reference=True)
        vid_b = base.bench_enregistrer_variante(cx, RUN_ID, "steps=30", "batch-b",
                                                {"axis": "steps", "value": 30})
        for seed in (1, 2, 3):
            base.bench_enregistrer_score(cx, vid_ref, seed, "identite", 0.70 + seed * 0.01)
            base.bench_enregistrer_score(cx, vid_b, seed, "identite", 0.75 + seed * 0.01)
        cx.commit()

        run = cx.execute("SELECT seeds_json FROM bench_run WHERE id = ?",
                         (RUN_ID,)).fetchone()
        verifie(run is not None and run["seeds_json"] == "[1, 2, 3]",
                "bench_creer_run est idempotent : la 2e creation (seeds [9,9,9]) "
                f"n'a pas ecrase la 1ere ({run['seeds_json'] if run else None})")

        rows = base.bench_scores(cx, RUN_ID)
        verifie(len(rows) == 6, f"6 scores relus (2 variantes x 3 seeds) : {len(rows)}")
        labels = {r["label"] for r in rows}
        verifie(labels == {"reference", "steps=30"}, f"les deux variantes presentes : {labels}")
        ref_rows = [r for r in rows if r["label"] == "reference"]
        verifie(all(r["est_reference"] == 1 for r in ref_rows),
                "est_reference correctement porte")

        apres_image = cx.execute("SELECT COUNT(*) FROM image").fetchone()[0]
        apres_score = cx.execute("SELECT COUNT(*) FROM score").fetchone()[0]
        apres_batch = cx.execute("SELECT COUNT(*) FROM batch").fetchone()[0]
        verifie((avant_image, avant_score, avant_batch)
               == (apres_image, apres_score, apres_batch),
                "AUCUNE ligne dans image/score/batch — le banc vit dans ses "
                "propres tables, jamais une reutilisation taguee")

        # idempotence de l'ecriture de variante : re-enregistrer la meme
        # (bench_run_id, label) met a jour, ne duplique pas
        vid_ref_2 = base.bench_enregistrer_variante(cx, RUN_ID, "reference", "batch-a-bis",
                                                     {}, est_reference=True)
        cx.commit()
        verifie(vid_ref_2 == vid_ref, "reecrire la meme variante met a jour, ne duplique pas")
        n_variantes = cx.execute(
            "SELECT COUNT(*) FROM bench_variant WHERE bench_run_id = ?",
            (RUN_ID,)).fetchone()[0]
        verifie(n_variantes == 2, f"toujours 2 variantes, pas 3 ({n_variantes})")

    # ------------------------------------- [2] liste blanche + un seul axe
    print("\n[2] liste blanche d'axes, garantie « un seul axe change »")
    ref_cfg = {"identity": {"weight": 0.7}, "preset": {"steps": 20, "guidance": 2.2}}

    variant_cfg = bench.build_variant_cfg(ref_cfg, "steps", 30)
    verifie(variant_cfg["preset"]["steps"] == 30 and variant_cfg["identity"]["weight"] == 0.7,
            "build_variant_cfg change SEULEMENT l'axe demande")
    verifie(ref_cfg["preset"]["steps"] == 20,
            "reference_cfg n'est jamais mute (deepcopy)")
    try:
        bench.validate_variant_cfg(ref_cfg, variant_cfg, "steps", is_reference=False)
        verifie(True, "un seul axe change -> accepte")
    except bench.MultiAxisError as e:
        verifie(False, f"aurait du etre accepte : {e}")

    variant_cfg_2axes = bench.build_variant_cfg(ref_cfg, "steps", 30)
    variant_cfg_2axes["identity"]["weight"] = 0.9   # second axe touche a la main
    attend_leve = False
    try:
        bench.validate_variant_cfg(ref_cfg, variant_cfg_2axes, "steps", is_reference=False)
    except bench.MultiAxisError:
        attend_leve = True
    verifie(attend_leve, "deux axes touches -> MultiAxisError, jamais silencieux")

    attend_leve = False
    try:
        bench.build_variant_cfg(ref_cfg, "base_gelee", "autre.png")
    except bench.UnknownAxisError:
        attend_leve = True
    verifie(attend_leve, "axe hors liste blanche (base_gelee) -> UnknownAxisError")

    overrides = bench.build_variant_job_overrides("sampler", "dpmpp_2m")
    verifie(overrides == {"sampler_name": "dpmpp_2m"},
            f"axe de job (sampler) -> job['overrides'], pas cfg : {overrides}")
    verifie(bench.build_variant_job_overrides("steps", 30) == {},
            "axe de cfg (steps) -> aucune surcharge de job")

    # ----------------------------------------------------------- [3] verdict
    print("\n[3] verdict : agrege, compare a la reference, jamais un seuil en dur")
    with base.ouvrir() as cx:
        base.bench_creer_run(cx, RUN_ID + "-verdict", CID, "steps", "probe_scene", [1, 2, 3, 4, 5])
        vid_ref = base.bench_enregistrer_variante(cx, RUN_ID + "-verdict", "reference",
                                                   "b-ref", {}, est_reference=True)
        vid_up = base.bench_enregistrer_variante(cx, RUN_ID + "-verdict", "steps=30",
                                                  "b-up", {"axis": "steps", "value": 30})
        vid_down = base.bench_enregistrer_variante(cx, RUN_ID + "-verdict", "steps=10",
                                                    "b-down", {"axis": "steps", "value": 10})
        # reference : identite ~0.70, nettete ~50 ; steps=30 : identite MEILLEURE
        # ET nettete MEILLEURE ; steps=10 : les deux PIRES.
        for seed, ident, net in zip((1, 2, 3, 4, 5),
                                    (0.70, 0.71, 0.69, 0.70, 0.71),
                                    (50, 51, 49, 50, 51)):
            base.bench_enregistrer_score(cx, vid_ref, seed, "identite", ident)
            base.bench_enregistrer_score(cx, vid_ref, seed, "nettete", net)
        for seed, ident, net in zip((1, 2, 3, 4, 5),
                                    (0.76, 0.77, 0.75, 0.76, 0.77),
                                    (60, 61, 59, 60, 61)):
            base.bench_enregistrer_score(cx, vid_up, seed, "identite", ident)
            base.bench_enregistrer_score(cx, vid_up, seed, "nettete", net)
        for seed, ident, net in zip((1, 2, 3),  # <-- seulement 3 seeds : sous min_seeds
                                    (0.55, 0.54, 0.56), (30, 29, 31)):
            base.bench_enregistrer_score(cx, vid_down, seed, "identite", ident)
            base.bench_enregistrer_score(cx, vid_down, seed, "nettete", net)
        cx.commit()

    import json
    config_path = OFM / "CHARACTERS" / CID / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps({
        "comfy_url": "http://127.0.0.1:8188", "base_gelee": "x.png",
        "preset": {}, "formats": {}, "export_sizes": {},
        "qc": {"threshold_ok": 0.5, "threshold_watch": 0.3},
        "export": {"enabled": False},
        "bench": {"min_seeds": 5, "margin": {"identite": 0.02, "nettete": 3}},
    }), encoding="utf-8")

    verdict = bench.verdict_bench(CID, RUN_ID + "-verdict")
    v_up = verdict["global"]["steps=30"]
    v_down = verdict["global"]["steps=10"]
    verifie(v_up == "meilleure sur tous les axes suivis",
            f"steps=30 (identite+nettete meilleures, marge depassee) -> {v_up!r}")
    verifie(v_down == "insuffisant",
            f"steps=10 n'a que 3 seeds (< min_seeds=5) -> {v_down!r}, jamais un verdict tranche")

    # marge configurable : une marge enorme rend la meme donnee "stable"
    config_path.write_text(json.dumps({
        "comfy_url": "http://127.0.0.1:8188", "base_gelee": "x.png",
        "preset": {}, "formats": {}, "export_sizes": {},
        "qc": {"threshold_ok": 0.5, "threshold_watch": 0.3},
        "export": {"enabled": False},
        "bench": {"min_seeds": 5, "margin": {"identite": 10.0, "nettete": 100.0}},
    }), encoding="utf-8")
    verdict2 = bench.verdict_bench(CID, RUN_ID + "-verdict")
    verifie(verdict2["global"]["steps=30"] == "stable",
            f"meme donnee, marge configuree tres large -> stable "
            f"({verdict2['global']['steps=30']!r}) — la marge vient de cfg, pas d'une constante")

    config_path.unlink()
    (OFM / "CHARACTERS" / CID).rmdir()
    with base.ouvrir() as cx:
        cx.execute("DELETE FROM bench_run WHERE id = ?", (RUN_ID + "-verdict",))
        cx.commit()

    attend_leve = False
    (OFM / "CHARACTERS" / CID).mkdir(parents=True, exist_ok=True)
    (OFM / "CHARACTERS" / CID / "config.json").write_text(json.dumps({
        "comfy_url": "x", "base_gelee": "x.png", "preset": {}, "formats": {},
        "export_sizes": {}, "qc": {"threshold_ok": 0.5, "threshold_watch": 0.3},
        "export": {"enabled": False}}), encoding="utf-8")  # pas de cfg["bench"]
    try:
        bench.verdict_bench(CID, "peu-importe")
    except bench.BenchConfigMissingError:
        attend_leve = True
    verifie(attend_leve,
            "cfg['bench'] absente -> BenchConfigMissingError, jamais un repli en dur")
    (OFM / "CHARACTERS" / CID / "config.json").unlink()
    (OFM / "CHARACTERS" / CID).rmdir()

    # ------------------------------------------- [4] run_bench() reel, deux packs
    print("\n[4] run_bench() reel, MEME CODE, Lena (flux) PUIS Abyssiaelle (sdxl)")
    try:
        urllib.request.urlopen("http://127.0.0.1:8188/system_stats", timeout=3)
        comfy_up = True
    except Exception:
        comfy_up = False

    cv2_ok = importlib.util.find_spec("cv2") is not None

    if not comfy_up:
        print("  note  ComfyUI injoignable sur http://127.0.0.1:8188 — [4] non verifie ici,")
        print("        pas simule comme si ca l'etait. Relancer ce test ComfyUI demarre pour")
        print("        la preuve complete.")
    elif not cv2_ok:
        print("  note  ComfyUI joignable mais cv2/insightface absents de cet interpreteur")
        print("        (attendu sous .venv — ADR-0008, requirements.txt) — [4] non verifie")
        print("        ici. Relancer avec python_embeded\\python.exe pour la preuve complete.")
    else:
        import bench as _bench_source
        source = Path(_bench_source.__file__).read_text(encoding="utf-8")
        verifie("import universe" not in source and "import identity" not in source,
                "aucun import de universe/identity dans bench.py (preuve structurelle)")

        import runner as lb
        bench_ids = {}
        for cid, scene in (("lena", "cafe_terrasse"), ("abyssiaelle", "portrait_etude")):
            steps_actuels = lb.load_config(cid)["preset"]["steps"]
            bench_id = bench.run_bench(cid, scene, seeds=[1001, 1002], axis="steps",
                                       values=[steps_actuels + 5])
            bench_ids[cid] = bench_id
            verdict = bench.verdict_bench(cid, bench_id)
            label = f"steps={steps_actuels + 5}"
            v = verdict["global"][label]
            verifie(v == "insuffisant",
                    f"{cid} : 2 seeds < min_seeds=5 -> verdict 'insuffisant' ({v!r}) — "
                    f"le gate marche aussi sur de vraies donnees, pas juste en synthese")
            bench_root = OFM / "PROD" / cid.upper() / "_BENCH" / bench_id
            verifie(bench_root.is_dir() and any(bench_root.rglob("*.png")),
                    f"{cid} : images reelles produites sous PROD/{cid.upper()}/_BENCH/")
            verifie(not any((OFM / "PROD" / cid.upper()).glob(f"OK/*{bench_id}*"))
                   and not any((OFM / "PROD" / cid.upper()).glob(f"A_REVOIR/*{bench_id}*")),
                    f"{cid} : rien de ce banc n'apparait dans PROD/{cid.upper()}/OK ou A_REVOIR")

        # nettoyage des deux vrais personnages
        import shutil as _sh
        with base.ouvrir() as cx:
            for bid in bench_ids.values():
                cx.execute("DELETE FROM bench_run WHERE id = ?", (bid,))
            cx.commit()
        for cid, bid in bench_ids.items():
            _sh.rmtree(OFM / "PROD" / cid.upper() / "_BENCH" / bid, ignore_errors=True)

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)
finally:
    import shutil
    with base.ouvrir() as cx:
        cx.execute("DELETE FROM bench_run WHERE id = ?", (RUN_ID,))
        cx.execute("DELETE FROM bench_run WHERE id = ?", (RUN_ID + "-verdict",))
        cx.commit()
    shutil.rmtree(OFM / "CHARACTERS" / CID, ignore_errors=True)

sys.exit(1 if KO else 0)
