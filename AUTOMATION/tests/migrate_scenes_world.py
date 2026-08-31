# -*- coding: utf-8 -*-
"""Migration : tamponne `world` (et `origin`) dans CHARACTERS/<id>/scenes.json.

ADR-0014. Idempotent : re-lancer ne change rien.

  - racine : `world` = le monde declare par character.json (deja fige, ADR-0012).
  - chaque scene : `world` = le meme, et `origin` = "manual" par defaut. Les
    scenes existantes sont anterieures a la notion d'amorce de monde ; les dire
    "world" serait affirmer une provenance qu'on n'a pas.

Ce script existe parce que /api/scenes est STRICT depuis l'ADR-0014 : une
banque sans tampon est refusee, elle n'est pas reparee au vol. Une seule
migration, puis la regle tient toute seule.

L'ASSEMBLAGE DU PROMPT NE BOUGE PAS : `world` et `origin` sont des cles de
provenance, build_jobs ne les lit pas. Le script le VERIFIE avant d'ecrire, en
comparant les jobs produits avant et apres sur la banque en memoire.

Lancer :  python_embeded\python.exe AUTOMATION\tests\migrate_scenes_world.py
          ... --dry-run     montre ce qui changerait, n'ecrit rien
"""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
AUTOMATION = HERE.parent
OFM = AUTOMATION.parent
sys.path.insert(0, str(AUTOMATION))

import runner as lb  # noqa: E402
import worlds        # noqa: E402

CHARACTERS = OFM / "CHARACTERS"


def _jobs(path, cid):
    """Jobs du palier 0, tels que build_jobs les rend aujourd'hui."""
    # Memes filtres que tests/test_build_jobs.py : c'est le lancement de
    # reference, celui que le test a l'octet pres verrouille.
    args = SimpleNamespace(scene=None, category=None, format=None, count=None,
                           limit=None, seed=1234, no_variants=False)
    return lb.build_jobs(path, args, character_id=cid)


def migrate(cid, dry_run):
    path = lb.scenes_path(cid)
    if not path.is_file():
        print(f"  {cid} : pas de scenes.json — ignore")
        return 0
    world = lb.character_world(cid)
    if not world:
        print(f"  {cid} : character.json ne declare aucun `world` — lancer "
              f"migrate_character_type_world.py d'abord")
        return 1
    if not worlds.exists(world):
        print(f"  {cid} : monde inconnu {world!r}")
        return 1

    avant = _jobs(path, cid)
    data = json.loads(path.read_text(encoding="utf-8"))

    touche = []
    if data.get("world") != world:
        touche.append("racine")
    data["world"] = world
    for s in data.get("scenes", []):
        if not isinstance(s, dict):
            continue
        if s.get("world") != world:
            touche.append(s.get("id", "?"))
        s["world"] = world
        s.setdefault("origin", "manual")

    if not touche:
        print(f"  {cid} : deja tamponne ({world}) — rien a faire")
        return 0

    # Garde-fou a l'octet pres : la migration ajoute des cles de provenance,
    # elle ne touche pas au prompt. Verifie sur la banque EN MEMOIRE avant que
    # quoi que ce soit n'atteigne le disque.
    tmp = path.with_suffix(".json.migration-check")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        apres = _jobs(tmp, cid)
    finally:
        tmp.unlink(missing_ok=True)
    if [j["prompt"] for j in avant] != [j["prompt"] for j in apres]:
        print(f"  {cid} : ABANDON — l'assemblage du prompt change, ce que cette "
              f"migration ne doit jamais faire")
        return 1

    print(f"  {cid} : monde {world!r} tamponne sur {len(touche)} element(s) "
          f"— {', '.join(touche[:6])}{' …' if len(touche) > 6 else ''}")
    if dry_run:
        return 0
    path.with_suffix(".json.avant-world.bak").write_text(
        json.dumps(json.loads(path.read_text(encoding="utf-8")),
                   ensure_ascii=False, indent=2), encoding="utf-8")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


def main():
    dry_run = "--dry-run" in sys.argv
    print("=" * 72)
    print("migration : tampon de monde sur les banques de scenes (ADR-0014)"
          + ("   [DRY RUN]" if dry_run else ""))
    print("=" * 72)
    if not CHARACTERS.is_dir():
        print(f"aucun personnage sur ce poste ({CHARACTERS} absent) — rien a migrer")
        return 0
    ko = 0
    for d in sorted(p for p in CHARACTERS.iterdir() if p.is_dir()):
        ko += migrate(d.name, dry_run)
    print()
    print(f"{ko} personnage(s) en erreur" if ko else "tout est tamponne")
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main())
