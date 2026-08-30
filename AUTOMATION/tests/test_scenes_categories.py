# -*- coding: utf-8 -*-
"""Les categories de /api/scenes, quand une banque melange les deux formes.

POURQUOI CE TEST EXISTE. `lb.scene_intention()` rend None pour une scene qui ne
declare ni `intention` ni `category` — une banque non migree, ou ecrite a la
main. La ligne qui construit `categories` faisait un `sorted()` nu sur
l'ensemble des intentions : des qu'une banque en melangeait AVEC et SANS,
Python levait

    TypeError: '<' not supported between instances of 'str' and 'NoneType'

et TOUTE la banque sortait en erreur — un 400 « requete invalide », rendu par
le garde d'erreurs qui rattrape TypeError, tres loin de la scene qui l'avait
cause. L'ecran Creer n'avait alors ni scenes, ni cartes, ni taxonomie.
Repere le 30/08/2026 pendant la migration FastAPI ; le bug la precede — la
version aiohttp portait la meme ligne. Jamais declenche en vrai parce que les
deux banques du depot sont homogenes : c'est exactement le genre de piege qui
attend le premier personnage cree a la main.

Ce que ce test verrouille :
  - une banque MIXTE ne plante pas et rend ses categories ;
  - la scene sans intention est representee par `null`, une seule fois ;
  - l'ORDRE des categories nommees ne bouge pas d'un cran par rapport a un
    `sorted()` nu — le correctif ne devait changer que le cas qui plantait ;
  - `meta[].intention` reste `null` pour cette scene, comme avant.

Personnage jetable sous CHARACTERS/ (git-ignore : rien ne fuit dans
l'historique), supprime a la fin.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_scenes_categories.py
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

from api.main import app                      # noqa: E402
from api.routers import bank                  # noqa: E402
from fastapi.testclient import TestClient     # noqa: E402

PROBE = OFM / "CHARACTERS" / "probe-cats"
CID = "probe-cats"
KO = 0

# `base_url` en 127.0.0.1 : sans lui le client envoie `Host: testserver`, que
# le garde d'origine refuse en 403 — a juste titre.
CLIENT = TestClient(app, base_url="http://127.0.0.1")


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def scene(sid, **extra):
    """Une scene minimale valide. `intention` seulement si on la donne."""
    return {"id": sid, "prompt": f"{sid}, a plain room", "format": "4:5",
            "wardrobe": {"0": "a linen shirt"}, "intensity": 0, **extra}


def poser(scenes):
    """Ecrit un personnage jetable avec CETTE banque. Univers reel : c'est le
    seul moyen de passer la validation de `ss.character` sans la contourner."""
    if PROBE.exists():
        shutil.rmtree(PROBE)
    PROBE.mkdir(parents=True)
    (PROBE / "character.json").write_text(json.dumps(
        {"id": CID, "name": "Probe categories",
         "universe": "instagram-influenceur", "type": "instagram-influenceur",
         "output_style": "realiste", "world": "slow-life",
         "content_types": {"image": True}, "nsfw": False},
        ensure_ascii=False, indent=2), encoding="utf-8")
    lena = OFM / "CHARACTERS" / "lena"
    shutil.copy(lena / "config.json", PROBE / "config.json")
    shutil.copy(lena / "creative.json", PROBE / "creative.json")
    (PROBE / "scenes.json").write_text(json.dumps(
        {"prefix": "PROBE", "anchor": "probe anchor", "texture": "probe texture",
         "direction": "", "scenes": scenes},
        ensure_ascii=False, indent=2), encoding="utf-8")


try:
    print("=" * 70)
    print("categories de /api/scenes - banque mixte")
    print("=" * 70)

    # ============================================== [1] le cas qui plantait
    print("\n[1] une banque qui melange scenes avec et sans intention")
    poser([
        scene("avec_voyage", intention="voyage"),
        scene("sans_rien"),                                  # ni intention...
        scene("avec_boudoir", intention="boudoir"),
        scene("sans_rien_non_plus"),                         # ...ni category
        scene("avec_lifestyle", category="lifestyle"),       # repli historique
    ])
    r = CLIENT.get(f"/api/scenes?character={CID}")
    verifie(r.status_code == 200,
            f"la banque mixte est SERVIE, plus rejetee en bloc ({r.status_code})")
    if r.status_code != 200:
        print("        " + r.text[:300])
    d = r.json() if r.status_code == 200 else {}
    cats = d.get("categories")
    verifie(cats == ["boudoir", "lifestyle", "voyage", None],
            f"categories : les nommees dans l'ordre, l'absente en dernier ({cats})")
    verifie(cats is not None and cats.count(None) == 1,
            "l'absence n'apparait QU'UNE fois, meme pour deux scenes")

    # ============================================== [2] l'ordre ne bouge pas
    print("\n[2] le correctif ne change que le cas qui plantait")
    nommees = [c for c in (cats or []) if c is not None]
    verifie(nommees == sorted(nommees),
            f"les categories nommees gardent l'ordre d'un sorted() nu ({nommees})")
    poser([scene("a_voyage", intention="voyage"),
           scene("b_boudoir", intention="boudoir"),
           scene("c_atelier", intention="atelier")])
    r = CLIENT.get(f"/api/scenes?character={CID}")
    homogene = r.json()["categories"]
    verifie(homogene == ["atelier", "boudoir", "voyage"],
            f"banque homogene : ordre inchange, aucun None ({homogene})")

    # ============================================== [3] meta reste coherent
    print("\n[3] meta[].intention dit toujours la verite")
    poser([scene("avec", intention="voyage"), scene("sans")])
    d = CLIENT.get(f"/api/scenes?character={CID}").json()
    verifie(d["meta"]["avec"]["intention"] == "voyage",
            "la scene qui declare une intention la porte")
    verifie(d["meta"]["sans"]["intention"] is None,
            f"celle qui n'en declare pas porte null "
            f"({d['meta']['sans']['intention']!r})")
    verifie(d["scene_ids"] == ["avec", "sans"],
            "les deux scenes sont bien listees, aucune n'est perdue")

    # ============================================== [4] la cle de tri seule
    print("\n[4] la cle de tri, sans passer par HTTP")
    verifie(bank._category_order(None) > bank._category_order("zzz"),
            "l'absence trie apres n'importe quelle intention nommee")
    verifie(bank._category_order("a") < bank._category_order("b"),
            "deux intentions nommees se comparent comme des chaines")
    try:
        sorted({"voyage", None}, key=bank._category_order)
        verifie(True, "sorted() sur un ensemble mixte ne leve plus TypeError")
    except TypeError as e:
        verifie(False, f"TypeError toujours la : {e}")

finally:
    shutil.rmtree(PROBE, ignore_errors=True)

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
sys.exit(1 if KO else 0)
