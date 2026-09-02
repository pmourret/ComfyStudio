# -*- coding: utf-8 -*-
"""Isolation d'ecriture du catalogue de monde (ADR-0015).

POURQUOI CE TEST EXISTE. ADR-0015 rend `WORLDS/<id>.json` vivant : une scene
de personnage peut desormais y referencer un lieu (`world_ref`) et en herite
en direct a chaque lecture/ecriture de sa banque. Le risque exact que
`.claude/rules/backend.md` demande de verrouiller pour toute route
generalisee : que sauver la banque D'UN personnage finisse par ecrire dans le
catalogue PARTAGE, ou que l'inverse arrive — editer le catalogue en ecrivant
par erreur dans la banque d'un personnage.

Ce que ce test verrouille :
  1. `POST /api/scenes` (banque d'un personnage) ne modifie jamais
     `WORLDS/<son-monde>.json` — meme contenu, meme mtime, avant/apres.
  2. `POST /api/worlds/{id}/places` (catalogue) ne modifie jamais
     `CHARACTERS/<id>/scenes.json` d'AUCUN personnage.
  3. Deux personnages jetables du meme monde : editer le catalogue puis
     recharger `/api/scenes` pour les deux montre le nouveau texte pour les
     deux (heritage live), mais leurs overlays (tenues) restent chacun les
     leurs — jamais melanges.

Monde et personnages jetables (git-ignore : rien ne fuit dans l'historique),
nettoyes a la fin.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_world_catalog_isolation.py
(ou le venv de dev : fastapi suffit)
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

import worlds                                 # noqa: E402
from api.main import app                      # noqa: E402
from fastapi.testclient import TestClient      # noqa: E402

WORLD = "probe-iso-world"
WORLD_PATH = worlds.world_path(WORLD)
CHAR_A, CHAR_B = "probe-iso-a", "probe-iso-b"
KO = 0

# `base_url` en 127.0.0.1 : sans lui le client envoie `Host: testserver`, que
# le garde d'origine refuse en 403 (meme note que test_scenes_categories.py).
CLIENT = TestClient(app, base_url="http://127.0.0.1")


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def poser_monde(places):
    WORLD_PATH.write_text(json.dumps({
        "id": WORLD, "label": "Monde de test isolation",
        "compatible_families": ["flux"], "suggested_styles": ["realiste"],
        "assets": {"lora": None, "lora_strength": None, "prompt_add": ""},
        "tone": "test", "ui_skin_token": "world-probe-iso",
        "places": places,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def poser_personnage(cid, wardrobe_overlay):
    """Personnage jetable, une scene liee au lieu `p1` du monde jetable —
    banque deja MATERIALISEE, comme `create_character` l'ecrirait (ADR-0015 §4)."""
    d = OFM / "CHARACTERS" / cid
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    (d / "character.json").write_text(json.dumps({
        "id": cid, "name": cid, "universe": "instagram-influenceur",
        "type": "instagram-influenceur", "output_style": "realiste",
        "world": WORLD, "content_types": {"image": True}, "nsfw": False,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    lena = OFM / "CHARACTERS" / "lena"
    shutil.copy(lena / "config.json", d / "config.json")
    shutil.copy(lena / "creative.json", d / "creative.json")
    merged = worlds.merge_scene(WORLD, "p1", {
        "wardrobe": wardrobe_overlay, "intensity": 0, "format": "4:5",
        "count": 1, "tones": [], "variants": [],
    })
    (d / "scenes.json").write_text(json.dumps({
        "prefix": "PROBE", "anchor": "probe anchor", "texture": "probe texture",
        "direction": "", "world": WORLD, "scenes": [merged],
    }, ensure_ascii=False, indent=2), encoding="utf-8")


try:
    print("=" * 70)
    print("isolation d'ecriture du catalogue de monde (ADR-0015)")
    print("=" * 70)

    poser_monde([{"id": "p1", "label": "Lieu 1", "intention": "lifestyle",
                 "prompt": "a quiet room, morning light"}])
    poser_personnage(CHAR_A, {"0": "a beige sweater"})
    poser_personnage(CHAR_B, {"0": "a red dress"})

    # ============================================ [1] la Banque n'ecrit jamais le monde
    print("\n[1] POST /api/scenes (personnage) n'ecrit jamais WORLDS/<monde>.json")
    avant_monde = WORLD_PATH.read_bytes()
    bank_a = CLIENT.get(f"/api/scenes?character={CHAR_A}").json()
    scene_a = dict(bank_a["data"]["scenes"][0])
    scene_a["wardrobe"] = {"0": "a beige sweater, autumn palette"}   # overlay seul
    payload = {**bank_a["data"], "scenes": [scene_a]}
    r = CLIENT.post(f"/api/scenes?character={CHAR_A}", json={"data": payload})
    verifie(r.status_code == 200, f"la sauvegarde de {CHAR_A} est acceptee ({r.status_code} — {r.text[:200]})")
    verifie(WORLD_PATH.read_bytes() == avant_monde,
            "WORLDS/<monde>.json OCTET POUR OCTET identique apres la sauvegarde")

    # ============================================ [2] le catalogue n'ecrit jamais une banque
    print("\n[2] POST /api/worlds/{id}/places n'ecrit jamais scenes.json d'un personnage")
    avant_a = (OFM / "CHARACTERS" / CHAR_A / "scenes.json").read_bytes()
    avant_b = (OFM / "CHARACTERS" / CHAR_B / "scenes.json").read_bytes()
    r = CLIENT.post(f"/api/worlds/{WORLD}/places", json={"places": [
        {"id": "p1", "label": "Lieu 1", "intention": "lifestyle",
         "prompt": "a quiet room, EVENING light — edite depuis le catalogue"},
    ]})
    verifie(r.status_code == 200, f"l'edition du catalogue est acceptee ({r.status_code} — {r.text[:200]})")
    verifie((OFM / "CHARACTERS" / CHAR_A / "scenes.json").read_bytes() == avant_a,
            f"scenes.json de {CHAR_A} OCTET POUR OCTET identique apres l'edition du catalogue")
    verifie((OFM / "CHARACTERS" / CHAR_B / "scenes.json").read_bytes() == avant_b,
            f"scenes.json de {CHAR_B} OCTET POUR OCTET identique apres l'edition du catalogue")

    # ============================================ [3] heritage live, overlays distincts
    print("\n[3] les deux personnages heritent du nouveau texte, gardent CHACUN leur tenue")
    bank_a = CLIENT.get(f"/api/scenes?character={CHAR_A}").json()
    bank_b = CLIENT.get(f"/api/scenes?character={CHAR_B}").json()
    sa, sb = bank_a["data"]["scenes"][0], bank_b["data"]["scenes"][0]
    verifie("EVENING light" in sa["prompt"] and "EVENING light" in sb["prompt"],
            "les deux personnages voient le prompt EDITE (heritage live)")
    verifie(sa["wardrobe"] == {"0": "a beige sweater, autumn palette"},
            f"{CHAR_A} garde SA tenue, celle sauvee en [1] ({sa['wardrobe']})")
    verifie(sb["wardrobe"] == {"0": "a red dress"},
            f"{CHAR_B} garde SA tenue a lui, jamais celle de {CHAR_A} ({sb['wardrobe']})")

finally:
    shutil.rmtree(OFM / "CHARACTERS" / CHAR_A, ignore_errors=True)
    shutil.rmtree(OFM / "CHARACTERS" / CHAR_B, ignore_errors=True)
    WORLD_PATH.unlink(missing_ok=True)

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
print("=" * 70)
sys.exit(1 if KO else 0)
