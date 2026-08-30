# -*- coding: utf-8 -*-
"""Lance les fumigations navigateur (tests/test_ecran_*.js, test_pose_*.js,
test_apercu_prompt.js, test_contenu_adulte.js,
test_application_suppression_editeur.js) chacune contre un tableau de bord NEUF.

Pourquoi un lanceur. Ces tests mutent l'etat (creent des images, extraient des
poses, enregistrent scenes.json puis reviennent en arriere). Enchaines sur un
meme dashboard, ils se contaminaient (constate : test_pose_scene_card echouait
en batch, vert en isolation). Ici : un `app.py --no-comfy --no-browser` par
test, sur un port dedie, tue apres. NODE_PATH pointe sur le playwright installe
HORS du repo (le repo n'a aucune dependance).

    python_embeded\\python.exe AUTOMATION\\tests\\run_browser_tests.py
    ... --pw  C:\\chemin\\vers\\node_modules   (defaut : ~/.soulglade-pw/node_modules)
    ... --only test_ecran_wizard,test_ecran_registre
    ... --port-base 8260

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

TESTS = [
    "test_ecran_registre",
    "test_ecran_wizard",
    "test_ecran_creer",
    "test_contenu_adulte",
    "test_sondes_comfy",
    "test_rail_repli",
    "test_galerie",
    "test_compte_rendu",
    "test_apercu_prompt",
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
    ap.add_argument("--pw", default=str(Path.home() / ".soulglade-pw" / "node_modules"),
                    help="node_modules contenant playwright (installe hors du repo)")
    ap.add_argument("--only", default="", help="liste separee par des virgules")
    ap.add_argument("--port-base", type=int, default=8260)
    ap.add_argument("--verbose", action="store_true", help="sortie complete de chaque test")
    a = ap.parse_args(argv)

    if not shutil.which("node"):
        print("node introuvable dans le PATH — impossible de lancer les fumigations navigateur")
        return 2
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
