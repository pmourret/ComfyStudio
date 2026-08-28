# -*- coding: utf-8 -*-
"""Registre des mondes (AUTOMATION/worlds.py, ADR-0012, J7bis).

POURQUOI CE TEST EXISTE. J7bis introduit l'axe « monde » (CLAUDE.md §3). Le
registre doit (1) charger les deux mondes reels, (2) prouver qu'ils ne sont pas
une copie l'un de l'autre — familles compatibles distinctes —, (3) rendre une
erreur PROPRE sur un id inconnu, jamais un chemin nu ni un FileNotFoundError
brut, (4) garder les mondes ETANCHES par famille : le filtre du wizard ne doit
jamais proposer un monde flux a un personnage sdxl (le risque §11 exact).

Le chemin heureux tourne contre le vrai WORLDS/ (versionne, toujours present).
Les cas limites tournent contre un WORLDS/ jetable (monkeypatch WORLDS_DIR).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_worlds_registry.py
"""
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import universe  # noqa: E402
import worlds    # noqa: E402

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


REELS = ("slow-life", "terres-sauvages")

# --------------------------------------------------------------- [1] vrai registre
print("[1] les deux mondes reels se chargent et ont leurs cles de structure")
ids = worlds.list_worlds()
verifie(set(ids) >= set(REELS), f"list_worlds() contient les deux mondes ({ids})")
for wid in REELS:
    w = worlds.load_world(wid)
    verifie(w.get("id") == wid and bool(w.get("label"))
            and isinstance(w.get("compatible_families"), list) and w["compatible_families"],
            f"{wid} : id + label + compatible_families non vide")
    verifie(worlds.label(wid) and isinstance(worlds.suggested_styles(wid), list)
            and isinstance(worlds.starter_scenes(wid), list),
            f"{wid} : accesseurs label / suggested_styles / starter_scenes sains")

# ----------------------------------------------- [2] pas une copie l'un de l'autre
print("\n[2] les deux mondes ne sont pas une copie l'un de l'autre")
verifie(set(worlds.compatible_families("slow-life"))
        != set(worlds.compatible_families("terres-sauvages")),
        "familles compatibles distinctes (flux vs sdxl)")

# ------------------------------------------- [3] etancheite par famille (risque §11)
print("\n[3] worlds_for_family : un monde ne fuit pas dans une autre famille")
verifie(worlds.worlds_for_family("flux") == ["slow-life"],
        f"flux -> ['slow-life'] (obtenu {worlds.worlds_for_family('flux')})")
verifie(worlds.worlds_for_family("sdxl") == ["terres-sauvages"],
        f"sdxl -> ['terres-sauvages'] (obtenu {worlds.worlds_for_family('sdxl')})")
verifie("terres-sauvages" not in worlds.worlds_for_family("flux")
        and "slow-life" not in worlds.worlds_for_family("sdxl"),
        "aucun croisement flux <-> sdxl")

# ------------------------------------------------ [4] compatibilite = garde-fou
print("\n[4] is_compatible / assert_compatible")
verifie(worlds.is_compatible("slow-life", "flux") is True,
        "slow-life compatible flux")
verifie(worlds.is_compatible("slow-life", "sdxl") is False,
        "slow-life PAS compatible sdxl")
worlds.assert_compatible("slow-life", "flux")   # ne doit pas lever
verifie(True, "assert_compatible('slow-life', 'flux') passe sans lever")
attend(worlds.IncompatibleWorldError,
       lambda: worlds.assert_compatible("terres-sauvages", "flux"),
       "assert_compatible('terres-sauvages', 'flux')")

# --------------------------------------------------------------- [5] id inconnu
print("\n[5] un id inconnu sort en erreur propre, pas en 500")
attend(worlds.UnknownWorldError, lambda: worlds.load_world("does-not-exist"),
       "load_world inconnu")
attend(worlds.UnknownWorldError, lambda: worlds.compatible_families("does-not-exist"),
       "compatible_families inconnu")
attend(worlds.UnknownWorldError, lambda: worlds.is_compatible("does-not-exist", "flux"),
       "is_compatible inconnu")
verifie(worlds.exists("slow-life") is True, "exists() vrai sur un monde reel")
verifie(worlds.exists("does-not-exist") is False, "exists() faux sur un inconnu")
verifie(worlds.exists("") is False and worlds.exists(None) is False,
        "exists() faux sur '' et None (jamais un chemin construit avec du vide)")

# --------------------------------------------------- [6] assets() normalise
print("\n[6] assets() rend toujours {lora, lora_strength, prompt_add}")
for wid in REELS:
    a = worlds.assets(wid)
    verifie(set(a) == {"lora", "lora_strength", "prompt_add"},
            f"{wid} : assets() a exactement les trois cles ({sorted(a)})")

# ------------------------- [7] compatible_families croise les familles reelles
print("\n[7] toute famille declaree par un monde est une model_family reelle")
reelles = {universe.model_family(u) for u in universe.list_universes()}
for wid in REELS:
    inconnues = [f for f in worlds.compatible_families(wid) if f not in reelles]
    verifie(not inconnues,
            f"{wid} : compatible_families incluses dans {sorted(reelles)} "
            f"(hors : {inconnues})")

# --------------------------------------------------- [8] registre jetable
print("\n[8] cas limites sur un WORLDS/ jetable")
_vrai = worlds.WORLDS_DIR
_tmp = Path(tempfile.mkdtemp(prefix="worlds_test_"))
try:
    worlds.WORLDS_DIR = _tmp
    verifie(worlds.list_worlds() == [], "WORLDS/ vide -> list_worlds() == []")
    verifie(worlds.worlds_for_family("flux") == [], "WORLDS/ vide -> worlds_for_family() == []")

    (_tmp / "casse.json").write_text("{ pas du json", encoding="utf-8")
    attend(ValueError, lambda: worlds.load_world("casse"), "JSON casse")

    attend(worlds.UnknownWorldError, lambda: worlds.load_world("absent"),
           "monde absent du registre jetable")
finally:
    worlds.WORLDS_DIR = _vrai
    shutil.rmtree(_tmp, ignore_errors=True)

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
