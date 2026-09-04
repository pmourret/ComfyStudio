# -*- coding: utf-8 -*-
"""Isolation des routes de l'editeur photo avance (calques).

POURQUOI CE TEST EXISTE. `.claude/rules/backend.md` : toute route generalisee
vient avec un test qui aurait detecte un melange de donnees entre deux
personnages. Deux routes neuves, deux risques distincts :

  1. `GET /api/photo-editor/layers` resout une photo via `bucket_dir(bucket,
     space, character_id)` — demander la photo d'UN personnage avec le
     `character_id` d'un AUTRE doit echouer (404), jamais renvoyer sa pile
     de calques.
  2. `POST /api/photo-editor/save` ECRIT (image + sidecar `.layers.json`) —
     doit ecrire UNIQUEMENT dans l'arbre du personnage demande, jamais dans
     celui d'un autre, que ce soit en copie ou en ecrasement (`remplacer`).

Aucun executor ici (contrairement a `/api/expression/preview`) : lecture et
ecriture disque pures, donc pas de risque `LocalOriginGuardMiddleware` a
verifier sur ce module.

Personnages jetables (git-ignore : rien ne fuit dans l'historique), nettoyes
a la fin.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_photo_editor_isolation.py
(ou le venv de dev : fastapi suffit, aucun appel ComfyUI/cv2 n'est fait)
"""
import base64
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION / "web"))
sys.path.insert(0, str(AUTOMATION))

import base                                     # noqa: E402
from api.main import app                       # noqa: E402
from fastapi.testclient import TestClient      # noqa: E402

CHAR_A, CHAR_B = "probe-photoed-a", "probe-photoed-b"
PHOTO = "probe.png"
FAUX_PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nfaux fichier, jamais rendu").decode()
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
    return OFM / "PROD" / cid.upper() / "OK"


try:
    print("=" * 70)
    print("isolation des routes de l'editeur photo avance (calques)")
    print("=" * 70)

    bucket_a = poser_personnage(CHAR_A)
    bucket_b = poser_personnage(CHAR_B)
    # SEULEMENT CHAR_A a la photo — sinon CHAR_B resoudrait legitimement SA
    # PROPRE homonyme et le test ne prouverait rien (piege du premier essai :
    # les deux buckets avaient chacun leur "probe.png", 404 attendu jamais vu).
    bucket_a.mkdir(parents=True, exist_ok=True)
    (bucket_a / PHOTO).write_bytes(b"\x89PNG\r\n\x1a\nfaux fichier, jamais rendu")
    bucket_b.mkdir(parents=True, exist_ok=True)  # existe, mais reste VIDE

    # =================================== [1] lecture : chacun voit SA propre photo
    print(f"\n[1] GET /api/photo-editor/layers : {CHAR_A} et {CHAR_B} lisent chacun la leur")
    r_a = CLIENT.get(f"/api/photo-editor/layers?character={CHAR_A}"
                     f"&bucket=OK&space=sfw&name={PHOTO}")
    verifie(r_a.status_code == 200, f"{CHAR_A} resout sa propre photo ({r_a.status_code})")
    verifie(r_a.json()["layers"][0]["kind"] == "photo",
            "aucun sidecar encore ecrit -> le calque de base par defaut")

    # =================================== [2] lecture croisee : jamais 404 -> octets
    print(f"\n[2] GET /api/photo-editor/layers : {CHAR_B} demandant la photo de {CHAR_A} est refuse")
    r_croise = CLIENT.get(f"/api/photo-editor/layers?character={CHAR_B}"
                          f"&bucket=OK&space=sfw&name={PHOTO}")
    verifie(r_croise.status_code == 404,
            f"refus explicite (404), jamais la pile de calques ({r_croise.status_code})")

    # =================================== [3] copie : n'ecrit QUE dans l'arbre du demandeur
    print(f"\n[3] POST /api/photo-editor/save (copie) : {CHAR_A} n'ecrit jamais chez {CHAR_B}")
    avant_b = sorted(p.name for p in bucket_b.iterdir())
    layers = [{"id": "base", "name": "Photo", "kind": "photo", "locked": True,
               "settings": {"expo": 12}}]
    r_save = CLIENT.post(f"/api/photo-editor/save?character={CHAR_A}",
                         json={"name": PHOTO, "bucket": "OK", "space": "sfw",
                               "remplacer": False, "layers": layers,
                               "data_base64": FAUX_PNG})
    verifie(r_save.status_code == 200, f"la copie est acceptee ({r_save.status_code} — {r_save.text[:200]})")
    copie = r_save.json().get("name", "")
    verifie(copie.endswith("_edit.png"), f"nom en _edit ({copie!r})")
    verifie((bucket_a / copie).exists(), f"la copie existe dans l'arbre de {CHAR_A}")
    sidecar_copie = bucket_a / f"{Path(copie).stem}.layers.json"
    verifie(sidecar_copie.exists(), "son propre sidecar .layers.json existe aussi")
    verifie(json.loads(sidecar_copie.read_text(encoding="utf-8"))[0]["settings"]["expo"] == 12,
            "le sidecar porte bien le reglage envoye")
    verifie(sorted(p.name for p in bucket_b.iterdir()) == avant_b,
            f"l'arbre de {CHAR_B} est OCTET POUR OCTET inchange")

    # =================================== [4] ecrasement croise : refuse, jamais un fichier touche
    print(f"\n[4] POST /api/photo-editor/save (remplacer) : {CHAR_B} visant la photo de {CHAR_A} echoue")
    avant_a = (bucket_a / PHOTO).read_bytes()
    r_croise_save = CLIENT.post(f"/api/photo-editor/save?character={CHAR_B}",
                                json={"name": PHOTO, "bucket": "OK", "space": "sfw",
                                      "remplacer": True, "layers": layers,
                                      "data_base64": FAUX_PNG})
    verifie(r_croise_save.status_code == 404,
            f"refuse (404), la photo de {CHAR_A} n'existe pas chez {CHAR_B} ({r_croise_save.status_code})")
    verifie((bucket_a / PHOTO).read_bytes() == avant_a,
            f"le fichier de {CHAR_A} n'a pas bouge")

    # =================================== [5] ecrasement legitime : sidecar ecrit au bon endroit
    print(f"\n[5] POST /api/photo-editor/save (remplacer) : {CHAR_A} sur SA propre photo passe")
    r_ok = CLIENT.post(f"/api/photo-editor/save?character={CHAR_A}",
                       json={"name": PHOTO, "bucket": "OK", "space": "sfw",
                             "remplacer": True, "layers": layers,
                             "data_base64": FAUX_PNG})
    verifie(r_ok.status_code == 200, f"acceptee ({r_ok.status_code} — {r_ok.text[:200]})")
    verifie(r_ok.json().get("remplace") is True, "remplace=true dans la reponse")
    sidecar_source = bucket_a / f"{Path(PHOTO).stem}.layers.json"
    verifie(sidecar_source.exists(), "le sidecar de la SOURCE existe desormais")

finally:
    shutil.rmtree(OFM / "CHARACTERS" / CHAR_A, ignore_errors=True)
    shutil.rmtree(OFM / "CHARACTERS" / CHAR_B, ignore_errors=True)
    shutil.rmtree(OFM / "PROD" / CHAR_A.upper(), ignore_errors=True)
    shutil.rmtree(OFM / "PROD" / CHAR_B.upper(), ignore_errors=True)
    # [3] inscrit la copie en base via record_bucket (meme discipline que
    # /api/edit/save, cf. `nettoyer_artefacts_test.py`'s own note) — sans ce
    # nettoyage, la ligne survit aux deux personnages jetables et
    # test_coherence_base [0]/[4] la signalerait ensuite comme parasite.
    with base.ouvrir() as cx:
        cx.execute("DELETE FROM image WHERE character_id IN (?, ?)", (CHAR_A, CHAR_B))
        cx.commit()

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
print("=" * 70)
sys.exit(1 if KO else 0)
