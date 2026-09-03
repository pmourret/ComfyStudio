# -*- coding: utf-8 -*-
"""Isolation des routes de l'editeur d'expression faciale.

POURQUOI CE TEST EXISTE. `.claude/rules/backend.md` : toute route generalisee
vient avec un test qui aurait detecte un melange de donnees entre deux
personnages. Deux routes neuves, deux risques distincts :

  1. `POST /api/expression/tone` ecrit dans `CHARACTERS/<id>/creative.json` —
     doit ecrire UNIQUEMENT dans le fichier du personnage demande, jamais
     dans celui d'un autre.
  2. `POST /api/expression/preview` resout une photo via `bucket_dir(bucket,
     space, character_id)` — demander la photo d'UN personnage avec
     `character_id` d'un AUTRE doit echouer (404), jamais renvoyer les
     octets de la photo du premier.

Le [2] ne demande jamais ComfyUI : `resolve_photo` (services/expression.py)
est deliberement verifie AVANT `comfy_alive()` dans le routeur, pour que ce
test tourne sans le studio ouvert — voir la note dans
`api/routers/expression.py`.

Personnages jetables (git-ignore : rien ne fuit dans l'historique), nettoyes
a la fin.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_expression_isolation.py
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

import runner as lb                            # noqa: E402
from api.main import app                       # noqa: E402
from fastapi.testclient import TestClient      # noqa: E402

CHAR_A, CHAR_B = "probe-expr-a", "probe-expr-b"
KO = 0

# `base_url` en 127.0.0.1 : sans lui le client envoie `Host: testserver`, que
# le garde d'origine refuse en 403 (meme note que test_world_catalog_isolation.py).
CLIENT = TestClient(app, base_url="http://127.0.0.1")


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def poser_personnage(cid):
    """Personnage jetable, config/creative clones de lena (meme univers/monde
    — aucun besoin d'un monde a part pour ce test)."""
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
    print("isolation des routes de l'editeur d'expression faciale")
    print("=" * 70)

    poser_personnage(CHAR_A)
    poser_personnage(CHAR_B)

    # tons herites du monde depuis J8.3 (ADR-0019) : la fiche du personnage
    # peut n'en porter aucun en propre, la vue fusionnee (load_creative) est
    # la seule source fiable pour un ton VALIDE, herite ou non.
    tone = lb.load_creative(CHAR_A)["tones"][0]["key"]

    # =================================== [1] la plage d'un ton n'ecrit qu'UN personnage
    print(f"\n[1] POST /api/expression/tone (ton {tone!r}) n'ecrit que {CHAR_A}")
    avant_b = (OFM / "CHARACTERS" / CHAR_B / "creative.json").read_bytes()
    r = CLIENT.post(f"/api/expression/tone?character={CHAR_A}",
                    json={"tone": tone, "params": {"smile": [0.05, 0.4]}})
    verifie(r.status_code == 200, f"la sauvegarde est acceptee ({r.status_code} — {r.text[:200]})")
    verifie((OFM / "CHARACTERS" / CHAR_B / "creative.json").read_bytes() == avant_b,
            f"creative.json de {CHAR_B} OCTET POUR OCTET identique apres la sauvegarde de {CHAR_A}")

    creative_a_apres = json.loads((OFM / "CHARACTERS" / CHAR_A / "creative.json").read_text(encoding="utf-8"))
    tone_a_apres = next(t for t in creative_a_apres["tones"] if t["key"] == tone)
    verifie(tone_a_apres["expression"].get("smile") == [0.05, 0.4],
            f"{CHAR_A} porte bien la nouvelle plage ({tone_a_apres['expression']})")

    # =================================== [2] un ton inconnu est refuse explicitement
    print("\n[2] un ton inconnu est refuse, jamais cree en silence")
    r = CLIENT.post(f"/api/expression/tone?character={CHAR_A}",
                    json={"tone": "ce-ton-n-existe-pas", "params": {"smile": [0, 1]}})
    verifie(r.status_code == 400, f"refus explicite ({r.status_code} — {r.text[:200]})")

    # =================================== [3] une photo hors de l'arbre du personnage
    print("\n[3] POST /api/expression/preview ne resout jamais la photo d'un AUTRE personnage")
    bucket_a = OFM / "PROD" / CHAR_A.upper() / "OK"
    bucket_a.mkdir(parents=True, exist_ok=True)
    photo = "probe.png"
    (bucket_a / photo).write_bytes(b"\x89PNG\r\n\x1a\nfaux fichier, jamais rendu")

    r_b = CLIENT.post(f"/api/expression/preview?character={CHAR_B}",
                      json={"bucket": "OK", "space": "sfw", "name": photo,
                            "params": {"smile": 0.2}})
    verifie(r_b.status_code == 404,
            f"{CHAR_B} demandant la photo de {CHAR_A} est refuse (404), jamais les octets ({r_b.status_code})")

    r_a = CLIENT.post(f"/api/expression/preview?character={CHAR_A}",
                      json={"bucket": "OK", "space": "sfw", "name": photo,
                            "params": {"smile": 0.2}})
    # Pas de ComfyUI dans cet environnement de test : la photo doit avoir ete
    # RESOLUE (elle appartient bien a CHAR_A) avant que la route ne bute sur
    # « ComfyUI hors ligne » — la preuve que [3] isole vraiment par personnage
    # et ne se contente pas de refuser toute requete faute de studio ouvert.
    verifie(r_a.status_code != 404,
            f"{CHAR_A} demandant SA PROPRE photo la resout (pas de 404 — {r_a.status_code})")

finally:
    shutil.rmtree(OFM / "CHARACTERS" / CHAR_A, ignore_errors=True)
    shutil.rmtree(OFM / "CHARACTERS" / CHAR_B, ignore_errors=True)
    shutil.rmtree(OFM / "PROD" / CHAR_A.upper(), ignore_errors=True)
    shutil.rmtree(OFM / "PROD" / CHAR_B.upper(), ignore_errors=True)

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
print("=" * 70)
sys.exit(1 if KO else 0)
