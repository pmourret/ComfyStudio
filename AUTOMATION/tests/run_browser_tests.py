# -*- coding: utf-8 -*-
"""Lance les fumigations navigateur, chacune contre un tableau de bord NEUF.

Pourquoi un lanceur. Ces tests mutent l'etat (creent des images, extraient des
poses, enregistrent scenes.json puis reviennent en arriere). Enchaines sur un
meme dashboard, ils se contaminaient (constate : test_pose_scene_card echouait
en batch, vert en isolation). Ici : un `app.py --no-comfy --no-browser` par
test, sur un port dedie, tue apres.

DEUX SUITES pendant la migration React.

  REACT   les fumigations du nouveau frontend, recreees ECRAN PAR ECRAN au fil
          de la migration. C'est ce qui tourne par defaut.
  LEGACY  les 14 fumigations de l'ancien frontend. Elles s'accrochent aux ids
          du DOM vanilla ET a l'ancienne racine `/`, qui sert desormais le
          studio React : elles ne passent plus, c'est attendu. Les SEPT ecrans
          etant migres, chacune a desormais son equivalent React (voir la
          colonne ci-dessous) ; elles restent la jusqu'a la depose de
          `/legacy`, comme trace de ce qui etait verifie. `--legacy` les lance
          quand meme, pour le lire.

            test_ecran_registre ............ test_characters
            test_ecran_wizard .............. test_wizard
            test_ecran_creer ............... test_produce
            test_panneau_reglages .......... test_produce
            test_apercu_prompt ............. test_produce
            test_compte_rendu .............. test_produce
            test_galerie ................... test_review
            test_contenu_adulte ............ test_application
            test_sondes_comfy .............. test_application
            test_application_suppression_editeur  test_application + test_editor
            test_rail_repli ................ test_bank
            test_scenes_aller_retour ....... test_bank
            test_pose_scene_card ........... test_bank
            test_pose_extraction ........... test_pose_extract

QUEL INTERPRETEUR. Le studio tourne sous `python_embeded`, celui de ComfyUI
(AUDIT §2.4), et c'est LUI qu'il faut employer ici : le venv de developpement
n'a pas `cv2`, donc /api/mesurer y repond 500 et la fumigation de la Revue
echoue pour une raison qui n'a rien a voir avec le frontend. Le lanceur le
verifie au demarrage et le DIT.

CHAINE D'OUTILS PORTABLE. Playwright et son chromium vivent DANS le depot
(.toolchain/, git-ignore), installes par AUTOMATION/tools/toolchain.py — rien
sous %APPDATA%. Les deux variables qui le disent sont posees ici pour les tests.

    python_embeded/python.exe AUTOMATION/tests/run_browser_tests.py
    ... --legacy                 lance aussi l'ancienne suite
    ... --only test_journal
    ... --port-base 8260
    ... --pw <chemin vers un node_modules>   (defaut : celui du repo)

Un test qui ne trouve pas ses prerequis (playwright, ComfyUI, image source)
s'auto-ignore proprement (IGNORE) et ne compte pas comme un echec.
"""
import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
APP = OFM / "AUTOMATION" / "web" / "app.py"
PY = sys.executable
# Chaine d'outils portable : tout ce que npm et Playwright telechargent vit
# dans le depot (voir AUTOMATION/tools/toolchain.py).
UI_MODULES = OFM / "AUTOMATION" / "web" / "ui" / "node_modules"
BROWSERS = OFM / ".toolchain" / "playwright-browsers"

# Fumigations du frontend React, dans l'ordre ou les ecrans sont migres.
TESTS = [
    "test_journal",       # coquille + Journal (ecran 1)
    "test_characters",    # sas d'entree + fiche du personnage (ecran 2)
    "test_application",   # cycle de vie, sondes, contenu adulte (ecran 3)
    "test_wizard",        # creation d'un personnage : parcours et gating (ecran 4)
    "test_bank",          # banque de scenes + poses + rail d'outils (ecran 5)
    "test_review",        # Revue et Galerie, pieges `v` et /api/mesurer (ecran 6)
    "test_editor",        # editeur photo : recadrage, copie, ecrasement (ecran 6)
    "test_produce",       # Produire : pieges /api/plan et #btnRun (ecran 7)
    "test_pose_extract",  # ComfyUI requis (s'ignore sinon) : extraction reelle
]

# Fumigations de l'ancien frontend. Elles visent `/` et les ids du DOM vanilla ;
# depuis la bascule, `/` sert le studio React et l'ancien vit sous `/legacy`.
# Conservees comme cahier des charges de leur ecran jusqu'a sa migration.
LEGACY_TESTS = [
    "test_ecran_registre",
    "test_ecran_wizard",
    "test_ecran_creer",
    "test_contenu_adulte",
    "test_sondes_comfy",
    "test_rail_repli",
    "test_galerie",
    "test_compte_rendu",
    "test_apercu_prompt",
    "test_panneau_reglages",
    "test_scenes_aller_retour",
    "test_pose_scene_card",
    "test_pose_extraction",                       # ComfyUI requis (s'ignore sinon)
    "test_application_suppression_editeur",       # image source requise (s'ignore sinon)
]


def _free_from(base):
    p = base
    while p < base + 200:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
        p += 1
    raise RuntimeError("aucun port libre")


def _wait_http(url, tries=60):
    for _ in range(tries):
        try:
            urllib.request.urlopen(url, timeout=2).close()
            return True
        except Exception:
            time.sleep(0.5)
    return False


def _kill(proc):
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)


def run_one(name, port, node_path):
    script = HERE / f"{name}.js"
    if not script.is_file():
        return name, "ABSENT", ""
    dash = subprocess.Popen(
        [PY, str(APP), "--no-comfy", "--no-browser", "--port", str(port)],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=str(OFM),
        encoding="utf-8", errors="replace")          # les sorties portent des emoji
    try:
        if not _wait_http(f"http://127.0.0.1:{port}/api/state"):
            _kill(dash)
            return name, "DASH-KO", (dash.stdout.read() or "")[-800:]
        env = {**os.environ,
               "DASHBOARD_URL": f"http://127.0.0.1:{port}",
               "NODE_PATH": node_path,
               # chromium vit dans le depot, jamais sous %LOCALAPPDATA%
               "PLAYWRIGHT_BROWSERS_PATH": str(BROWSERS),
               # un test qui doit nettoyer derriere lui en base appelle Python ;
               # sans ca il tomberait sur le `python` du PATH, qui n'est pas
               # forcement celui-la (ADR-0008).
               "SOULGLADE_PYTHON": PY,
               "PYTHONIOENCODING": "utf-8"}
        res = subprocess.run(["node", str(script)], cwd=str(OFM), env=env,
                             capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=600)
        out = (res.stdout or "") + (res.stderr or "")
        if "IGNORE —" in out or "IGNORE -" in out:
            verdict = "IGNORE"
        elif res.returncode == 0 and "tout est vert" in out:
            verdict = "OK"
        else:
            verdict = "FAIL"
        return name, verdict, out
    finally:
        _kill(dash)


def main(argv):
    ap = argparse.ArgumentParser(description="Fumigations navigateur, un dashboard neuf par test")
    ap.add_argument("--pw", default=str(UI_MODULES),
                    help="node_modules contenant playwright (defaut : celui du repo)")
    ap.add_argument("--only", default="", help="liste separee par des virgules")
    ap.add_argument("--legacy", action="store_true",
                    help="lancer aussi les fumigations de l'ancien frontend")
    ap.add_argument("--port-base", type=int, default=8260)
    ap.add_argument("--verbose", action="store_true", help="sortie complete de chaque test")
    a = ap.parse_args(argv)

    if not shutil.which("node"):
        print("node introuvable dans le PATH — impossible de lancer les fumigations navigateur")
        return 2
    # Avertissement, pas un refus : la plupart des fumigations n'ont pas besoin
    # d'InsightFace. Seule celle de la Revue en depend (/api/mesurer), et sans
    # ce mot elle echouerait sur un 500 dont la cause est l'interpreteur.
    try:
        import cv2  # noqa: F401
    except ImportError:
        print(f"!! {PY} n'a pas cv2 : /api/mesurer repondra 500,",
              "et test_review echouera pour une raison qui n'est pas le frontend.",
              "Lancer avec le python de ComfyUI (python_embeded), celui du studio.",
              flush=True)
    if not (Path(a.pw) / "playwright").is_dir():
        print(f"playwright introuvable sous {a.pw}\n"
              f"  l'installer HORS du repo :  mkdir ~/.soulglade-pw && cd ~/.soulglade-pw\n"
              f"  npm init -y && npm i playwright && npx playwright install chromium\n"
              f"  (ou passer --pw <chemin>)")
        return 2

    wanted = [t.strip() for t in a.only.split(",") if t.strip()] or TESTS
    print("=" * 72)
    print(f"fumigations navigateur — {len(wanted)} test(s), un dashboard neuf chacun")
    print("=" * 72)

    results, port = [], a.port_base
    for name in wanted:
        port = _free_from(port)
        print(f"\n--- {name}  (port {port})")
        t0 = time.time()
        n, verdict, out = run_one(name, port, a.pw)
        dt = time.time() - t0
        results.append((n, verdict))
        mark = {"OK": "ok   ", "FAIL": "ECHEC", "IGNORE": "skip ",
                "ABSENT": "?    ", "DASH-KO": "ECHEC"}.get(verdict, "?    ")
        print(f"  {mark} {verdict}  ({dt:.0f}s)")
        if a.verbose or verdict in ("FAIL", "DASH-KO"):
            print("\n".join("    " + l for l in out.strip().splitlines()[-40:]))
        port += 1

    print("\n" + "=" * 72)
    ok = sum(v == "OK" for _, v in results)
    skip = sum(v == "IGNORE" for _, v in results)
    fail = [n for n, v in results if v in ("FAIL", "DASH-KO", "ABSENT")]
    for n, v in results:
        print(f"  {v:8} {n}")
    print("=" * 72)
    print(f"{ok} vert(s), {skip} ignore(s), {len(fail)} echec(s)")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
