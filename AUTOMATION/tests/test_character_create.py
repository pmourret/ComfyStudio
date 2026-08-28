# -*- coding: utf-8 -*-
"""create_character() : le wizard « nouveau personnage » ecrit une fiche
lancable, aux defauts du pack (AUTOMATION/runner/prompt.py, ADR-0012, J7bis 5a).

POURQUOI CE TEST EXISTE. Le wizard fabrique un CHARACTERS/<id>/ complet sans
qu'un humain n'ecrive de JSON. A verrouiller : (1) la fiche est coherente — le
pack est bien resolu de (type, style), le graphe est celui DU PACK (jamais un
fichier par personnage, §8.11), identity/qc sont marques `measured: false` ;
(2) tout choix invalide (cid pris, style hors pack, monde d'une autre famille,
base absente) est REFUSE avant la moindre ecriture ; (3) deux personnages du
meme pack mais de mondes differents ne se contaminent pas (risque §11).

Personnages jetables sous CHARACTERS/ (git-ignore), supprimes a la fin.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_character_create.py
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb   # noqa: E402
import universe       # noqa: E402
import worlds         # noqa: E402

KO = 0
CREES = []            # cids a nettoyer


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte.encode('ascii', 'replace').decode()}")
    if not ok:
        KO += 1


def attend(exc, fn, texte):
    try:
        fn()
    except exc as e:
        verifie(True, f"{texte} -- {type(e).__name__} ({e})")
    except Exception as e:  # noqa: BLE001
        verifie(False, f"{texte} -- type inattendu {type(e).__name__} : {e}")
    else:
        verifie(False, f"{texte} -- aucune erreur levee")


def cree(cid, *a):
    CREES.append(cid)
    return lb.create_character(cid, *a)


try:
    # --------------------------------------------------------- [1] chemin heureux
    print("[1] une fiche rpg-personnage complete et coherente")
    cree("wiztest_rpg", "Wiz RPG", "rpg-personnage", "realiste",
         "terres-sauvages", "WIZ_BASE.png")
    d = OFM / "CHARACTERS" / "wiztest_rpg"
    for f in ("character.json", "config.json", "scenes.json", "creative.json"):
        verifie((d / f).is_file(), f"{f} ecrit")
    for sub in ("INPUTS/CHARACTER", "PROD/OK", "EXPORT"):
        verifie((d / sub).is_dir(), f"{sub}/ cree")

    ch = json.loads((d / "character.json").read_text(encoding="utf-8"))
    verifie(ch["universe"] == universe.resolve("rpg-personnage", "realiste")
            == "rpg-personnage", "universe = pack resolu de (type, style)")
    verifie(ch["type"] == "rpg-personnage" and ch["world"] == "terres-sauvages"
            and ch["output_style"] == "realiste", "type / world / style figes")
    verifie(ch["content_types"] == {"image": True, "video": False, "voice": False,
                                    "staging": False}, "content_types : image seul")
    verifie(ch["nsfw"] is False, "nsfw off par defaut")

    cf = json.loads((d / "config.json").read_text(encoding="utf-8"))
    verifie(cf["workflow"] == universe.workflow("rpg-personnage"),
            f"workflow = graphe DU PACK ({cf['workflow']})")
    verifie(cf["base_gelee"] == "WIZ_BASE.png", "base_gelee repris tel quel")
    verifie(cf["identity"].get("measured") is False
            and cf["qc"].get("measured") is False,
            "identity et qc marques `measured: false` (defauts du pack)")
    verifie(bool(cf["preset"]) and bool(cf["formats"]),
            "preset / formats repris du gabarit du pack")

    sc = json.loads((d / "scenes.json").read_text(encoding="utf-8"))
    attendu = [s["id"] for s in worlds.starter_scenes("terres-sauvages")]
    verifie([s["id"] for s in sc["scenes"]] == attendu,
            f"scenes amorcees depuis le monde ({attendu})")
    verifie(all({"id", "prompt", "format", "intensity"} <= set(s) for s in sc["scenes"]),
            "chaque scene amorcee a la forme attendue par build_jobs")

    cr = json.loads((d / "creative.json").read_text(encoding="utf-8"))
    verifie(cr["intensity"][0]["destination"] == "PROD/WIZTEST_RPG",
            "creative.json : destination par personnage")

    verifie(lb.character_type("wiztest_rpg") == "rpg-personnage"
            and lb.character_world("wiztest_rpg") == "terres-sauvages",
            "les accesseurs du registre relisent la fiche")
    verifie(universe.resolve(lb.character_type("wiztest_rpg"),
                             lb.character_style("wiztest_rpg"))
            == lb.character_universe("wiztest_rpg"),
            "non-regression ADR-0012 : resolve(type, style) == universe ecrit")

    # ------------------------------------------------------- [2] chemin insta
    print("\n[2] une fiche instagram-influenceur (autre pack, autre graphe)")
    cree("wiztest_insta", "Wiz Insta", "instagram-influenceur", "realiste",
         "slow-life", "WIZ2.png")
    cf2 = json.loads((OFM / "CHARACTERS" / "wiztest_insta" / "config.json")
                     .read_text(encoding="utf-8"))
    verifie(cf2["workflow"] == universe.workflow("instagram-influenceur")
            != cf["workflow"], "graphe du pack insta, distinct du pack rpg")
    verifie("weight_faceidv2" not in cf2["identity"]
            and "weight" in cf2["identity"],
            "identity du gabarit insta (pulid), pas celui du pack rpg")

    # ------------------------------------------------- [3] tout invalide est refuse
    print("\n[3] un choix invalide est refuse AVANT toute ecriture")
    attend(FileExistsError,
           lambda: lb.create_character("wiztest_rpg", "x", "rpg-personnage",
                                       "realiste", "terres-sauvages", "b.png"),
           "cid deja pris")
    for mauvais in ("Wiz", "../x", "", "a b"):
        attend(ValueError,
               lambda m=mauvais: lb.create_character(m, "x", "rpg-personnage",
                                                     "realiste", "terres-sauvages",
                                                     "b.png"),
               f"cid invalide {mauvais!r}")
    attend(universe.UnresolvedPackError,
           lambda: lb.create_character("wiztest_bad1", "x", "does-not-exist",
                                       "realiste", "terres-sauvages", "b.png"),
           "type sans pack")
    attend(ValueError,
           lambda: lb.create_character("wiztest_bad2", "x", "instagram-influenceur",
                                       "manga", "slow-life", "b.png"),
           "style absent du pack (instagram ne fait que realiste)")
    attend(worlds.IncompatibleWorldError,
           lambda: lb.create_character("wiztest_bad3", "x", "rpg-personnage",
                                       "realiste", "slow-life", "b.png"),
           "monde d'une autre famille (slow-life est flux)")
    attend(ValueError,
           lambda: lb.create_character("wiztest_bad4", "x", "rpg-personnage",
                                       "realiste", "terres-sauvages", ""),
           "base_gelee vide")
    for cid in ("wiztest_bad1", "wiztest_bad2", "wiztest_bad3", "wiztest_bad4"):
        verifie(not (OFM / "CHARACTERS" / cid).exists(),
                f"{cid} : aucun dossier laisse derriere un refus")

    # --------------------------------------- [4] §11 : deux mondes, meme pack
    print("\n[4] deux personnages meme pack, mondes differents : pas de fuite")
    _vrai = worlds.WORLDS_DIR
    _tmp = Path(tempfile.mkdtemp(prefix="wiz_worlds_"))
    try:
        worlds.WORLDS_DIR = _tmp
        for wid, scene in (("monde-a", "scene_a_unique"), ("monde-b", "scene_b_unique")):
            (_tmp / f"{wid}.json").write_text(json.dumps({
                "id": wid, "label": wid, "compatible_families": ["sdxl"],
                "suggested_styles": ["realiste"],
                "starter_scenes": [{"id": scene, "intention": "portrait",
                                    "prompt": f"prompt for {scene}"}],
            }), encoding="utf-8")
        cree("wiztest_wa", "WA", "rpg-personnage", "realiste", "monde-a", "a.png")
        cree("wiztest_wb", "WB", "rpg-personnage", "realiste", "monde-b", "b.png")
        a = json.loads((OFM / "CHARACTERS" / "wiztest_wa" / "character.json").read_text("utf-8"))
        b = json.loads((OFM / "CHARACTERS" / "wiztest_wb" / "character.json").read_text("utf-8"))
        verifie(a["universe"] == b["universe"] == "rpg-personnage",
                "meme (type, style) -> meme pack")
        verifie(a["world"] != b["world"], "mondes distincts dans les deux fiches")
        sa = json.loads((OFM / "CHARACTERS" / "wiztest_wa" / "scenes.json").read_text("utf-8"))
        sb = json.loads((OFM / "CHARACTERS" / "wiztest_wb" / "scenes.json").read_text("utf-8"))
        verifie([s["id"] for s in sa["scenes"]] == ["scene_a_unique"]
                and [s["id"] for s in sb["scenes"]] == ["scene_b_unique"],
                "chaque banque n'a que les scenes de SON monde")
    finally:
        worlds.WORLDS_DIR = _vrai
        shutil.rmtree(_tmp, ignore_errors=True)

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)
finally:
    for cid in CREES:
        shutil.rmtree(OFM / "CHARACTERS" / cid, ignore_errors=True)

sys.exit(1 if KO else 0)
