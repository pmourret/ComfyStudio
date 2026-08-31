# -*- coding: utf-8 -*-
"""Garde serveur sur la banque de scenes (api.services.bank.validate_scene_bank).

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

from api.services import bank  # noqa: E402

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
print("validate_scene_bank - tests")
print("=" * 70)

print("\n[1] la banque du depot passe")
pbs = bank.validate_scene_bank(BANQUE, previous=BANQUE)
verifie(not pbs, f"aucun probleme sur scenes.json ({len(BANQUE['scenes'])} scenes)")
if pbs:
    for p in pbs[:5]:
        print("        " + p)

print("\n[2] forme : ce qui casserait la production plus tard")
for cle in ("prefix", "anchor", "texture"):
    verifie(any(cle in p for p in bank.validate_scene_bank(sans(cle))),
            f"champ racine « {cle} » manquant : refuse")
verifie(any("format inconnu" in p for p in bank.validate_scene_bank(avec("format", "16:9"))),
        "format hors liste : refuse")
verifie(any("prompt" in p for p in bank.validate_scene_bank(avec("prompt", "   "))),
        "prompt vide : refuse")
verifie(any("intensity" in p for p in bank.validate_scene_bank(avec("intensity", [2, 1]))),
        "bande d'intensite decroissante : refusee")
verifie(any("intensity" in p for p in bank.validate_scene_bank(avec("intensity", [0, 1, 2]))),
        "bande a trois valeurs : refusee")
verifie(any("intensity" in p for p in bank.validate_scene_bank(avec("intensity", ["0", "1"]))),
        "bande en chaines de caracteres : refusee")
verifie(any("num" in p for p in bank.validate_scene_bank(avec("wardrobe", {"zero": "a shirt"}))),
        "niveau de tenue non numerique : refuse")
verifie(any("ni texte ni liste" in p
            for p in bank.validate_scene_bank(avec("wardrobe", {"0": 42}))),
        "tenue qui n'est ni texte ni liste : refusee")

doublon = copy.deepcopy(BANQUE)
doublon["scenes"][1]["id"] = doublon["scenes"][0]["id"]
verifie(any("double" in p for p in bank.validate_scene_bank(doublon)),
        "deux scenes du meme identifiant : refuse")

vide = copy.deepcopy(BANQUE)
vide["scenes"] = []
verifie(any("liste non vide" in p for p in bank.validate_scene_bank(vide)),
        "banque sans aucune scene : refusee")

print("\n[3] LE cas du 25/08/2026 : l'effacement en lot")
abimee = copy.deepcopy(BANQUE)
for s in abimee["scenes"]:
    for c in bank.WATCHED_KEYS:
        s.pop(c, None)
pbs = bank.validate_scene_bank(abimee, previous=BANQUE)
verifie(any("d'un seul coup" in p for p in pbs),
        "la sauvegarde qui a detruit la banque est refusee")

print("\n[4] mais une edition humaine normale passe")
verifie(not bank.validate_scene_bank(sans("tags", ou=0), previous=BANQUE),
        "vider les tags d'UNE scene reste permis")
deux = copy.deepcopy(BANQUE)
deux["scenes"][0].pop("tags")
deux["scenes"][1].pop("tones")
verifie(any("d'un seul coup" in p for p in bank.validate_scene_bank(deux, previous=BANQUE)),
        "deux scenes amputees dans la meme sauvegarde : refuse")
verifie(not bank.validate_scene_bank(deux, previous=BANQUE, allow_losses=True),
        "sauf si l'appelant assume explicitement la perte")

print("\n[5] une scene NEUVE n'est pas une perte")
neuve = copy.deepcopy(BANQUE)
neuve["scenes"].append({"id": "toute_neuve", "category": "lifestyle",
                        "format": "4:5", "count": 1, "prompt": "a new scene"})
verifie(not bank.validate_scene_bank(neuve, previous=BANQUE),
        "une scene ajoutee sans metadonnees est acceptee")

print("\n[6] le verrou de monde (ADR-0014)")
# LA question de cette section : une scene peut-elle entrer dans la banque d'un
# personnage dont elle ne partage pas le monde. Le monde est fige a la creation
# (ADR-0012 §4) parce que ses assets entrent dans le rendu ET dans la mesure du
# verrou d'identite ; une scene venue d'ailleurs fait passer ce gel par la
# fenetre, sans rien casser de visible sur le moment.
MONDE = BANQUE["world"]
ETRANGER = "terres-sauvages" if MONDE != "terres-sauvages" else "slow-life"

# Sans `world` passe en argument, seule la forme est jugee : un appelant sans
# contexte de personnage (script, test de forme) garde l'ancien comportement.
verifie(not bank.validate_scene_bank(sans("world")),
        "sans monde passe en argument : le verrou dort, la forme seule est jugee")

pbs = bank.validate_scene_bank(sans("world"), world=MONDE)
verifie(any("racine" in p for p in pbs),
        "banque sans « world » a la racine : refusee")

etrangere = copy.deepcopy(BANQUE)
etrangere["world"] = ETRANGER
pbs = bank.validate_scene_bank(etrangere, world=MONDE)
verifie(any(ETRANGER in p and MONDE in p for p in pbs),
        "banque estampillee d'un AUTRE monde : refusee, les deux mondes nommes")

# LE cas reel : le fichier reste bon, une seule ligne ment.
collee = copy.deepcopy(BANQUE)
collee["scenes"][1]["world"] = ETRANGER
pbs = bank.validate_scene_bank(collee, previous=BANQUE, world=MONDE)
verifie(any(collee["scenes"][1]["id"] in p and ETRANGER in p for p in pbs),
        "UNE scene collee depuis une autre banque : refusee, la scene nommee")

perdue = copy.deepcopy(BANQUE)
perdue["scenes"][0].pop("world")
pbs = bank.validate_scene_bank(perdue, previous=BANQUE, world=MONDE)
verifie(any(perdue["scenes"][0]["id"] in p and "world" in p for p in pbs),
        "une scene EXISTANTE qui perd son tampon : refusee")

print("\n[7] la seule tolerance, et elle est bornee : la scene qui NAIT")
# Le Dashboard construit une scene neuve dans le navigateur ; il ne connait pas
# le monde. Elle est acceptee sans tampon, et c'est stamp_world qui l'ecrit
# avant le disque — rien d'untague n'atteint jamais scenes.json.
neuve = copy.deepcopy(BANQUE)
neuve["scenes"].append({"id": "nee_ici", "format": "4:5", "count": 1,
                        "prompt": "a scene born in this very save"})
verifie(not bank.validate_scene_bank(neuve, previous=BANQUE, world=MONDE),
        "une scene NEUVE sans tampon : acceptee, elle nait")
avant_origine = BANQUE["scenes"][0].get("origin")
bank.stamp_world(neuve, MONDE)
verifie(all(s.get("world") == MONDE for s in neuve["scenes"]),
        "stamp_world : elle atteint le disque tamponnee, jamais nue")
verifie(neuve["scenes"][-1].get("origin") == "manual"
        and neuve["scenes"][0].get("origin") == avant_origine,
        "stamp_world ne remplit que ce qui MANQUE, il n'ecrase rien")

# Naitre n'autorise pas a mentir.
intruse = copy.deepcopy(BANQUE)
intruse["scenes"].append({"id": "nee_ailleurs", "world": ETRANGER,
                          "format": "4:5", "count": 1, "prompt": "from elsewhere"})
verifie(any("nee_ailleurs" in p for p in
            bank.validate_scene_bank(intruse, previous=BANQUE, world=MONDE)),
        "une scene neuve au monde ETRANGER : refusee quand meme")

origine = copy.deepcopy(BANQUE)
origine["scenes"][0]["origin"] = "importee"
verifie(any("origine inconnue" in p for p in
            bank.validate_scene_bank(origine, previous=BANQUE, world=MONDE)),
        "une origine hors vocabulaire : refusee")

print("\n[8] deux personnages ne se melangent pas")
# Le test que CLAUDE.md §11 demande : celui qui aurait vu la banque d'un
# personnage enregistree sur un autre.
AUTRE_PATH = OFM / "CHARACTERS" / "abyssiaelle" / "scenes.json"
if AUTRE_PATH.exists():
    AUTRE = json.loads(AUTRE_PATH.read_text(encoding="utf-8"))
    verifie(bool(bank.validate_scene_bank(AUTRE, world=MONDE)),
            "la banque d'abyssiaelle enregistree sur lena : refusee")
    verifie(not bank.validate_scene_bank(AUTRE, world=AUTRE.get("world")),
            "... et la meme banque sur SON personnage : acceptee")
else:
    print("  (abyssiaelle absente de ce poste — croisement non joue)")

print()
print("=" * 70)
print(f"{KO} ECHEC(S)" if KO else "tout est vert")
sys.exit(1 if KO else 0)
