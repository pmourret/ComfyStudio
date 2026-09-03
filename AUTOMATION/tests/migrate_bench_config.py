# -*- coding: utf-8 -*-
"""Migration : ajoute `bench` (min_seeds/margin) a chaque CHARACTERS/<id>/config.json.

J8.5, ADR-0021, invariant 4. Idempotent : re-lancer ne change rien.

Sans cette section, `bench.verdict_bench()` refuse explicitement plutot que
deviner une constante Python (invariant 4 : aucun seuil en dur) — ce script
est ce qui rend un personnage EXISTANT capable de lancer un banc, en reprenant
le gabarit `bench` du pack (`PACKS/<pack>/character_defaults.json`,
`measured: false` — a recalibrer, meme statut que `qc`/`identity`).

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\migrate_bench_config.py
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

CHARACTERS = OFM / "CHARACTERS"


def migrate_one(path, dry_run):
    cfg = json.loads(path.read_text(encoding="utf-8"))
    cid = path.parent.name
    if "bench" in cfg:
        print(f"  {cid} : deja a jour")
        return 0

    character = json.loads((path.parent / "character.json").read_text(encoding="utf-8"))
    pack = character.get("universe")
    if not pack or not universe.exists(pack):
        print(f"  {cid} : pack {pack!r} inconnu — ignore")
        return 1

    defaults = universe.load_character_defaults(pack)
    gabarit = defaults.get("bench")
    if not gabarit:
        print(f"  {cid} : le pack {pack!r} n'a pas encore de gabarit `bench` "
              f"dans character_defaults.json — ignore")
        return 1

    cfg["bench"] = dict(gabarit)
    if dry_run:
        print(f"  {cid} : + bench (min_seeds={cfg['bench'].get('min_seeds')}) "
              f"(dry-run, rien ecrit)")
        return 0
    path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  {cid} : + bench (min_seeds={cfg['bench'].get('min_seeds')})")
    return 0


def main(argv):
    dry_run = "--dry-run" in argv
    if not CHARACTERS.is_dir():
        print(f"aucun CHARACTERS/ sous {OFM} — rien a migrer")
        return 0
    fiches = sorted(CHARACTERS.glob("*/config.json"))
    if not fiches:
        print("aucun config.json trouve")
        return 0
    print(f"{'[dry-run] ' if dry_run else ''}migration bench sur {len(fiches)} fiche(s) :")
    ko = sum(migrate_one(p, dry_run) for p in fiches)
    print(f"\n{ko} personnage(s) en erreur" if ko else "\ntermine")
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
