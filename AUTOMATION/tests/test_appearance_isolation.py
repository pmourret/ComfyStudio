# -*- coding: utf-8 -*-
"""Isolation de la route de personnalisation du theme (Phase 0b,
`DOCS/design-pass/phase-0b-theme-utilisateur.md`).

POURQUOI CE TEST EXISTE. `.claude/rules/backend.md` : toute route
generalisee vient avec un test qui aurait detecte un melange de donnees
entre deux personnages. `POST /api/character/appearance` ecrit dans
`CHARACTERS/<id>/character.json` (meme fichier que le NSFW, cle differente)
— doit ecrire UNIQUEMENT le fichier du personnage demande.

Couvre aussi les deux autres garanties du document : le rejet EXPLICITE
hors bornes (jamais un clampage silencieux, meme doctrine que
`ExpressionParams` — le rejet Pydantic ressort en 400, pas 422 :
`api/errors.py::_validation_error` retraduit toute RequestValidationError
dans la forme `{ok, erreur}` du studio), et la reinitialisation qui fait
DISPARAITRE la cle `appearance` plutot que d'y laisser un `{}` qui traine.

Personnages jetables (git-ignore : rien ne fuit dans l'historique), nettoyes
a la fin.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_appearance_isolation.py
(ou le venv de dev : fastapi suffit, aucun appel ComfyUI reel n'est fait)
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

from api.main import app                       # noqa: E402
from fastapi.testclient import TestClient      # noqa: E402

CHAR_A, CHAR_B = "probe-app-a", "probe-app-b"
KO = 0

# `base_url` en 127.0.0.1 : sans lui le client envoie `Host: testserver`, que
# le garde d'origine refuse en 403 (meme note que test_expression_isolation.py).
CLIENT = TestClient(app, base_url="http://127.0.0.1")


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def poser_personnage(cid):
    d = OFM / "CHARACTERS" / cid
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    (d / "character.json").write_text(json.dumps({
        "id": cid, "name": cid, "universe": "instagram-influenceur",
        "type": "instagram-influenceur", "output_style": "realiste",
        "world": "slow-life", "content_types": {"image": True}, "nsfw": False,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    lena = OFM / "CHARACTERS" / "lena"
    shutil.copy(lena / "config.json", d / "config.json")
    shutil.copy(lena / "creative.json", d / "creative.json")
    shutil.copy(lena / "scenes.json", d / "scenes.json")


try:
    print("=" * 70)
    print("isolation de POST /api/character/appearance")
    print("=" * 70)

    poser_personnage(CHAR_A)
    poser_personnage(CHAR_B)

    # =================================== [1] n'ecrit qu'UN personnage
    print(f"\n[1] POST /api/character/appearance n'ecrit que {CHAR_A}")
    avant_b = (OFM / "CHARACTERS" / CHAR_B / "character.json").read_bytes()
    r = CLIENT.post(f"/api/character/appearance?character={CHAR_A}",
                    json={"neutral_hue": 30, "neutral_intensity": 0.02, "accent_hue": 300})
    verifie(r.status_code == 200, f"la sauvegarde est acceptee ({r.status_code} — {r.text[:200]})")
    verifie((OFM / "CHARACTERS" / CHAR_B / "character.json").read_bytes() == avant_b,
            f"character.json de {CHAR_B} OCTET POUR OCTET identique apres la sauvegarde de {CHAR_A}")

    reg_a = json.loads((OFM / "CHARACTERS" / CHAR_A / "character.json").read_text(encoding="utf-8"))
    verifie(reg_a.get("appearance") == {"neutral_hue": 30, "neutral_intensity": 0.02, "accent_hue": 300},
            f"{CHAR_A} porte bien les trois valeurs ({reg_a.get('appearance')})")

    # =================================== [2] hors bornes -> refus explicite, rien d'ecrit
    print("\n[2] hors bornes : refus explicite (400), pas de clampage silencieux")
    avant_a = (OFM / "CHARACTERS" / CHAR_A / "character.json").read_bytes()
    r = CLIENT.post(f"/api/character/appearance?character={CHAR_A}",
                    json={"neutral_hue": 400})
    verifie(r.status_code == 400 and r.json().get("ok") is False,
            f"teinte hors [0, 360) refusee ({r.status_code} — {r.text[:150]})")
    r = CLIENT.post(f"/api/character/appearance?character={CHAR_A}",
                    json={"neutral_intensity": 1})
    verifie(r.status_code == 400 and r.json().get("ok") is False,
            f"intensite hors [0, 0.05] refusee ({r.status_code} — {r.text[:150]})")
    verifie((OFM / "CHARACTERS" / CHAR_A / "character.json").read_bytes() == avant_a,
            f"rien n'a change dans {CHAR_A} apres les deux refus")

    # =================================== [3] reinitialiser fait DISPARAITRE la cle
    print("\n[3] les trois champs a None retirent la cle `appearance`, pas un `{}` qui traine")
    r = CLIENT.post(f"/api/character/appearance?character={CHAR_A}", json={})
    verifie(r.status_code == 200, f"la reinitialisation est acceptee ({r.status_code})")
    reg_a_apres = json.loads((OFM / "CHARACTERS" / CHAR_A / "character.json").read_text(encoding="utf-8"))
    verifie("appearance" not in reg_a_apres,
            f"la cle appearance a disparu ({reg_a_apres.get('appearance', '<absente>')})")

finally:
    shutil.rmtree(OFM / "CHARACTERS" / CHAR_A, ignore_errors=True)
    shutil.rmtree(OFM / "CHARACTERS" / CHAR_B, ignore_errors=True)

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
print("=" * 70)
sys.exit(1 if KO else 0)
