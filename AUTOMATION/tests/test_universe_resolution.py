# -*- coding: utf-8 -*-
"""Resolution du pack : universe.resolve() + UNIVERS/resolution.json (J7bis).

POURQUOI CE TEST EXISTE. L'ADR-0012 pose que l'utilisateur choisit type, style
et monde, et que le pack / famille technique se DEDUIT — jamais choisi a la main.
Le risque exact : (1) un couple (type, style) qui se resout en silence sur le
mauvais pack, donc la mauvaise famille de modele, panne invisible jusqu'a la
premiere generation ; (2) un couple inconnu qui retombe sur un pack par defaut
global au lieu de lever ; (3) une table qui derive de ce que `universe.json`
declare dans `types` sans que rien ne le signale.

Le chemin heureux tourne contre le vrai UNIVERS/ (versionne, toujours present) :
les deux couples reels sont ceux de Lena (instagram-influenceur, realiste) et
d'Abyssiaelle (rpg-personnage, realiste) — ils doivent resoudre exactement sur
leur pack actuel (test de non-regression de l'ADR-0012). Les cas limites
tournent contre un UNIVERS/ jetable (monkeypatch UNIVERS_DIR).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\test_universe_resolution.py
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
sys.path.insert(0, str(AUTOMATION))

import universe  # noqa: E402

KO = 0


def verifie(ok, texte):
    global KO
    print(f"  {'ok   ' if ok else 'ECHEC'} {texte}")
    if not ok:
        KO += 1


def attend(exc, fn, texte):
    try:
        fn()
    except exc as e:
        verifie(True, f"{texte} — {type(e).__name__} lisible ({e})")
    except Exception as e:  # noqa: BLE001
        verifie(False, f"{texte} — type inattendu {type(e).__name__} : {e}")
    else:
        verifie(False, f"{texte} — aucune erreur levee")


# --------------------------------------------------- [1] les couples reels
print("[1] les deux couples reels de V1 resolvent sur leur pack actuel")
verifie(universe.resolve("instagram-influenceur", "realiste") == "instagram-influenceur",
        "(instagram-influenceur, realiste) -> instagram-influenceur  [Lena]")
verifie(universe.resolve("rpg-personnage", "realiste") == "rpg-personnage",
        "(rpg-personnage, realiste) -> rpg-personnage  [Abyssiaelle]")
for style in ("fantastique", "cartoon", "manga"):
    verifie(universe.resolve("rpg-personnage", style) == "rpg-personnage",
            f"(rpg-personnage, {style}) -> rpg-personnage (1-1, meme famille)")

# ---------------------------------------- [1b] non-regression contre character.json
# Si les registres personnels sont presents (git-ignores, absents en checkout
# propre / CI), resolve(type, output_style) doit rendre EXACTEMENT la valeur
# `universe` deja ecrite (ADR-0012 §5 : le pack est deduit, pas renomme).
print("\n[1b] non-regression ADR-0012 : resolve(type, style) == `universe` ecrit")
OFM = AUTOMATION.parent
vus = 0
for cid in ("lena", "abyssiaelle"):
    p = OFM / "CHARACTERS" / cid / "character.json"
    if not p.is_file():
        continue
    vus += 1
    c = json.loads(p.read_text(encoding="utf-8"))
    ctype = c.get("type") or c["universe"]        # repli si registre pas encore migre
    style = c.get("output_style") or "realiste"
    got = universe.resolve(ctype, style)
    verifie(got == c["universe"],
            f"{cid} : resolve(type={ctype!r}, style={style!r}) == "
            f"universe {c['universe']!r}  (got {got!r})")
    verifie(c.get("type") is not None,
            f"{cid} : character.json porte la cle `type` (migration J7bis passee)")
if not vus:
    print("  note  CHARACTERS/ absent — verifie par les valeurs litterales de [1]")

# ------------------------------------ [2] table <-> `types` de universe.json
print("\n[2] chaque type de la table est declare par le pack qu'il resout")
rules, defaults = universe._load_resolution()
for t in sorted({r["type"] for r in rules} | set(defaults)):
    style = next((r["style"] for r in rules if r["type"] == t), None)
    pack = universe.resolve(t, style)
    verifie(t in universe.types(pack),
            f"{t!r} figure dans types({pack!r}) = {universe.types(pack)}")

# --------------------------------------------------- [3] §11 : pas de collision
print("\n[3] deux types distincts ne se resolvent pas sur le meme pack par accident")
verifie(universe.resolve("instagram-influenceur", "realiste")
        != universe.resolve("rpg-personnage", "realiste"),
        "instagram-influenceur et rpg-personnage -> packs distincts")

# --------------------------------------------------- [4] couple inconnu
print("\n[4] un couple sans regle ni default sort en UnresolvedPackError")
attend(universe.UnresolvedPackError,
       lambda: universe.resolve("does-not-exist", "realiste"),
       "type inconnu")
# style inconnu d'un type connu -> default du type (la validite du style est
# controlee ailleurs, par output_styles / style_effect, pas par resolve).
verifie(universe.resolve("rpg-personnage", "style-invente") == "rpg-personnage",
        "(rpg-personnage, style inconnu) -> default du type (rpg-personnage)")

# --------------------------------------------------- [5] types() lit la liste
print("\n[5] types() rend toujours une liste")
for uid in ("instagram-influenceur", "rpg-personnage"):
    ts = universe.types(uid)
    verifie(isinstance(ts, list) and ts == [uid],
            f"types({uid!r}) == [{uid!r}]  (obtenu {ts})")

# --------------------------------------------------- [6] registre jetable
print("\n[6] cas limites sur un UNIVERS/ jetable")
_vrai = universe.UNIVERS_DIR
_tmp = Path(tempfile.mkdtemp(prefix="resolution_test_"))
try:
    universe.UNIVERS_DIR = _tmp
    attend(universe.UnresolvedPackError,
           lambda: universe.resolve("x", "y"),
           "resolution.json absent")

    (_tmp / "resolution.json").write_text("{ pas du json", encoding="utf-8")
    attend(ValueError,
           lambda: universe.resolve("x", "y"),
           "resolution.json casse")

    # regle qui pointe un pack sans dossier -> UnresolvedPackError, pas un pack fantome
    (_tmp / "resolution.json").write_text(
        json.dumps({"rules": [{"type": "ghost", "style": "s", "pack": "ghost"}],
                    "defaults": {}}), encoding="utf-8")
    attend(universe.UnresolvedPackError,
           lambda: universe.resolve("ghost", "s"),
           "regle -> pack sans dossier UNIVERS/ghost/")

    # default qui pointe un pack reel absent du registre jetable -> idem
    (_tmp / "resolution.json").write_text(
        json.dumps({"rules": [], "defaults": {"t": "instagram-influenceur"}}),
        encoding="utf-8")
    attend(universe.UnresolvedPackError,
           lambda: universe.resolve("t", "any"),
           "default -> pack absent du registre courant")
finally:
    universe.UNIVERS_DIR = _vrai
    shutil.rmtree(_tmp, ignore_errors=True)

print("\n" + "=" * 70)
print("tout est vert" if not KO else f"{KO} ECHEC(S)")
print("=" * 70)
sys.exit(1 if KO else 0)
