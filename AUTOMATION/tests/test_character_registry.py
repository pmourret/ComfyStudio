# -*- coding: utf-8 -*-
"""Registre personnage : CHARACTERS/<id>/character.json (J4).

POURQUOI CE TEST EXISTE. J4 fait de `character_id` une entree de registre :
univers associe, types de contenu actifs, interrupteur NSFW (CLAUDE.md §7). Le
risque exact (§11) : une resolution qui melange deux personnages — l'univers de
l'un servi pour l'autre — ou un character.json manquant / pointant vers un
univers inconnu qui remonte en 500 au lieu d'un 400 lisible.

Personnages jetables sous CHARACTERS/ (git-ignore : rien ne fuit dans
l'historique), supprimes a la fin. `probe` est volontairement dans l'AUTRE
univers que Lena, pour qu'une resolution qui confond les deux se voie.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_character_registry.py
"""
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION / "web"))
sys.path.insert(0, str(AUTOMATION))

import runner as lb          # noqa: E402
import shared_state as ss    # noqa: E402
import nsfw_batch            # noqa: E402
from aiohttp import web      # noqa: E402

PROBE = OFM / "CHARACTERS" / "probe"
PROBE_BADU = OFM / "CHARACTERS" / "probe-badu"
KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


class FakeReq:
    """`character(request)` ne lit que request.query.get('character', ...)."""
    def __init__(self, cid):
        self._q = {} if cid is None else {"character": cid}

    @property
    def query(self):
        return self

    def get(self, key, default=None):
        return self._q.get(key, default)


def char_ok(cid):
    return ss.character(FakeReq(cid))


def char_refuse(cid):
    try:
        ss.character(FakeReq(cid))
        return None
    except web.HTTPBadRequest as e:
        return e.text


def poser(dossier, character_json):
    if dossier.exists():
        shutil.rmtree(dossier)
    dossier.mkdir(parents=True)
    (dossier / "character.json").write_text(
        json.dumps(character_json, ensure_ascii=False, indent=2), encoding="utf-8")
    # config/scenes minimales : character() n'y touche pas, mais on reste realiste
    (dossier / "config.json").write_text('{"comfy_url": "http://x"}', encoding="utf-8")


poser(PROBE, {"id": "probe", "name": "Probe", "universe": "rpg-personnage",
              "content_types": {"image": True, "video": False}, "nsfw": False})
poser(PROBE_BADU, {"id": "probe-badu", "name": "Bad", "universe": "does-not-exist",
                   "content_types": {"image": True}, "nsfw": False})

try:
    # ------------------------------------------------------------ [1] loaders
    print("[1] load_character / character_universe / content_type_active")
    verifie(lb.character_universe("lena") == "instagram-influenceur",
            "lena -> instagram-influenceur")
    verifie(lb.character_universe("probe") == "rpg-personnage",
            "probe -> rpg-personnage (l'autre univers, resolu independamment)")
    verifie(lb.content_type_active("lena", "image") is True
            and lb.content_type_active("lena", "video") is False,
            "lena : image actif, video inactif (registre de creation, ADR-0004)")
    verifie(lb.content_type_active("probe", "voice") is False,
            "probe : un type absent du fichier compte comme inactif")

    # ------------------------------------------- [1b] abyssiaelle (vrai personnage, J6)
    print("\n[1b] abyssiaelle (registre reel, pas une sonde jetable)")
    verifie(lb.character_universe("abyssiaelle") == "rpg-personnage",
            "abyssiaelle -> rpg-personnage (premier personnage de cet univers)")
    verifie(lb.character_style("abyssiaelle") == "realiste",
            "abyssiaelle : output_style fige a 'realiste' (decision J6 etape 1)")
    verifie(lb.content_type_active("abyssiaelle", "image") is True
            and lb.content_type_active("abyssiaelle", "video") is False,
            "abyssiaelle : image actif, video inactif (meme registre de creation que lena)")
    verifie(nsfw_batch.is_armed("abyssiaelle") is False,
            "abyssiaelle : nsfw off par defaut (§6-§7), pas arme a l'onboarding")
    verifie(char_ok("abyssiaelle") == "abyssiaelle",
            "?character=abyssiaelle accepte (character.json valide, univers reel)")

    # ------------------------------------------------ [1c] type / world (J7bis)
    print("\n[1c] type / world dans le registre (ADR-0012)")
    verifie(lb.character_type("lena") == "instagram-influenceur",
            "lena.type == instagram-influenceur (== pack en V1)")
    verifie(lb.character_world("lena") == "slow-life", "lena.world == slow-life")
    verifie(lb.character_type("abyssiaelle") == "rpg-personnage"
            and lb.character_world("abyssiaelle") == "terres-sauvages",
            "abyssiaelle : type rpg-personnage, world terres-sauvages")
    verifie(lb.character_world("probe") is None,
            "probe : world absent du registre -> None (toujours accepte)")

    # --------------------------------------------------- [2] pas de contamination
    print("\n[2] resoudre probe ne change rien pour lena")
    verifie(lb.character_universe("lena") == "instagram-influenceur",
            "lena garde son univers apres avoir resolu probe")

    # --------------------------------------------------- [3] character() durci
    print("\n[3] character(request) : 400 lisible, jamais 500 ni chemin")
    verifie(char_ok("lena") == "lena", "?character=lena accepte")
    verifie(char_ok("probe") == "probe", "?character=probe accepte (character.json valide)")
    verifie(char_ok(None) == "lena", "defaut = lena quand le param est absent")

    msg = char_refuse("probe-badu")
    verifie(msg is not None and "univers inconnu" in msg,
            f"univers inexistant -> 400 « univers inconnu » ({msg})")
    verifie('"ok": false' in (msg or "").lower().replace(" ", "") or
            '"ok":false' in (msg or "").replace(" ", ""),
            "la reponse 400 est bien du JSON {ok:false}")

    # personnage sans character.json du tout
    sans = OFM / "CHARACTERS" / "probe-sans"
    if sans.exists():
        shutil.rmtree(sans)
    sans.mkdir(parents=True)
    try:
        msg = char_refuse("probe-sans")
        verifie(msg is not None and "character.json" in msg,
                f"dossier sans character.json -> 400 explicite ({msg})")
    finally:
        shutil.rmtree(sans, ignore_errors=True)

    # J7bis : un `world` inconnu ou d'une autre famille -> 400 lisible, pas 500
    badw = OFM / "CHARACTERS" / "probe-badw"
    poser(badw, {"id": "probe-badw", "name": "BadW", "universe": "rpg-personnage",
                 "type": "rpg-personnage", "world": "n-existe-pas",
                 "content_types": {"image": True}, "nsfw": False})
    try:
        msg = char_refuse("probe-badw")
        verifie(msg is not None and "monde inconnu" in msg,
                f"world inconnu -> 400 « monde inconnu » ({msg})")
    finally:
        shutil.rmtree(badw, ignore_errors=True)

    incompat = OFM / "CHARACTERS" / "probe-incompat"
    poser(incompat, {"id": "probe-incompat", "name": "Inc",
                     "universe": "rpg-personnage", "type": "rpg-personnage",
                     "world": "slow-life",             # monde flux sur un pack sdxl
                     "content_types": {"image": True}, "nsfw": False})
    try:
        msg = char_refuse("probe-incompat")
        verifie(msg is not None and "incompatible" in msg,
                f"world d'une autre famille -> 400 « incompatible » ({msg})")
    finally:
        shutil.rmtree(incompat, ignore_errors=True)

    for mauvais in ("../lena", "Lena", "does-not-exist", "a b"):
        verifie(char_refuse(mauvais) is not None,
                f"id invalide/inconnu {mauvais!r} -> refuse")

    # ------------------------------------------ [4] interrupteur NSFW = registre
    print("\n[4] l'armement NSFW se lit dans character.json, plus dans config.json")
    lena_cfg = json.loads((OFM / "CHARACTERS" / "lena" / "config.json")
                          .read_text(encoding="utf-8"))
    verifie("enabled" not in lena_cfg.get("nsfw", {}),
            "config.json ne porte plus nsfw.enabled")
    verifie(nsfw_batch.is_armed("lena") is bool(
        lb.load_character("lena").get("nsfw")),
        "is_armed('lena') suit character.json")

    # probe est desarme (nsfw:false) pendant que lena reste arme -> pas de melange
    verifie(nsfw_batch.is_armed("probe") is False,
            "is_armed('probe') False (nsfw:false dans son registre)")
    try:
        nsfw_batch.check_armed("probe")
        verifie(False, "check_armed('probe') aurait du lever Disarmed")
    except nsfw_batch.Disarmed:
        verifie(True, "check_armed('probe') leve Disarmed")

    # armer probe en basculant SON registre ne touche pas lena
    pj = PROBE / "character.json"
    data = json.loads(pj.read_text(encoding="utf-8"))
    data["nsfw"] = True
    pj.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    verifie(nsfw_batch.is_armed("probe") is True,
            "is_armed('probe') True apres bascule de son propre character.json")

    print("\n" + "=" * 70)
    print("tout est vert" if not KO else f"{KO} ECHEC(S)")
    print("=" * 70)
finally:
    shutil.rmtree(PROBE, ignore_errors=True)
    shutil.rmtree(PROBE_BADU, ignore_errors=True)

sys.exit(1 if KO else 0)
