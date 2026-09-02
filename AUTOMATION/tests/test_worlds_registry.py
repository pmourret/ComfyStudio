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
import json
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
            and isinstance(worlds.places(wid), list),
            f"{wid} : accesseurs label / suggested_styles / places sains")

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

# ----------------------------------- [9] le catalogue n'habille pas ses lieux
print("\n[9] un catalogue de monde n'habille pas ses lieux (ADR-0014)")
# La tenue, la pose, le format et le compte sont des reglages de PERSONNAGE. Un
# monde qui les livrerait habillerait de la meme facon tous les personnages qui
# y naissent, et rendrait fausse la premiere mesure de verrou qui suit. Le
# catalogue decrit un CADRE, pas une garde-robe.
for wid in REELS:
    intrus = sorted({k for s in worlds.load_world(wid).get("places", [])
                     if isinstance(s, dict)
                     for k in worlds.CHARACTER_ONLY_SCENE_KEYS if k in s})
    verifie(not intrus, f"{wid} : lieux sans reglage de personnage"
                        + (f" — trouve : {', '.join(intrus)}" if intrus else ""))
    verifie(worlds.places(wid) is not None,
            f"{wid} : places() charge sans lever")

_vrai = worlds.WORLDS_DIR
_tmp = Path(tempfile.mkdtemp(prefix="worlds_dressing_"))
try:
    worlds.WORLDS_DIR = _tmp
    (_tmp / "habille.json").write_text(
        json.dumps({"id": "habille", "label": "Habille",
                    "compatible_families": ["flux"],
                    "places": [{"id": "s1", "prompt": "x",
                                        "wardrobe": {"0": "a red dress"}}]}),
        encoding="utf-8")
    attend(ValueError, lambda: worlds.places("habille"),
           "un monde qui habille un de ses lieux : refuse au chargement")
finally:
    worlds.WORLDS_DIR = _vrai
    shutil.rmtree(_tmp, ignore_errors=True)

# --------------------------------- [10] place() / save_places() / merge_scene()
print("\n[10] catalogue vivant : place(), save_places(), merge_scene() (ADR-0015)")
for wid in REELS:
    first = worlds.places(wid)[0]
    p = worlds.place(wid, first["id"])
    verifie(p == first, f"{wid} : place({first['id']!r}) rend l'entree du catalogue")
attend(worlds.UnknownPlaceError, lambda: worlds.place("slow-life", "does-not-exist"),
       "place() sur un id absent")
attend(worlds.UnknownWorldError, lambda: worlds.place("does-not-exist", "x"),
       "place() sur un monde absent")

_vrai = worlds.WORLDS_DIR
_tmp = Path(tempfile.mkdtemp(prefix="worlds_live_"))
try:
    worlds.WORLDS_DIR = _tmp
    (_tmp / "vivant.json").write_text(json.dumps({
        "id": "vivant", "label": "Vivant", "compatible_families": ["flux"],
        "assets": {"lora": None, "lora_strength": None, "prompt_add": ""},
        "places": [{"id": "p1", "label": "Lieu 1", "intention": "lifestyle",
                    "prompt": "a quiet room, morning light"}],
    }), encoding="utf-8")

    merged = worlds.merge_scene("vivant", "p1", {"wardrobe": {"0": "jeans"},
                                                  "intensity": 0})
    verifie(merged["prompt"] == "a quiet room, morning light"
            and merged["intention"] == "lifestyle" and merged["world_ref"] == "p1"
            and merged["origin"] == "world" and merged["world"] == "vivant"
            and merged["wardrobe"] == {"0": "jeans"} and merged["intensity"] == 0,
            f"merge_scene : cadre du lieu + overlay du personnage ({merged})")
    attend(worlds.UnknownPlaceError, lambda: worlds.merge_scene("vivant", "gone", {}),
           "merge_scene sur un lieu absent")

    # save_places : reecrit UNIQUEMENT `places`, le reste du fichier survit
    worlds.save_places("vivant", [{"id": "p1", "label": "Lieu 1 renomme",
                                   "intention": "lifestyle",
                                   "prompt": "a quiet room, evening light"}])
    apres = worlds.load_world("vivant")
    verifie(apres["places"][0]["prompt"] == "a quiet room, evening light",
            "save_places : le catalogue relu porte le nouveau texte")
    verifie(apres["label"] == "Vivant" and apres["compatible_families"] == ["flux"],
            "save_places : le reste du fichier (label, compatible_families) intact")

    remerged = worlds.merge_scene("vivant", "p1", {"wardrobe": {"0": "jeans"}})
    verifie(remerged["prompt"] == "a quiet room, evening light",
            "merge_scene relit le catalogue APRES l'edition — heritage live")
finally:
    worlds.WORLDS_DIR = _vrai
    shutil.rmtree(_tmp, ignore_errors=True)

# --------------------------------------------- [11] create_world() (ADR-0016)
print("\n[11] create_world() : catalogue vide, pack curate, jamais un aiguillage")
attend(ValueError, lambda: worlds.create_world("Bad Id", "x", "instagram-influenceur"),
       "id invalide refuse")
attend(ValueError, lambda: worlds.create_world("probe-bad-pack", "x", "does-not-exist"),
       "pack inconnu refuse")
attend(FileExistsError, lambda: worlds.create_world("slow-life", "x", "instagram-influenceur"),
       "id deja pris refuse")

_vrai = worlds.WORLDS_DIR
_tmp = Path(tempfile.mkdtemp(prefix="worlds_create_"))
try:
    worlds.WORLDS_DIR = _tmp
    wid = worlds.create_world("probe-monde", "  Probe Monde  ", "rpg-personnage",
                              "  quiet test tone  ")
    verifie(wid == "probe-monde", "create_world rend l'id")
    data = worlds.load_world("probe-monde")
    verifie(data["label"] == "Probe Monde", "label nettoye des espaces")
    verifie(data["tone"] == "quiet test tone", "tone nettoye des espaces")
    verifie(data["places"] == [], "catalogue de lieux VIDE a la naissance")
    verifie(data["compatible_families"] == [universe.model_family("rpg-personnage")],
            f"compatible_families DERIVE du pack, pas tape ({data['compatible_families']})")
    verifie(data["suggested_styles"] == universe.style_names("rpg-personnage"),
            f"suggested_styles DERIVE du pack, pas tape ({data['suggested_styles']})")
    verifie(data["ui_skin_token"] == "world-probe-monde",
            "ui_skin_token derive de l'id, meme convention que les mondes reels")

    # label vide -> replie sur l'id, comme create_character (name or cid)
    worlds.create_world("probe-sans-nom", "", "instagram-influenceur")
    verifie(worlds.load_world("probe-sans-nom")["label"] == "probe-sans-nom",
            "label vide replie sur l'id")
finally:
    worlds.WORLDS_DIR = _vrai
    shutil.rmtree(_tmp, ignore_errors=True)

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
