# -*- coding: utf-8 -*-
"""Capacite de plateforme : upscale, meme code pour Lena (flux) et Abyssiaelle
(sdxl), zero condition de pack ni de personnage. J8.4, ADR-0017/18/20.

POURQUOI CE TEST EXISTE. La contrainte du chantier ecrit noir sur blanc :
« une capacite de plateforme ne consulte jamais le pack ni le personnage pour
savoir si elle a le droit de s'executer ». Ce n'est pas verifiable en lisant
le code une fois — c'est verifie ICI, structurellement (aucun import de
universe/identity dans upscale.py) et par le COMPORTEMENT (la meme fonction,
sans aucune branche, tourne sur les deux personnages reels du depot, de deux
packs de familles differentes).

DEUX PARTIES. [1]-[3] tournent toujours (registre, taille cible, absence de
couplage pack — tout hors ligne, sans ComfyUI). [4] est le test que l'enonce
exige explicitement : un aller-retour REEL par ComfyUI pour Lena PUIS pour
Abyssiaelle. Sans ComfyUI joignable, [4] le dit clairement et s'arrete la
plutot que de pretendre avoir verifie ce qu'il n'a pas verifie — meme
discipline que `wf_check.py --essai`.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_platform_capabilities.py
"""
import importlib.util
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import platform_capabilities as pc         # noqa: E402
import runner as lb                        # noqa: E402
from runner.upscale import _target_size    # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def attend(exc, fn, texte):
    try:
        fn()
    except exc as e:
        verifie(True, f"{texte} — {type(e).__name__} lisible ({e})")
    except Exception as e:  # noqa: BLE001
        verifie(False, f"{texte} — type inattendu {type(e).__name__} : {e}")
    else:
        verifie(False, f"{texte} — aucune erreur levee")


# --------------------------------------------------- [1] registre de plateforme
print("[1] carte de capacites de plateforme")
verifie(pc.capability("upscale") is not None, "upscale declaree")
verifie(pc.capability_graph("upscale") == "WORKFLOWS/platform/upscale_ui.json",
        "chemin du graphe attendu")
verifie((OFM / pc.capability_graph("upscale")).is_file(),
        "le graphe declare existe sur le disque")
attend(pc.CapabilityUnavailableError, lambda: pc.require_capability("grain"),
       "capacite non construite (grain) — absente, jamais un null")

# ------------------------------------------------------- [2] aucun couplage pack
print("\n[2] UpscaleRunner ne consulte jamais le pack ni le personnage")
source = (AUTOMATION / "runner" / "upscale.py").read_text(encoding="utf-8")
verifie("import universe" not in source and "import identity" not in source,
        "aucun import de universe/identity dans upscale.py (preuve structurelle, "
        "pas une relecture)")

# --------------------------------------------------------- [3] taille cible, hors ligne
print("\n[3] taille cible calculee depuis l'image REELLE, jamais un format fige")
lena_srcs = sorted((OFM / "PROD" / "LENA" / "OK").glob("*.png"))
aby_srcs = sorted((OFM / "PROD" / "ABYSSIAELLE" / "OK").glob("*.png"))
verifie(bool(lena_srcs), "au moins une image reelle de Lena dans PROD/LENA/OK")
verifie(bool(aby_srcs), "au moins une image reelle d'Abyssiaelle dans PROD/ABYSSIAELLE/OK")
if lena_srcs and aby_srcs:
    from PIL import Image
    for srcs, nom in ((lena_srcs, "Lena"), (aby_srcs, "Abyssiaelle")):
        p = srcs[0]
        with Image.open(p) as im:
            w0, h0 = im.size
        tw, th = _target_size(p)
        verifie(tw > w0 and th > h0,
                f"{nom} : {p.name} {w0}x{h0} -> cible {tw}x{th} (plus grande, "
                f"jamais 1440x1800 fige)")
        verifie(tw % 16 == 0 and th % 16 == 0, f"{nom} : cible multiple de 16")

# ------------------------------------- [4] round-trip REEL, les deux personnages
print("\n[4] meme capacite, meme code, Lena (flux) PUIS Abyssiaelle (sdxl)")
try:
    urllib.request.urlopen("http://127.0.0.1:8188/system_stats", timeout=3)
    comfy_up = True
except Exception:
    comfy_up = False

cv2_ok = importlib.util.find_spec("cv2") is not None

if not comfy_up:
    print("  note  ComfyUI injoignable sur http://127.0.0.1:8188 — [4] non verifie ici,")
    print("        pas simule comme si ca l'etait. Relancer ce test ComfyUI demarre pour")
    print("        la preuve complete (meme discipline que wf_check.py --essai).")
elif not cv2_ok:
    print("  note  ComfyUI joignable mais cv2/insightface absents de cet interpreteur")
    print("        (attendu sous .venv — ADR-0008, requirements.txt) — [4] non verifie")
    print("        ici. Relancer avec python_embeded\\python.exe pour la preuve complete.")
else:
    for cid, srcs in (("lena", lena_srcs), ("abyssiaelle", aby_srcs)):
        cfg = lb.load_config(cid)
        checker = lb.make_checker(cfg)
        avant_taille = srcs[0].stat().st_size
        rows, stats = lb.run_upscale_batch([srcs[0]], cfg, checker, character_id=cid)
        verifie(bool(rows), f"{cid} : une ligne de journal produite")
        verifie(stats.get("OK", 0) + stats.get("A_REVOIR", 0) >= 1,
                f"{cid} : image rangee dans un bucket ({stats})")

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
