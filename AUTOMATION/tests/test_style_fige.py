# -*- coding: utf-8 -*-
"""Style de sortie figé à la création (J5 étape 3).

POURQUOI CE TEST EXISTE. CLAUDE.md §3 : le style est choisi et figé à la
création du personnage, non modifiable ensuite. J5 le stocke dans
character.json (`output_style`), le valide contre les styles déclarés par
l'univers, et l'univers déclare l'EFFET de chaque style sur le pipeline. Le
risque (§11) : un style accepté hors de son univers, ou une route qui le
réécrit, ou l'effet `realiste` qui modifierait quand même le prompt de Léna
(§8.1).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_style_fige.py
"""
import json
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION / "web"))
sys.path.insert(0, str(AUTOMATION))

import runner as lb          # noqa: E402
import universe              # noqa: E402
import shared_state as ss    # noqa: E402
from aiohttp import web      # noqa: E402

PROBE = OFM / "CHARACTERS" / "probe-style"
KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


class FakeReq:
    def __init__(self, cid):
        self._q = {} if cid is None else {"character": cid}

    @property
    def query(self):
        return self

    def get(self, key, default=None):
        return self._q.get(key, default)


def char_refuse(cid):
    try:
        ss.character(FakeReq(cid))
        return None
    except web.HTTPBadRequest as e:
        return e.text


def poser(universe_id, style):
    if PROBE.exists():
        shutil.rmtree(PROBE)
    PROBE.mkdir(parents=True)
    (PROBE / "character.json").write_text(json.dumps(
        {"id": "probe-style", "name": "Probe", "universe": universe_id,
         "output_style": style, "content_types": {"image": True}, "nsfw": False},
        ensure_ascii=False, indent=2), encoding="utf-8")
    (PROBE / "config.json").write_text('{"comfy_url": "http://x"}', encoding="utf-8")


try:
    # ------------------------------------------------------ [1] universe.py
    print("[1] universe : style_names / style_effect")
    verifie(universe.style_names("instagram-influenceur") == ["realiste"],
            "instagram-influenceur : seul realiste")
    verifie(set(universe.style_names("rpg-personnage"))
            == {"realiste", "fantastique", "cartoon", "manga"},
            f"rpg-personnage : 4 styles ({universe.style_names('rpg-personnage')})")
    eff = universe.style_effect("instagram-influenceur", "realiste")
    verifie(eff == {"prompt_add": "", "checkpoint": None},
            f"realiste = effet nul ({eff})")
    verifie(universe.style_effect("rpg-personnage", "fantastique")["prompt_add"] != "",
            "fantastique porte un prompt_add non vide")
    try:
        universe.style_effect("instagram-influenceur", "manga")
    except universe.UnknownStyleError as e:
        verifie("inconnu" in str(e).lower(),
                f"style hors univers -> UnknownStyleError ({str(e)[:70]}…)")
    except Exception as e:  # noqa: BLE001
        verifie(False, f"type inattendu {type(e).__name__}")
    else:
        verifie(False, "style hors univers -> aucune erreur")

    # ------------------------------------------------ [2] character_style + defaut
    print("\n[2] character_style lit character.json")
    verifie(lb.character_style("lena") == "realiste", "lena -> realiste")

    # ---------------------------------------------- [3] character() valide le style
    print("\n[3] character(request) refuse un style hors de l'univers")
    poser("instagram-influenceur", "realiste")
    verifie(ss.character(FakeReq("probe-style")) == "probe-style",
            "style valide pour l'univers -> accepte")
    poser("instagram-influenceur", "manga")
    msg = char_refuse("probe-style")
    verifie(msg is not None and "manga" in msg and "style" in msg,
            f"manga hors de instagram-influenceur -> 400 lisible ({msg})")

    # ---------------------------------------- [4] aucune route ne reecrit le style
    print("\n[4] l'ecriture d'armement NSFW preserve output_style")
    poser("instagram-influenceur", "realiste")
    reg = lb.load_character("probe-style")           # ce que fait api_nsfw_arm
    reg["nsfw"] = True
    (PROBE / "character.json").write_text(
        json.dumps(reg, ensure_ascii=False, indent=2), encoding="utf-8")
    verifie(lb.character_style("probe-style") == "realiste",
            "output_style intact apres un write de la route d'armement")

    # -------------------------------------------- [5] effet realiste = graphe inchange
    print("\n[5] style realiste n'altere pas le prompt de Lena (§8.1)")
    cfg = lb.load_config("lena")
    try:
        urllib.request.urlopen(cfg["comfy_url"].rstrip("/") + "/object_info/FluxGuidance",
                               timeout=3).close()
        from runner.comfy import WorkflowRunner
        r = WorkflowRunner(cfg, "lena")
        job = {"scene": "s", "format": "4:5", "prompt": "a plain room, wide shot",
               "seed": 1, "overrides": {}, "pose": None}
        api = r.api_for(job, "t")
        pos = api[str(r.roles["positive"]["id"])]["inputs"]["text"]
        verifie(pos == job["prompt"],
                f"prompt positif inchange ({pos!r})")
        verifie(r.style == {"prompt_add": "", "checkpoint": None},
                f"style resolu = effet nul ({r.style})")
    except (urllib.error.URLError, OSError):
        print("  IGNORE — ComfyUI injoignable (object_info requis)")

    # ---------------------------- [6] meme invariant pour abyssiaelle (J6 etape 4)
    print("\n[6] style realiste n'altere pas le prompt d'abyssiaelle non plus")
    verifie(lb.character_style("abyssiaelle") == "realiste",
            "abyssiaelle -> realiste (fige a l'onboarding, J6 etape 1)")
    verifie(universe.style_effect("rpg-personnage", "realiste")
            == {"prompt_add": "", "checkpoint": None},
            "rpg-personnage / realiste : effet nul, comme instagram-influenceur")
    try:
        urllib.request.urlopen(cfg["comfy_url"].rstrip("/") + "/object_info/IPAdapterFaceID",
                               timeout=3).close()
        cfg_aby = dict(lb.load_config("abyssiaelle"))  # base_gelee reel depuis J6 etape 5
        cfg_aby["preset"] = {"guidance": 6.0, "steps": 30}  # pas encore mesure (etape 6)
        r2 = WorkflowRunner(cfg_aby, "abyssiaelle")
        job2 = {"scene": "s", "format": "1:1", "prompt": "a plain room, wide shot",
               "seed": 1, "overrides": {}, "pose": None}
        api2 = r2.api_for(job2, "t")
        pos2 = api2[str(r2.roles["positive"]["id"])]["inputs"]["text"]
        verifie(pos2 == job2["prompt"], f"prompt positif inchange ({pos2!r})")
        verifie(r2.style == {"prompt_add": "", "checkpoint": None},
                f"style resolu = effet nul ({r2.style})")
    except (urllib.error.URLError, OSError):
        print("  IGNORE — ComfyUI injoignable (object_info requis)")

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)
finally:
    shutil.rmtree(PROBE, ignore_errors=True)

sys.exit(1 if KO else 0)
