"""Rules of the world catalog: what a save of `places` may contain.

Reduced mirror of `services/bank.py`'s `validate_scene_bank` — a catalog has
no previous-version comparison (no batch-erasure guard) because losing a
place in a save is not the incident a scene bank has: a place is a shared
frame, not per-character creative metadata that can vanish unnoticed under a
frontend rebuild.

No HTTP here: the router catches the returned problems and decides the
status (`.claude/rules/backend.md`, routers -> services -> worlds).
"""
import worlds


def validate_places(data):
    """Returns the list of a places payload's problems. Empty list = good.

    Mirrors the checks `worlds.places()` already runs on load (no
    CHARACTER_ONLY_SCENE_KEYS, ADR-0014 §2) plus what a WRITE needs that a
    read does not: unique, non-empty ids, and a non-empty prompt — an empty
    one would make `merge_scene()` hand back a scene `validate_scene_bank`
    refuses far from the world screen that caused it.
    """
    if not isinstance(data, list):
        return ["« places » doit être une liste"]
    problems = []
    seen = set()
    for i, p in enumerate(data):
        if not isinstance(p, dict):
            problems.append(f"lieu #{i + 1} : ce n'est pas un objet")
            continue
        pid = str(p.get("id") or "").strip()
        where = pid or f"lieu #{i + 1}"
        if not pid:
            problems.append(f"{where} : « id » manquant")
        elif pid in seen:
            problems.append(f"{where} : identifiant en double")
        seen.add(pid)
        if not str(p.get("prompt") or "").strip():
            problems.append(f"{where} : « prompt » vide")
        intrus = [k for k in worlds.CHARACTER_ONLY_SCENE_KEYS if k in p]
        if intrus:
            problems.append(f"{where} : {', '.join(intrus)} — un catalogue de "
                            f"monde n'habille pas ses lieux, ces réglages "
                            f"appartiennent au personnage (ADR-0014)")
    return problems
