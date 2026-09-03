"""Character-level settings that are neither the NSFW switch (production.py,
older code, ADR-0010) nor a creative override (services/expression.py) — a
small, growing set of platform-capability data written straight onto the
character's own registry file.

No HTTP here: the router catches `ValueError` and decides the status
(`.claude/rules/backend.md`, routers -> services -> runner/shared_state).
"""
import json
import shutil

import runner as lb


def save_appearance(character_id, neutral_hue, neutral_intensity, accent_hue):
    """Writes the character's theme override into `character.json`, key
    `appearance` (Phase 0b, `DOCS/design-pass/phase-0b-theme-utilisateur.md`).

    Same idiom as `arm_nsfw` (`routers/production.py`), the only other route
    that mutates this file: load, mutate, back up to `.json.bak`, write with
    `indent=2`. Only the fields actually given (not None) are kept — and if
    all three are None (the panel's `Reinitialiser`), the whole `appearance`
    key is DROPPED, not left behind as `{}`: absence is what the frontend and
    the design doc both treat as "platform default", not an empty object.
    """
    target = lb.character_json_path(character_id)
    registry = lb.load_character(character_id)

    values = {"neutral_hue": neutral_hue, "neutral_intensity": neutral_intensity,
              "accent_hue": accent_hue}
    kept = {k: v for k, v in values.items() if v is not None}
    if kept:
        registry["appearance"] = kept
    else:
        registry.pop("appearance", None)

    shutil.copy(target, target.with_suffix(".json.bak"))
    target.write_text(json.dumps(registry, ensure_ascii=False, indent=2),
                       encoding="utf-8")
    return kept
