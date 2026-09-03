# -*- coding: utf-8 -*-
"""Migration : ajoute `type` et `world` a chaque CHARACTERS/<id>/character.json.

ADR-0012 / ROADMAP J7bis. Idempotent : re-lancer ne change rien.

  - `type` : le type de personnage (metier, panel d'outils). En V1 la relation
    type -> pack est 1-1, donc `type` recoit la valeur actuelle de `universe`.
  - `world` : le monde (cadre + assets de monde). Un seul monde par famille de
    modele en V1, donc worlds.worlds_for_family(model_family(pack)) est sans
    ambiguite ; sinon le script s'arrete et demande un choix explicite.

Le champ `universe` est CONSERVE : il porte le pack resolu (ADR-0012 §5). Aucune
valeur n'est renommee.

Verifie avant d'ecrire : universe.resolve(type, output_style) == universe (le
test de non-regression de l'ADR-0012), et world compatible avec la famille.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\migrate_character_type_world.py
          ... --dry-run     montre ce qui changerait, n'ecrit rien
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import universe  # noqa: E402
import worlds    # noqa: E402

CHARACTERS = OFM / "CHARACTERS"
_NOTE_MARK = "type / world :"
_NOTE = (
    "type / world : ajoutes par migrate_character_type_world.py (ADR-0012, "
    "J7bis). type et world sont figes a la creation, au meme titre que "
    "output_style ; world doit etre compatible avec la famille du pack. Le "
    "pack lui-meme reste dans `universe`, il n'est pas choisi mais deduit de "
    "(type, output_style) via PACKS/resolution.json.")

_KEYS_AFTER_UNIVERSE = ("type", "world")


def _choose_world(pack):
    family = universe.model_family(pack)
    candidates = worlds.worlds_for_family(family)
    if len(candidates) == 1:
        return candidates[0]
    raise SystemExit(
        f"famille {family!r} du pack {pack!r} : {len(candidates)} mondes "
        f"candidats ({candidates or 'aucun'}) — choix manuel requis, la "
        f"migration ne devine pas.")


def _reordered(reg):
    """Meme contenu, avec type/world juste apres universe (lisibilite)."""
    out = {}
    for k, v in reg.items():
        if k in _KEYS_AFTER_UNIVERSE:
            continue
        out[k] = v
        if k == "universe":
            for kk in _KEYS_AFTER_UNIVERSE:
                out[kk] = reg[kk]
    return out


def migrate_one(path, dry_run):
    reg = json.loads(path.read_text(encoding="utf-8"))
    cid = reg.get("id", path.parent.name)
    uid = reg.get("universe")
    style = reg.get("output_style") or "realiste"

    if not universe.exists(uid):
        print(f"  {cid} : univers {uid!r} inconnu — ignore")
        return 0

    ctype = reg.get("type") or uid
    try:
        pack = universe.resolve(ctype, style)
    except universe.UnresolvedPackError as e:
        raise SystemExit(f"{cid} : {e}")
    if pack != uid:
        raise SystemExit(
            f"{cid} : resolve(type={ctype!r}, style={style!r}) = {pack!r} != "
            f"universe {uid!r} — incoherence, migration refusee.")

    changed = []
    if "type" not in reg:
        reg["type"] = ctype
        changed.append(f"type={ctype!r}")
    if "world" not in reg:
        w = _choose_world(pack)
        reg["world"] = w
        changed.append(f"world={w!r}")
    if isinstance(reg.get("_notes"), list) \
            and not any(_NOTE_MARK in n for n in reg["_notes"]):
        reg["_notes"].append(_NOTE)
        changed.append("_notes")

    if not changed:
        print(f"  {cid} : deja a jour")
        return 0

    # non-regression avant ecriture
    assert universe.resolve(reg["type"], style) == uid, cid
    assert worlds.is_compatible(reg["world"], universe.model_family(pack)), cid

    if dry_run:
        print(f"  {cid} : + {', '.join(changed)}   (dry-run, rien ecrit)")
        return 1
    path.write_text(json.dumps(_reordered(reg), ensure_ascii=False, indent=2)
                    + "\n", encoding="utf-8")
    print(f"  {cid} : + {', '.join(changed)}")
    return 1


def main(argv):
    dry_run = "--dry-run" in argv
    if not CHARACTERS.is_dir():
        print(f"aucun CHARACTERS/ sous {OFM} — rien a migrer")
        return 0
    fiches = sorted(CHARACTERS.glob("*/character.json"))
    if not fiches:
        print("aucun character.json trouve")
        return 0
    print(f"{'[dry-run] ' if dry_run else ''}migration type/world sur "
          f"{len(fiches)} fiche(s) :")
    touched = sum(migrate_one(p, dry_run) for p in fiches)
    print(f"\n{touched} fiche(s) {'a changer' if dry_run else 'changee(s)'}, "
          f"{len(fiches) - touched} deja a jour.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
