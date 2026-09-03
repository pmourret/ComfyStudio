# -*- coding: utf-8 -*-
"""Migration : renomme `pipeline` en id de capacite dans CHARACTERS/<id>/creative.json.

ADR-0018 / ROADMAP J8.2. Idempotent : re-lancer ne change rien.

Chaque palier de `creative_seed.intensity` (et, une fois amorce, de
`creative.json` / `intensity`) portait `pipeline` sous une forme prefixee par
famille de modele ('flux', 'flux+edit', 'sdxl', ...) — le symptome exact que
la carte de capacites (ADR-0018) supprime. Regle GENERIQUE, sans nom de
famille en dur : un pipeline qui finit par `+edit` devient la capacite
`"edit"` (universe.EDIT) ; tout le reste devient `"produce"` (universe.PRODUCE)
— ca marche pour n'importe quelle famille presente ou future, la migration
elle-meme ne connait ni « flux » ni « sdxl ».

Remplace aussi, par substitution litterale exacte (pas de regex floue sur la
prose), les mentions `'flux'` / `'flux+edit'` restees dans `_intensity_note`
des fiches reelles — de la documentation, pas une donnee executee, mais
fausse si on la laisse dire l'ancien vocabulaire.

Lancer :  python_embeded\\python.exe AUTOMATION\\tests\\migrate_pipeline_capability_ids.py
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

# Substitutions litterales exactes appliquees a la prose des notes — jamais
# une regex : une note qui ne contient pas EXACTEMENT ces motifs reste
# intacte plutot que d'etre devinee.
_PROSE_SUBSTITUTIONS = (
    ("pipeline 'flux+edit'", "pipeline 'edit'"),
    ("pipeline 'flux'", "pipeline 'produce'"),
    ("pipeline != 'flux+edit'", "pipeline != 'edit'"),
    ("pipeline == 'flux+edit'", "pipeline == 'edit'"),
)


def _new_pipeline(old):
    """Regle generique : suffixe `+edit` -> capacite EDIT, sinon PRODUCE.
    Ne connait aucun nom de famille — c'est justement le point (ADR-0018)."""
    if old in (universe.PRODUCE, universe.EDIT):
        return old                                     # deja migre
    return universe.EDIT if str(old).endswith("+edit") else universe.PRODUCE


def _migrate_prose(text):
    for old, new in _PROSE_SUBSTITUTIONS:
        text = text.replace(old, new)
    return text


def migrate_one(path, dry_run):
    reg = json.loads(path.read_text(encoding="utf-8"))
    cid = path.parent.name
    changed = []

    for tier in reg.get("intensity", []):
        old = tier.get("pipeline")
        new = _new_pipeline(old)
        if new != old:
            tier["pipeline"] = new
            changed.append(f"intensity[{tier.get('level')}].pipeline={old!r}->{new!r}")

    for key in list(reg):
        if key.startswith("_") and isinstance(reg[key], list):
            migrated = [_migrate_prose(line) if isinstance(line, str) else line
                       for line in reg[key]]
            if migrated != reg[key]:
                reg[key] = migrated
                changed.append(f"{key} (prose)")

    if not changed:
        print(f"  {cid} : deja a jour")
        return 0

    if dry_run:
        print(f"  {cid} : + {', '.join(changed)}   (dry-run, rien ecrit)")
        return 1
    path.write_text(json.dumps(reg, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print(f"  {cid} : + {', '.join(changed)}")
    return 1


def main(argv):
    dry_run = "--dry-run" in argv
    if not CHARACTERS.is_dir():
        print(f"aucun CHARACTERS/ sous {OFM} — rien a migrer")
        return 0
    fiches = sorted(CHARACTERS.glob("*/creative.json"))
    if not fiches:
        print("aucun creative.json trouve")
        return 0
    print(f"{'[dry-run] ' if dry_run else ''}migration pipeline -> capacite sur "
          f"{len(fiches)} fiche(s) :")
    touched = sum(migrate_one(p, dry_run) for p in fiches)
    print(f"\n{touched} fiche(s) {'a changer' if dry_run else 'changee(s)'}, "
          f"{len(fiches) - touched} deja a jour.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
