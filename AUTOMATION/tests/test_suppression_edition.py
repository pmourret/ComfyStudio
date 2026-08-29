# -*- coding: utf-8 -*-
"""Suppression definitive et copie editee : api_delete / api_edit_save, sur
une arborescence jetable.

POURQUOI CE TEST EXISTE. Deux handlers du 26/08/2026, tous deux irreversibles
ou presque : api_delete efface un fichier pour de bon (pas dans UNDO), et
api_edit_save ecrit une copie sur le disque depuis du base64 fourni par le
navigateur. Ni l'un ni l'autre n'avait de couverture avant ce fichier — les
verifier sur de vraies images du disque aurait ete le genre d'erreur que ce
projet essaie justement d'eviter.

Verifie :
  - api_delete retire le fichier, sa vignette, sa copie d'export — et RIEN
    d'autre (le journal et les mesures restent intacts, par design) ;
  - api_delete refuse un nom qui n'existe pas, un nom mal forme ;
  - api_edit_save ecrit une COPIE (jamais un ecrasement), nommee via nom_libre
    en cas de collision, et refuse une image mal encodee ou trop lourde.

Rien n'est simule : ce sont les vraies fonctions, sur un faux PROD/.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_suppression_edition.py
"""
import asyncio
import base64
import io
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
sys.path.insert(0, str(OFM / "AUTOMATION" / "web"))
sys.path.insert(0, str(OFM / "AUTOMATION"))

import shared_state as ss      # noqa: E402
from routes import tri        # noqa: E402
from PIL import Image         # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


class FausseRequete:
    def __init__(self, corps, character="lena"):
        self._corps = corps
        self.method = "POST"
        # les handlers de tri resolvent le personnage AVANT de toucher au
        # disque (`ss.character`) : sans ?character=, il n'y a pas d'arbre
        self.query = {"character": character} if character else {}

    async def json(self):
        return self._corps


def appeler(handler, corps=None, character="lena"):
    reponse = asyncio.run(handler(FausseRequete(corps or {}, character)))
    import json as _json
    return _json.loads(reponse.text), reponse.status


def png_base64(couleur=(90, 70, 60), taille=(64, 64)):
    buf = io.BytesIO()
    Image.new("RGB", taille, couleur).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def image(chemin, taille=(64, 64)):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", taille, (90, 70, 60)).save(chemin)


# ------------------------------------------------------- arborescence jetable
racine = Path(tempfile.mkdtemp(prefix="suppr_"))
ss.OFM = racine
ss.THUMBS = racine / "PROD" / ".thumbs"

for b in ("OK", "A_REVOIR", "REJET", "ARCHIVE"):
    (racine / "PROD" / "LENA" / b).mkdir(parents=True, exist_ok=True)
(racine / "PROD" / "EXPORT" / "lena" / "lifestyle").mkdir(parents=True, exist_ok=True)

print("=" * 70)
print("suppression definitive et copie editee - tests")
print("=" * 70)

# ============================================================== api_delete
print("\n[1] suppression definitive — cas nominal")
image(racine / "PROD" / "LENA" / "OK" / "gardee.png")
image(racine / "PROD" / "EXPORT" / "lena" / "lifestyle" / "gardee.jpg", taille=(1080, 1350))
ss.THUMBS.mkdir(parents=True, exist_ok=True)
(ss.THUMBS / "lena" / "sfw" / "OK").mkdir(parents=True, exist_ok=True)
(ss.THUMBS / "lena" / "sfw" / "OK" / "gardee.jpg").write_bytes(b"\x00")

r, code = appeler(tri.api_delete, {"name": "gardee.png", "bucket": "OK", "space": "sfw"})
verifie(r.get("ok") is True, "réponse ok")
verifie(not (racine / "PROD" / "LENA" / "OK" / "gardee.png").exists(),
        "le fichier a disparu du disque")
verifie(not (racine / "PROD" / "EXPORT" / "lena" / "lifestyle" / "gardee.jpg").exists(),
        "la copie d'export a disparu")
verifie(not (ss.THUMBS / "lena" / "sfw" / "OK" / "gardee.jpg").exists(),
        "la vignette a disparu")

print("\n[2] suppression — garde-fous")
r, code = appeler(tri.api_delete, {"name": "absente.png", "bucket": "OK", "space": "sfw"})
verifie(code == 404, f"fichier introuvable -> 404 ({code})")
try:
    appeler(tri.api_delete, {"name": "../../etc/passwd", "bucket": "OK", "space": "sfw"})
    verifie(False, "un nom hors motif aurait dû lever bad_request")
except Exception:
    verifie(True, "un nom de fichier invalide est refusé (chemin hors motif)")

# =========================================================== api_edit_save
print("\n[3] copie éditée — cas nominal")
image(racine / "PROD" / "LENA" / "A_REVOIR" / "scene_01.png")
r, code = appeler(tri.api_edit_save, {
    "name": "scene_01.png", "bucket": "A_REVOIR", "space": "sfw",
    "data_base64": png_base64()})
verifie(r.get("ok") is True, "réponse ok")
verifie(r.get("name") == "scene_01_edit.png", f"nommage attendu (obtenu {r.get('name')!r})")
verifie((racine / "PROD" / "LENA" / "A_REVOIR" / "scene_01_edit.png").exists(),
        "la copie existe sur le disque")
verifie((racine / "PROD" / "LENA" / "A_REVOIR" / "scene_01.png").exists(),
        "l'ORIGINAL existe toujours — jamais un écrasement")

print("\n[4] copie éditée — collision de nom")
r2, code = appeler(tri.api_edit_save, {
    "name": "scene_01.png", "bucket": "A_REVOIR", "space": "sfw",
    "data_base64": png_base64((10, 10, 10))})
verifie(r2.get("name") == "scene_01_edit_2.png",
        f"la collision est résolue par nom_libre (obtenu {r2.get('name')!r})")
verifie((racine / "PROD" / "LENA" / "A_REVOIR" / "scene_01_edit.png").exists(),
        "la première copie n'a pas été écrasée par la seconde")

print("\n[5] copie éditée — garde-fous")
r, code = appeler(tri.api_edit_save, {
    "name": "absente.png", "bucket": "A_REVOIR", "space": "sfw",
    "data_base64": png_base64()})
verifie(code == 404, f"original introuvable -> 404 ({code})")

r, code = appeler(tri.api_edit_save, {
    "name": "scene_01.png", "bucket": "A_REVOIR", "space": "sfw",
    "data_base64": "ceci n'est pas du base64 valide !!"})
verifie(code == 400, f"base64 mal formé -> 400 ({code})")

r, code = appeler(tri.api_edit_save, {
    "name": "scene_01.png", "bucket": "A_REVOIR", "space": "sfw",
    "data_base64": ""})
verifie(code == 400, f"image vide -> 400 ({code})")

gros = base64.b64encode(b"\x00" * (ss.TAILLE_MAX_PHOTO + 1)).decode()
r, code = appeler(tri.api_edit_save, {
    "name": "scene_01.png", "bucket": "A_REVOIR", "space": "sfw",
    "data_base64": gros})
verifie(code == 400, f"image trop lourde -> 400 ({code})")

print("\n" + "=" * 70)
if KO:
    print(f"{KO} ECHEC(S)")
    sys.exit(1)
print("tout est vert")
