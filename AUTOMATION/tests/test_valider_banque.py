# -*- coding: utf-8 -*-
"""Garde serveur sur la banque de scenes (app.valider_banque).

POURQUOI CE TEST EXISTE. Le 25/08/2026, /api/scenes ne verifiait que deux choses :
que `scenes` etait une liste, et que `anchor` n'etait pas vide. Une reconstruction
cote interface a donc pu ecrire une banque amputee de `wardrobe`, `intensity`,
`tags`, `tones` et `intention` sur les 16 scenes, sans que rien ne l'arrete. Le
front a ete corrige, mais un front n'est pas un garde-fou : c'est ici que la
regle doit vivre.

Deux familles de controles :
  - la forme, pour refuser ce qui casserait la production PLUS TARD et sans
    rapport apparent (sans `prefix`/`texture`, build_jobs leve un KeyError et
    /api/plan rend un 500, tres loin de la sauvegarde qui l'a cause) ;
  - la perte en LOT, qui est la signature du bug : vider une scene est une
    edition, en vider seize n'est jamais une intention.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_valider_banque.py
(il faut le python embarque : app.py importe aiohttp)
"""
import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OFM = HERE.parents[1]
sys.path.insert(0, str(OFM / "AUTOMATION" / "web"))
sys.path.insert(0, str(OFM / "AUTOMATION"))

import app  # noqa: E402

BANQUE = json.loads((OFM / "CHARACTERS" / "lena" / "scenes.json").read_text(encoding="utf-8"))

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok  ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def sans(cle, ou=None):
    """Copie de la banque privee d'une cle, a la racine ou dans une scene."""
    d = copy.deepcopy(BANQUE)
    if ou is None:
        d.pop(cle, None)
    else:
        d["scenes"][ou].pop(cle, None)
    return d


def avec(champ, valeur, ou=0):
    d = copy.deepcopy(BANQUE)
    d["scenes"][ou][champ] = valeur
    return d


print("=" * 70)
print("valider_banque - tests")
print("=" * 70)

print("\n[1] la banque du depot passe")
pbs = app.valider_banque(BANQUE, ancienne=BANQUE)
verifie(not pbs, f"aucun probleme sur scenes.json ({len(BANQUE['scenes'])} scenes)")
if pbs:
    for p in pbs[:5]:
        print("        " + p)

print("\n[2] forme : ce qui casserait la production plus tard")
for cle in ("prefix", "anchor", "texture"):
    verifie(any(cle in p for p in app.valider_banque(sans(cle))),
            f"champ racine « {cle} » manquant : refuse")
verifie(any("format inconnu" in p for p in app.valider_banque(avec("format", "16:9"))),
        "format hors liste : refuse")
verifie(any("prompt" in p for p in app.valider_banque(avec("prompt", "   "))),
        "prompt vide : refuse")
verifie(any("intensity" in p for p in app.valider_banque(avec("intensity", [2, 1]))),
        "bande d'intensite decroissante : refusee")
verifie(any("intensity" in p for p in app.valider_banque(avec("intensity", [0, 1, 2]))),
        "bande a trois valeurs : refusee")
verifie(any("intensity" in p for p in app.valider_banque(avec("intensity", ["0", "1"]))),
        "bande en chaines de caracteres : refusee")
verifie(any("num" in p for p in app.valider_banque(avec("wardrobe", {"zero": "a shirt"}))),
        "niveau de tenue non numerique : refuse")
verifie(any("ni texte ni liste" in p
            for p in app.valider_banque(avec("wardrobe", {"0": 42}))),
        "tenue qui n'est ni texte ni liste : refusee")

doublon = copy.deepcopy(BANQUE)
doublon["scenes"][1]["id"] = doublon["scenes"][0]["id"]
verifie(any("double" in p for p in app.valider_banque(doublon)),
        "deux scenes du meme identifiant : refuse")

vide = copy.deepcopy(BANQUE)
vide["scenes"] = []
verifie(any("liste non vide" in p for p in app.valider_banque(vide)),
        "banque sans aucune scene : refusee")

print("\n[3] LE cas du 25/08/2026 : l'effacement en lot")
abimee = copy.deepcopy(BANQUE)
for s in abimee["scenes"]:
    for c in app.CLES_SURVEILLEES:
        s.pop(c, None)
pbs = app.valider_banque(abimee, ancienne=BANQUE)
verifie(any("d'un seul coup" in p for p in pbs),
        "la sauvegarde qui a detruit la banque est refusee")

print("\n[4] mais une edition humaine normale passe")
verifie(not app.valider_banque(sans("tags", ou=0), ancienne=BANQUE),
        "vider les tags d'UNE scene reste permis")
deux = copy.deepcopy(BANQUE)
deux["scenes"][0].pop("tags")
deux["scenes"][1].pop("tones")
verifie(any("d'un seul coup" in p for p in app.valider_banque(deux, ancienne=BANQUE)),
        "deux scenes amputees dans la meme sauvegarde : refuse")
verifie(not app.valider_banque(deux, ancienne=BANQUE, autoriser_pertes=True),
        "sauf si l'appelant assume explicitement la perte")

print("\n[5] une scene NEUVE n'est pas une perte")
neuve = copy.deepcopy(BANQUE)
neuve["scenes"].append({"id": "toute_neuve", "category": "lifestyle",
                        "format": "4:5", "count": 1, "prompt": "a new scene"})
verifie(not app.valider_banque(neuve, ancienne=BANQUE),
        "une scene ajoutee sans metadonnees est acceptee")

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
sys.exit(1 if KO else 0)
