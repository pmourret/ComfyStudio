# -*- coding: utf-8 -*-
"""Heritage monde -> personnage des intentions/tons, J8.3, ADR-0019.

POURQUOI CE TEST EXISTE. `worlds._merge_by_key` / `merge_creative_vocab` et
leur branchement dans `runner.prompt.load_creative()` n'avaient aucun test
dedie avant ce chantier — seule la migration reelle (Lena, Abyssiaelle) les
exerce. Ce fichier verrouille la REGLE independamment de ces deux fiches :
le monde fournit la base, une `key` de personnage la remplace entierement,
une `key` neuve s'ajoute, une entree du monde absente chez le personnage
reste heritee. Verifie aussi qu'un monde reste lisible sans aucun
personnage (contrainte explicite du chantier) : `worlds.intentions/tones/
places` ne prennent jamais de `character_id`.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_world_catalogs_inheritance.py
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

import runner as lb  # noqa: E402
import worlds        # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


WID = "probe-world-j83"
CID = "probe_j83"

WORLD_DATA = {
    "id": WID, "label": "Probe", "compatible_families": ["flux"],
    "suggested_styles": ["realiste"],
    "assets": {"lora": None, "lora_strength": None, "prompt_add": ""},
    "tone": "", "ui_skin_token": f"world-{WID}",
    "places": [{"id": "lieu_a", "label": "Lieu A", "intention": "lifestyle",
               "prompt": "a plain place"}],
    "intentions": [
        {"key": "selfie", "label": "Selfie (monde)", "prompt_add": "phone camera"},
        {"key": "lifestyle", "label": "Lifestyle (monde)", "prompt_add": "daylight"},
    ],
    "tones": [
        {"key": "doux", "label": "Doux (monde)", "prompt_add": "soft light"},
        {"key": "joueur", "label": "Joueur (monde)", "prompt_add": "candid"},
    ],
}

_vrai_worlds_dir = worlds.WORLDS_DIR
_tmp_worlds_dir = Path(tempfile.mkdtemp(prefix="worlds_j83_"))
CHAR_DIR = OFM / "CHARACTERS" / CID

try:
    (_tmp_worlds_dir / f"{WID}.json").write_text(
        json.dumps(WORLD_DATA, ensure_ascii=False, indent=2), encoding="utf-8")
    worlds.WORLDS_DIR = _tmp_worlds_dir

    # --------------------------------------------------- [1] monde seul, lisible
    print("[1] un monde reste lisible sans qu'aucun personnage n'existe")
    verifie(worlds.intentions(WID) == WORLD_DATA["intentions"],
            "intentions(wid) ne prend aucun character_id, lit le monde seul")
    verifie(worlds.tones(WID) == WORLD_DATA["tones"],
            "tones(wid) idem")
    verifie(len(worlds.places(WID)) == 1, "places(wid) idem")

    # ------------------------------------------ [2] _merge_by_key, regle nue
    print("\n[2] _merge_by_key : remplace une cle connue, ajoute une neuve, "
          "garde ce qui n'est pas touche")
    base = [{"key": "a", "v": "monde-a"}, {"key": "b", "v": "monde-b"}]
    over = [{"key": "b", "v": "perso-b"}, {"key": "c", "v": "perso-c"}]
    merged = worlds._merge_by_key(base, over)
    verifie(merged == [{"key": "a", "v": "monde-a"}, {"key": "b", "v": "perso-b"},
                       {"key": "c", "v": "perso-c"}],
            f"remplacement total de 'b', 'a' heritee telle quelle, 'c' ajoutee : {merged}")
    verifie(worlds._merge_by_key(base, []) == base,
            "personnage vide -> le monde seul, integralement herite")

    # --------------------------------------------- [3] load_creative() reel
    print("\n[3] load_creative() : fusion reelle monde + fiche personnage")
    CHAR_DIR.mkdir(parents=True, exist_ok=True)
    (CHAR_DIR / "character.json").write_text(json.dumps(
        {"id": CID, "name": CID, "universe": "instagram-influenceur",
         "type": "instagram-influenceur", "output_style": "realiste",
         "world": WID, "nsfw": False, "content_types": {"image": True}},
        ensure_ascii=False, indent=2), encoding="utf-8")
    (CHAR_DIR / "creative.json").write_text(json.dumps(
        {"intentions": [{"key": "selfie", "label": "Selfie (perso)",
                        "prompt_add": "perso override"},
                       {"key": "voyage", "label": "Voyage (perso, neuf)",
                        "prompt_add": "travel"}],
         "tones": [],
         "intensity": [{"level": 0, "key": "sfw", "label": "SFW", "pipeline": "produce",
                        "prompt_add": "", "export": True, "requires": None}],
         "assemblage": {"wardrobe_position": "apres_scene"}},
        ensure_ascii=False, indent=2), encoding="utf-8")

    creative = lb.load_creative(CID)
    keys = [i["key"] for i in creative["intentions"]]
    verifie(set(keys) == {"selfie", "lifestyle", "voyage"},
            f"herite lifestyle du monde, selfie surcharge, voyage ajoute : {keys}")
    selfie = next(i for i in creative["intentions"] if i["key"] == "selfie")
    verifie(selfie["label"] == "Selfie (perso)",
            "la version du personnage GAGNE entierement, pas une fusion champ a champ")
    lifestyle = next(i for i in creative["intentions"] if i["key"] == "lifestyle")
    verifie(lifestyle["label"] == "Lifestyle (monde)",
            "une entree du monde absente chez le personnage reste heritee telle quelle")
    verifie(creative["tones"] == WORLD_DATA["tones"],
            "tons du personnage vides -> integralement herites du monde")
    verifie(creative["intensity"][0]["pipeline"] == "produce",
            "intensity n'est jamais fusionne avec le monde (lie au pack, J8.2)")

    # -------------------------------------- [4] personnage sans monde valide
    print("\n[4] pas de monde declare -> load_creative() ne leve pas, ne fusionne pas")
    (CHAR_DIR / "character.json").write_text(json.dumps(
        {"id": CID, "name": CID, "universe": "instagram-influenceur",
         "type": "instagram-influenceur", "output_style": "realiste",
         "nsfw": False, "content_types": {"image": True}},
        ensure_ascii=False, indent=2), encoding="utf-8")
    creative_sans_monde = lb.load_creative(CID)
    verifie([i["key"] for i in creative_sans_monde["intentions"]] == ["selfie", "voyage"],
            "sans `world`, load_creative() rend la fiche du personnage seule, inchangee")

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)
finally:
    worlds.WORLDS_DIR = _vrai_worlds_dir
    shutil.rmtree(_tmp_worlds_dir, ignore_errors=True)
    shutil.rmtree(CHAR_DIR, ignore_errors=True)

sys.exit(1 if KO else 0)
