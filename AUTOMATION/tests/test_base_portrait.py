# -*- coding: utf-8 -*-
"""base_portrait.save_uploaded() : deposer la base d'identite FOURNIE dans
ComfyUI/input/ (AUTOMATION/base_portrait.py, ADR-0012, J7bis 5b-i).

POURQUOI CE TEST EXISTE. Le wizard accepte une image de l'utilisateur et
l'ecrit la ou le verrou la lira. A verrouiller : (1) une vraie image PNG/JPEG/
WEBP atterrit sous un nom stable et deductible du cid ; (2) tout le reste
(base64 illisible, octets qui ne sont pas une image, format non gere, cid
invalide, trop lourd) sort en BaseImageError, jamais un fichier ecrit ni une
exception brute.

Le dossier input reel de ComfyUI n'est jamais touche : COMFY_INPUT est
monkeypatche vers un dossier jetable.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_base_portrait.py
"""
import base64
import io
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import base_portrait  # noqa: E402
from PIL import Image  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte.encode('ascii', 'replace').decode()}")
    if not ok:
        KO += 1


def attend(fn, texte):
    try:
        fn()
    except base_portrait.BaseImageError as e:
        verifie(True, f"{texte} -- BaseImageError ({e})")
    except Exception as e:  # noqa: BLE001
        verifie(False, f"{texte} -- type inattendu {type(e).__name__} : {e}")
    else:
        verifie(False, f"{texte} -- aucune erreur levee")


def img_b64(fmt, size=(64, 64), data_url=False):
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 90, 60)).save(buf, fmt)
    b = base64.b64encode(buf.getvalue()).decode()
    if data_url:
        mime = {"PNG": "png", "JPEG": "jpeg", "WEBP": "webp"}[fmt]
        return f"data:image/{mime};base64,{b}"
    return b


_vrai = base_portrait.COMFY_INPUT
TMP = Path(tempfile.mkdtemp(prefix="base_portrait_test_"))
base_portrait.COMFY_INPUT = TMP
try:
    # ------------------------------------------------------- [1] vraies images
    print("[1] une vraie image atterrit sous un nom stable")
    n = base_portrait.save_uploaded("wiztest", img_b64("PNG"))
    verifie(n == "WIZTEST_BASE.png", f"PNG -> {n}")
    verifie((TMP / n).is_file() and (TMP / n).stat().st_size > 0,
            "fichier ecrit dans le dossier input")
    verifie(base_portrait.save_uploaded("wiztest", img_b64("JPEG")) == "WIZTEST_BASE.jpg",
            "JPEG -> .jpg")
    verifie(base_portrait.save_uploaded("wiz-2", img_b64("WEBP")) == "WIZ-2_BASE.webp",
            "WEBP -> .webp, cid a tiret conserve")
    verifie(base_portrait.save_uploaded("wiztest", img_b64("PNG", data_url=True))
            == "WIZTEST_BASE.png",
            "prefixe data URL accepte et retire")
    verifie(base_portrait.save_uploaded("wiztest", img_b64("PNG", size=(8, 8)))
            == "WIZTEST_BASE.png",
            "re-upload du meme cid : ecrase sans broncher")

    # ------------------------------------------------------- [2] refus propres
    print("\n[2] tout le reste sort en BaseImageError, rien n'est ecrit")
    avant = set(p.name for p in TMP.iterdir())
    attend(lambda: base_portrait.save_uploaded("wiztest", "pas du base64 !!"),
           "base64 illisible")
    attend(lambda: base_portrait.save_uploaded("wiztest",
                                               base64.b64encode(b"hello").decode()),
           "octets qui ne sont pas une image")
    attend(lambda: base_portrait.save_uploaded("wiztest", ""),
           "chaine vide")
    attend(lambda: base_portrait.save_uploaded("Wiztest", img_b64("PNG")),
           "cid non-slug (majuscule)")
    attend(lambda: base_portrait.save_uploaded("../x", img_b64("PNG")),
           "cid avec ../")
    attend(lambda: base_portrait.save_uploaded("wiztest", img_b64("BMP")),
           "format non gere (BMP)")
    base_portrait.MAX_BYTES = 200
    attend(lambda: base_portrait.save_uploaded("wiztest", img_b64("PNG", size=(256, 256))),
           "image trop lourde")
    base_portrait.MAX_BYTES = 20 * 1024 * 1024
    verifie(set(p.name for p in TMP.iterdir()) == avant,
            "aucun fichier nouveau apres la salve de refus")
finally:
    base_portrait.COMFY_INPUT = _vrai
    shutil.rmtree(TMP, ignore_errors=True)

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
