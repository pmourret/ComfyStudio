# -*- coding: utf-8 -*-
"""Registre des univers (AUTOMATION/universe.py, J4).

POURQUOI CE TEST EXISTE. J4 introduit l'axe « univers » (CLAUDE.md §3-§5). Le
registre doit (1) charger les deux univers reels, (2) prouver qu'ils ne sont pas
une copie l'un de l'autre — familles de modele distinctes, sinon rien n'aurait
ete generalise —, (3) rendre une erreur PROPRE sur un id inconnu, jamais un
chemin nu ni un FileNotFoundError brut qui remonterait en 500 cote web.

Le chemin heureux tourne contre le vrai UNIVERS/ (versionne, toujours present).
Les cas limites tournent contre un UNIVERS/ jetable (monkeypatch UNIVERS_DIR).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_universe_registry.py
"""
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import universe  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def attend_erreur(fn, texte):
    try:
        fn()
    except universe.UnknownUniverseError as e:
        verifie("univers inconnu" in str(e).lower(),
                f"{texte} — UnknownUniverseError lisible ({e})")
    except Exception as e:  # noqa: BLE001
        verifie(False, f"{texte} — type inattendu {type(e).__name__} : {e}")
    else:
        verifie(False, f"{texte} — aucune erreur levee")


# --------------------------------------------------------------- [1] vrai registre
print("[1] les deux univers reels se chargent")
ids = universe.list_universes()
verifie(set(ids) >= {"instagram-influenceur", "rpg-personnage"},
        f"list_universes() contient les deux univers ({ids})")

insta = universe.load_universe("instagram-influenceur")
rpg = universe.load_universe("rpg-personnage")
verifie(insta["model_family"] == "flux" and insta["identity"] == "pulid_flux",
        "instagram-influenceur : flux + pulid_flux")
verifie(rpg["model_family"] == "sdxl",
        f"rpg-personnage : sdxl (obtenu {rpg['model_family']})")

# --------------------------------------------------------- [2] pas une copie de Lena
print("\n[2] rpg-personnage n'est pas une copie de l'univers de Lena")
verifie(insta["model_family"] != rpg["model_family"],
        "familles de modele distinctes — la generalisation a bien eu lieu")
verifie(insta["identity"] != rpg["identity"],
        "mecanismes d'identite distincts")

# ------------------------------------------------------------------- [3] tools.json
print("\n[3] tools.json parse et declare des outils")
for uid in ("instagram-influenceur", "rpg-personnage"):
    outils = universe.load_tools(uid)
    verifie(isinstance(outils, list)
            and all("id" in o and "scope" in o for o in outils),
            f"{uid} : tools.json est une liste d'outils bien formes ({len(outils)})")
    verifie(any(o["id"] == "image-editor" and o["scope"] == "global" for o in outils),
            f"{uid} : l'editeur d'image y est declare en scope global")

# ----------------------------------------------------------------- [4] id inconnu
print("\n[4] un id inconnu sort en erreur propre, pas en 500")
attend_erreur(lambda: universe.load_universe("does-not-exist"), "load_universe inconnu")
attend_erreur(lambda: universe.load_tools("does-not-exist"), "load_tools inconnu")
verifie(universe.exists("instagram-influenceur") is True, "exists() vrai sur un univers reel")
verifie(universe.exists("does-not-exist") is False, "exists() faux sur un inconnu")
verifie(universe.exists("") is False and universe.exists(None) is False,
        "exists() faux sur '' et None (jamais un chemin construit avec du vide)")

# --------------------------------------------------------- [5] registre jetable
print("\n[5] cas limites sur un UNIVERS/ jetable")
_vrai = universe.UNIVERS_DIR
_tmp = Path(tempfile.mkdtemp(prefix="univers_test_"))
try:
    universe.UNIVERS_DIR = _tmp
    verifie(universe.list_universes() == [], "UNIVERS/ vide -> list_universes() == []")

    (_tmp / "cassé").mkdir()
    (_tmp / "cassé" / "universe.json").write_text("{ pas du json", encoding="utf-8")
    try:
        universe.load_universe("cassé")
    except ValueError as e:
        verifie("JSON invalide" in str(e), f"JSON casse -> ValueError lisible ({e})")
    except Exception as e:  # noqa: BLE001
        verifie(False, f"JSON casse -> type inattendu {type(e).__name__}")
    else:
        verifie(False, "JSON casse -> aucune erreur")

    (_tmp / "sans-outils").mkdir()
    (_tmp / "sans-outils" / "universe.json").write_text('{"id": "sans-outils"}',
                                                        encoding="utf-8")
    verifie(universe.load_tools("sans-outils") == [],
            "univers sans tools.json -> load_tools() == [] (fichier optionnel)")
finally:
    universe.UNIVERS_DIR = _vrai
    shutil.rmtree(_tmp, ignore_errors=True)

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
