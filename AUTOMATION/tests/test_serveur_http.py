# -*- coding: utf-8 -*-
"""Fumigation du vrai serveur : on le demarre sur un port de test et on
l'interroge par HTTP. ComfyUI n'a pas besoin de tourner.

Ce qui se teste ici ne se teste pas ailleurs : les middlewares (ils ne
s'executent que dans une vraie pile aiohttp), et le fait qu'une requete
malformee ressorte en JSON plutot qu'en page HTML — c'est la difference entre un
message lisible a l'ecran et « reponse invalide du serveur (500) ».

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_serveur_http.py
"""
import json
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
PY = Path(sys.executable)
PORT = 8199
BASE = f"http://127.0.0.1:{PORT}"

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def appel(chemin, corps=None, entetes=None, brut=None, methode=None):
    """Rend (code, corps). `brut` envoie un corps sans passer par JSON."""
    donnees = brut if brut is not None else (
        json.dumps(corps).encode() if corps is not None else None)
    tetes = {"Content-Type": "application/json"} if donnees is not None else {}
    tetes.update(entetes or {})
    req = urllib.request.Request(
        BASE + chemin, data=donnees,
        method=methode or ("POST" if donnees is not None else "GET"),
        headers=tetes)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def est_json(corps):
    try:
        json.loads(corps)
        return True
    except Exception:
        return False


proc = subprocess.Popen(
    [str(PY), str(OFM / "AUTOMATION" / "web" / "app.py"),
     "--port", str(PORT), "--no-comfy", "--no-browser"],
    cwd=str(OFM), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/api/state", timeout=2).close()
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

    banque = json.loads((OFM / "CHARACTERS" / "lena" / "scenes.json").read_text(encoding="utf-8"))

    # ============================================================== E2
    print("\n[E2] le bucket SANS_VISAGE est atteignable")
    code, corps = appel("/api/state")
    verifie("SANS_VISAGE" in json.loads(corps).get("counts", {}),
            "/api/state le compte")
    code, _ = appel("/api/gallery?bucket=SANS_VISAGE&space=sfw&character=lena")
    verifie(code == 200, f"/api/gallery le sert ({code})")
    page = urllib.request.urlopen(BASE + "/static/index.html", timeout=10).read()
    verifie(b'data-b="SANS_VISAGE"' in page, "le bouton est dans la page")

    # ============================================================== E1
    print("\n[E1] la banque de scenes est validee cote serveur")
    ampute = json.loads(json.dumps(banque))
    ampute.pop("texture")
    code, corps = appel("/api/scenes", {"data": ampute})
    verifie(code == 400 and b"texture" in corps, f"sans « texture » : refuse ({code})")

    detruite = json.loads(json.dumps(banque))
    for s in detruite["scenes"]:
        for c in ("intention", "intensity", "tags", "tones", "wardrobe"):
            s.pop(c, None)
    code, corps = appel("/api/scenes", {"data": detruite})
    verifie(code == 400 and "seul coup" in json.loads(corps).get("erreur", ""),
            f"l'effacement en lot du 25/08 : refuse ({code})")
    verifie(json.loads((OFM / "CHARACTERS" / "lena" / "scenes.json").read_text(encoding="utf-8"))
            == banque, "le fichier sur disque n'a pas bouge")

    # ============================================================== M1
    print("\n[M1] seules les requetes du tableau de bord lui-meme passent")
    code, corps = appel("/api/nsfw/arm", brut=b'{"arm":true,"confirm":"ARMER"}',
                        entetes={"Content-Type": "text/plain"})
    verifie(code == 415,
            f"POST en text/plain (requete « simple », sans preflight) : refuse ({code})")

    code, _ = appel("/api/nsfw/arm", {"arm": True, "confirm": "ARMER"},
                    entetes={"Origin": "http://evil.example"})
    verifie(code == 403, f"origine etrangere : refusee ({code})")

    code, _ = appel("/api/nsfw/arm", {"arm": True, "confirm": "ARMER"},
                    entetes={"Host": "attaquant.example"})
    verifie(code == 403, f"Host etranger (DNS rebinding) : refuse ({code})")

    code, _ = appel("/api/plan", {"scenes": [], "intensity": 0},
                    entetes={"Origin": BASE})
    verifie(code == 200, f"origine locale : acceptee ({code})")

    # ============================================================== M3
    print("\n[M3] une requete malformee ressort en JSON, jamais en HTML")
    code, corps = appel("/api/action", {"name": "x.png", "bucket": "OK",
                                        "action": "supprimer_tout"})
    verifie(code == 400 and est_json(corps), f"action inconnue : {code} en JSON")
    code, corps = appel("/api/action", {})
    verifie(code == 400 and est_json(corps), f"corps vide : {code} en JSON")
    code, corps = appel("/api/plan", brut=b"pas du json")
    verifie(code == 400 and est_json(corps), f"corps illisible : {code} en JSON")
    code, corps = appel("/api/plan", {"scenes": [], "count": "beaucoup"})
    verifie(code == 400 and est_json(corps), f"« count » non numerique : {code} en JSON")

    # ============================================================== M9
    print("\n[M9] les bornes du panneau valent aussi cote serveur")
    sid = banque["scenes"][0]["id"]
    code, corps = appel("/api/plan", {"scenes": [sid], "count": 9999,
                                      "intensity": 0, "no_variants": True})
    total = json.loads(corps).get("total")
    verifie(code == 200 and total is not None and total <= 24,
            f"count=9999 plafonne ({total} images planifiees)")

    # ============================================================== J7bis
    print("\n[J7bis] sas d'entree : /api/characters + type/monde dans /api/character")
    code, corps = appel("/api/characters")
    chars = json.loads(corps).get("characters", [])
    ids = {c["id"] for c in chars}
    verifie(code == 200 and {"lena", "abyssiaelle"} <= ids,
            f"/api/characters liste le registre ({sorted(ids)})")
    lena_row = next((c for c in chars if c["id"] == "lena"), {})
    verifie(lena_row.get("type") == "instagram-influenceur"
            and (lena_row.get("world") or {}).get("id") == "slow-life",
            f"lena : type + monde dans la liste ({lena_row.get('type')}, "
            f"{lena_row.get('world')})")
    code, corps = appel("/api/character?character=abyssiaelle")
    d = json.loads(corps)
    verifie(code == 200 and d.get("type") == "rpg-personnage"
            and (d.get("world") or {}).get("label") == "Terres sauvages",
            f"/api/character rend type + monde ({d.get('type')}, {d.get('world')})")

    # base d'identite fournie : une image invalide -> 400 lisible, pas 500
    code, corps = appel("/api/characters/base/upload",
                        {"cid": "wizhttp", "image_base64": "pas une image"})
    verifie(code == 400 and est_json(corps),
            f"upload base illisible : {code} en JSON")
    code, corps = appel("/api/characters/base/upload",
                        {"cid": "lena", "image_base64": "x"})
    verifie(code == 400 and b"existe deja" in corps,
            f"upload base pour un cid deja pris : refuse ({code})")

    # options du wizard : un type reel, ses styles, ses mondes
    code, corps = appel("/api/wizard/options")
    opt = json.loads(corps).get("types", [])
    insta = next((t for t in opt if t["id"] == "instagram-influenceur"), {})
    verifie(code == 200 and "realiste" in insta.get("styles", [])
            and any(w["id"] == "slow-life" for w in insta.get("worlds", [])),
            "/api/wizard/options : type -> styles + mondes de sa famille")

    # POST /api/characters : cree une fiche, refuse un style hors pack
    code, corps = appel("/api/characters",
                        {"cid": "wizhttp", "name": "Wiz HTTP",
                         "type": "rpg-personnage", "style": "realiste",
                         "world": "terres-sauvages", "base_gelee": "WIZHTTP_BASE.png"})
    cree_ok = code == 200 and (OFM / "CHARACTERS" / "wizhttp" / "character.json").is_file()
    verifie(cree_ok, f"/api/characters ecrit la fiche ({code})")
    shutil.rmtree(OFM / "CHARACTERS" / "wizhttp", ignore_errors=True)
    code, corps = appel("/api/characters",
                        {"cid": "wizhttp2", "name": "x", "type": "instagram-influenceur",
                         "style": "manga", "world": "slow-life",
                         "base_gelee": "b.png"})
    verifie(code == 400 and b"absent du pack" in corps,
            f"/api/characters refuse un style hors pack ({code})")
    shutil.rmtree(OFM / "CHARACTERS" / "wizhttp2", ignore_errors=True)

    # ============================================================== F8
    print("\n[F8] arreter alors que rien ne tourne est refuse")
    code, _ = appel("/api/stop", {})
    verifie(code == 409, f"/api/stop sans production : {code}")
    # /api/nsfw/stop a disparu le 26/08/2026 avec l'onglet NSFW parallele : il
    # n'y a plus qu'UN etat d'execution (STATE), donc un seul arret. Le cran
    # NSFW du curseur passe par /api/stop comme le reste.
    code, _ = appel("/api/nsfw/stop", {})
    verifie(code == 404, f"/api/nsfw/stop n'existe plus : {code}")

    # ============================================================== F3
    print("\n[F3] le compteur « Mesurer » couvre tout le dossier")
    code, corps = appel("/api/gallery?bucket=OK&space=sfw&character=lena")
    galerie = json.loads(corps)
    fichier_mesures = OFM / "PROD" / "mesures.json"
    mesures = (json.loads(fichier_mesures.read_text(encoding="utf-8"))
               if fichier_mesures.exists() else {})
    dossier = OFM / "PROD" / "LENA" / "OK"
    attendu = sum(1 for f in dossier.glob("*.png")
                  if "nettete" not in mesures.get(f.name, {}))
    verifie(galerie["sans_mesure"] == attendu,
            f"sans_mesure = {galerie['sans_mesure']} pour tout le dossier "
            f"(attendu {attendu}, {len(galerie['items'])} affichees)")

    # ============================================================== E5
    print("\n[E5] les vignettes ne gelent pas la boucle d'evenements")
    code, corps = appel("/api/gallery?bucket=OK&space=sfw&character=lena")
    noms = [i["name"] for i in json.loads(corps)["items"]]
    if not noms:
        print("  (aucune image dans OK, mesure sautee)")
    else:
        tdir = OFM / "PROD" / ".thumbs" / "lena" / "sfw" / "OK"
        shutil.rmtree(tdir, ignore_errors=True)
        lat = []

        def sonde():
            for _ in range(12):
                t = time.time()
                try:
                    urllib.request.urlopen(BASE + "/api/state", timeout=10).close()
                    lat.append(time.time() - t)
                except Exception:
                    lat.append(99.0)
                time.sleep(0.15)

        th = threading.Thread(target=sonde)
        th.start()
        t0 = time.time()
        for n in noms:
            urllib.request.urlopen(
                f"{BASE}/img?character=lena&bucket=OK&space=sfw&name={n}&thumb=1", timeout=30).close()
        duree = time.time() - t0
        th.join()
        pire = max(lat)
        print(f"        {len(noms)} vignettes en {duree:.1f}s ; "
              f"/api/state pire latence {pire * 1000:.0f} ms")
        verifie(pire < 1.0, f"/api/state reste vif ({pire * 1000:.0f} ms)")

finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
sys.exit(1 if KO else 0)
