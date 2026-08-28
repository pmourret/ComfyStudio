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


_vrai_in = base_portrait.COMFY_INPUT
_vrai_out = base_portrait.COMFY_OUTPUT
TMP = Path(tempfile.mkdtemp(prefix="base_portrait_test_"))
TMP_OUT = Path(tempfile.mkdtemp(prefix="base_portrait_out_"))
base_portrait.COMFY_INPUT = TMP
base_portrait.COMFY_OUTPUT = TMP_OUT
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

    # ---------------------------------------- [3] base GENEREE : garde-fous
    print("\n[3] generate() : les memes garde-fous que create_character")
    ok3 = base_portrait._check_choices("wiznew", "rpg-personnage", "realiste",
                                       "terres-sauvages")
    verifie(ok3 == "rpg-personnage", "(type, style) valides -> pack resolu")
    attend(lambda: base_portrait._check_choices("Wiz", "rpg-personnage",
                                                "realiste", "terres-sauvages"),
           "cid non-slug")
    attend(lambda: base_portrait._check_choices("wiznew", "does-not-exist",
                                                "realiste", "terres-sauvages"),
           "type sans pack")
    attend(lambda: base_portrait._check_choices("wiznew", "instagram-influenceur",
                                                "manga", "slow-life"),
           "style absent du pack")
    attend(lambda: base_portrait._check_choices("wiznew", "rpg-personnage",
                                                "realiste", "slow-life"),
           "monde d'une autre famille")
    attend(lambda: base_portrait._check_choices("lena", "instagram-influenceur",
                                                "realiste", "slow-life"),
           "cid deja pris")
    p = base_portrait._base_prompt("rpg-personnage", "fantastique", "terres-sauvages")
    verifie(p.startswith(base_portrait.BASE_PROMPT)
            and "painterly fantasy" in p,
            "prompt de base = portrait neutre + prompt_add du style")

    # ------------------------------- [4] freeze / apercu : chemin borne a output/
    print("\n[4] freeze() et l'apercu ne sortent jamais de output/")
    cand_dir = TMP_OUT / "OFM" / "PROD" / "_BASE" / "wiznew"
    cand_dir.mkdir(parents=True)
    Image.new("RGB", (32, 32), (10, 20, 30)).save(cand_dir / "777_00001_.png")
    rel = "OFM/PROD/_BASE/wiznew/777_00001_.png"
    verifie(len(base_portrait.candidate_bytes(rel)) > 0, "apercu lit le candidat")
    fname = base_portrait.freeze("wiznew", rel)
    verifie(fname == "WIZNEW_BASE.png" and (TMP / fname).is_file(),
            f"freeze copie output/ -> input/ ({fname})")
    for mauvais in ("../../secret.png", "/etc/passwd",
                    "OFM/PROD/_BASE/wiznew/../../../../x.png"):
        attend(lambda m=mauvais: base_portrait.freeze("wiznew", m),
               f"freeze refuse {mauvais!r}")
    attend(lambda: base_portrait.candidate_bytes("../../secret.png"),
           "apercu refuse un chemin hors output/")
finally:
    base_portrait.COMFY_INPUT = _vrai_in
    base_portrait.COMFY_OUTPUT = _vrai_out
    shutil.rmtree(TMP, ignore_errors=True)
    shutil.rmtree(TMP_OUT, ignore_errors=True)

# ----------------------------- [5] base_portrait=True : verrou hors du graphe
# ComfyUI requis (fetch_object_info pour convertir) : degrade en IGNORE, comme
# test_identity_pulid_flux / test_model_family_sdxl.
print("\n[5] WorkflowRunner(base_portrait=True) : le groupe d'identite sort du graphe")
import urllib.request  # noqa: E402
import universe as _u   # noqa: E402
try:
    urllib.request.urlopen("http://127.0.0.1:8188/object_info/CLIPTextEncode",
                           timeout=3).close()
except Exception:  # noqa: BLE001
    print("  IGNORE -- ComfyUI injoignable (object_info requis pour convertir le graphe)")
else:
    from runner.comfy import WorkflowRunner  # noqa: E402
    for pack, style, banni in (("instagram-influenceur", "realiste",
                                ("Pulid", "PuLID")),
                               ("rpg-personnage", "realiste", ("IPAdapter",))):
        cfg = base_portrait._synthetic_cfg(pack)
        r = WorkflowRunner(cfg, character_id="wiznew", universe_id=pack,
                           style_name=style, base_portrait=True)
        appele = []
        r.identity.apply = lambda *a, **k: appele.append(1)  # doit rester vide
        api = r.api_for({"prompt": "portrait", "format": next(iter(cfg["formats"])),
                         "seed": 1, "scene": "base", "overrides": {}, "pose": None},
                        batch_id="_BASE")
        classes = {n["class_type"] for n in api.values()}
        restants = [c for c in classes if any(b in c for b in banni)]
        verifie(not restants, f"{pack} : aucun noeud de verrou dans le graphe converti "
                f"(restants : {restants})")
        verifie(not appele, f"{pack} : identity.apply() n'est PAS appele")
        save = next((n for n in api.values() if n["class_type"] == "SaveImage"), None)
        verifie(save and save["inputs"]["filename_prefix"].startswith("OFM/PROD/_BASE/"),
                f"{pack} : SaveImage range sous PROD/_BASE/")

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
