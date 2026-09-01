# -*- coding: utf-8 -*-
"""?character= de bout en bout (J3 etape 4) : chaque appel /api/* porte l'id du
personnage, le serveur le resout contre CHARACTERS/<id>/ et sert les donnees de
CE personnage — jamais celles d'un autre.

Ce qui se teste ici et nulle part ailleurs : l'ISOLATION entre personnages sur
une route generalisee (exigence CLAUDE.md §11), et le fait qu'un id fantaisiste
ou un chemin deguise ressorte en 400 JSON, jamais en 500 ni en acces disque
hors CHARACTERS/.

Cree un CHARACTERS/probe/ jetable le temps du test, le supprime a la fin
(CHARACTERS/ est git-ignore : rien ne peut fuir dans l'historique).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_character_param.py
"""
import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
PY = Path(sys.executable)
PORT = 8207
BASE = f"http://127.0.0.1:{PORT}"
LENA = OFM / "CHARACTERS" / "lena"
PROBE = OFM / "CHARACTERS" / "probe"

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def appel(chemin, corps=None):
    donnees = json.dumps(corps).encode() if corps is not None else None
    tetes = {"Content-Type": "application/json"} if donnees is not None else {}
    req = urllib.request.Request(BASE + chemin, data=donnees,
                                method="POST" if donnees is not None else "GET",
                                headers=tetes)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def jget(corps):
    try:
        return json.loads(corps)
    except Exception:
        return None


# ------------------------------------------------------------- fixture probe
def poser_fixture():
    if PROBE.exists():
        shutil.rmtree(PROBE)
    PROBE.mkdir(parents=True)
    # character.json : registre personnage (J4). character() le refuse sans lui,
    # ou si son univers n'existe pas. Univers reel pour rester dans le heureux.
    (PROBE / "character.json").write_text(json.dumps(
        {"id": "probe", "name": "Probe", "universe": "instagram-influenceur",
         "content_types": {"image": True}, "nsfw": False},
        ensure_ascii=False, indent=2), encoding="utf-8")
    # config : copie de lena, avec un marqueur distinctif verifiable
    cfg = json.loads((LENA / "config.json").read_text(encoding="utf-8"))
    cfg["base_gelee"] = "PROBE_MARKER_00000_.png"
    (PROBE / "config.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2),
                                       encoding="utf-8")
    # creative : celle de lena suffit (le test ne juge pas la taxonomie)
    shutil.copy(LENA / "creative.json", PROBE / "creative.json")
    # scenes : une banque valide, aux id volontairement introuvables chez lena
    banque = {
        "prefix": "PROBE", "anchor": "probe anchor", "texture": "probe texture",
        "direction": "",
        "scenes": [
            {"id": "probe_scene_alpha", "prompt": "a plain room, wide shot",
             "format": "4:5", "wardrobe": {"0": "a linen shirt"}, "intensity": 0},
            {"id": "probe_scene_beta", "prompt": "a garden path, morning light",
             "format": "4:5", "wardrobe": {"0": "a cotton dress"}, "intensity": 0},
        ],
    }
    (PROBE / "scenes.json").write_text(json.dumps(banque, ensure_ascii=False, indent=2),
                                       encoding="utf-8")
    return banque


def ids_scenes(corps):
    d = jget(corps) or {}
    return {s.get("id") for s in (d.get("data") or {}).get("scenes", [])}


banque_probe = poser_fixture()
lena_sig = json.loads((LENA / "scenes.json").read_text(encoding="utf-8"))

proc = subprocess.Popen(
    [str(PY), str(OFM / "AUTOMATION" / "web" / "app.py"),
     "--port", str(PORT), "--no-comfy", "--no-browser"],
    cwd=str(OFM), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/api/state?character=lena", timeout=2).close()
            break
        except Exception:
            if proc.poll() is not None:
                print("  le serveur s'est arrete au demarrage :")
                print(proc.stdout.read().decode("utf-8", "replace")[:2000])
                sys.exit(1)
            time.sleep(0.5)
    else:
        print("  le serveur n'a pas repondu")
        sys.exit(1)

    print("=" * 70)
    print(f"serveur de test sur {BASE}")
    print("=" * 70)

    # ============================================================== [1]
    print("\n[1] aucun defaut, le param est honore")
    # plus de repli silencieux sur un personnage precis (2026-09-01) — voir
    # test_isolation_disque.py [2] pour la meme regle sur /img
    code, corps = appel("/api/config")
    verifie(code == 400 and "obligatoire" in jget(corps).get("erreur", ""),
            f"sans param : refuse, aucun repli ({code})")
    code, corps = appel("/api/config?character=lena")
    verifie(code == 200 and jget(corps).get("base_gelee") != "PROBE_MARKER_00000_.png",
            f"?character=lena : config de lena ({code})")
    code, corps = appel("/api/config?character=probe")
    verifie(code == 200 and jget(corps).get("base_gelee") == "PROBE_MARKER_00000_.png",
            f"?character=probe : config de PROBE, pas celle de lena ({code})")

    # ============================================================== [2]
    print("\n[2] /api/scenes ne melange jamais deux personnages")
    code, corps = appel("/api/scenes?character=probe")
    ids = ids_scenes(corps)
    verifie(code == 200 and ids == {"probe_scene_alpha", "probe_scene_beta"},
            f"probe voit SES 2 scenes ({sorted(ids)})")
    lena_ids = {s["id"] for s in lena_sig["scenes"]}
    verifie(not (ids & lena_ids),
            "aucune scene de lena ne fuit dans la reponse de probe")
    code, corps = appel("/api/scenes?character=lena")
    verifie(code == 200 and ids_scenes(corps) == lena_ids,
            "?character=lena voit toujours la banque de lena")

    # ============================================================== [3]
    print("\n[3] un id invalide sort en 400 JSON, jamais en 500 ni en chemin")
    for mauvais, quoi in [("../lena", "chemin deguise"),
                          ("..%2f..%2fetc", "traversee encodee"),
                          ("Lena", "majuscule (slug minuscule attendu)"),
                          ("does-not-exist", "personnage inconnu"),
                          ("a%20b", "espace (encode)"),
                          ("lena.bak", "point dans l'id")]:
        code, corps = appel(f"/api/config?character={mauvais}")
        d = jget(corps)
        verifie(code == 400 and d is not None and d.get("ok") is False,
                f"{quoi} : 400 JSON ({code})")

    # ============================================================== [4]
    print("\n[4] POST /api/scenes ecrit le fichier du BON personnage")
    avant_lena = (LENA / "scenes.json").read_text(encoding="utf-8")
    modif = json.loads(json.dumps(banque_probe))
    modif["scenes"][0]["prompt"] = "a plain room, wide shot, repainted"
    code, corps = appel("/api/scenes?character=probe", {"data": modif})
    verifie(code == 200 and jget(corps).get("ok") is True,
            f"enregistrement probe accepte ({code})")
    verifie("repainted" in (PROBE / "scenes.json").read_text(encoding="utf-8"),
            "CHARACTERS/probe/scenes.json a bien recu la modification")
    verifie((LENA / "scenes.json").read_text(encoding="utf-8") == avant_lena,
            "CHARACTERS/lena/scenes.json n'a pas bouge d'un octet")

    # ============================================================== [5]
    print("\n[5] /api/creative repond par personnage")
    code, corps = appel("/api/creative?character=probe")
    d = jget(corps) or {}
    verifie(code == 200 and isinstance(d.get("intensity"), list),
            f"probe : taxonomie servie ({code})")

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)

finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    if PROBE.exists():
        shutil.rmtree(PROBE)

sys.exit(1 if KO else 0)
