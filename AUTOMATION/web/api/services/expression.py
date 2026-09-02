"""Facial expression editor: a tone's saved range, and a non-destructive
preview render.

No HTTP here: the router catches the raised problems and decides the status
(`.claude/rules/backend.md`, routers -> services -> runner/shared_state).
"""
import json

import expression
import runner as lb
import shared_state as ss

from .bank import rotate_backup


def save_tone_expression(character_id, tone_key, params):
    """Replaces ONE tone's `expression` range in creative.json, in place.

    `params` is the dict of INCLUDED parameters only — `{"smile": (0.1,
    0.35), ...}` — a parameter left out simply stops being posed for this
    tone (`expression.tirage()` already treats an absent key that way).

    Raises `ValueError` if the tone does not exist: this route never creates
    one — tones themselves stay hand-authored, only their expression range is
    edited here.
    """
    creative = lb.load_creative(character_id)
    tone = lb.by_key(creative.get("tones", []), tone_key)
    if tone is None:
        raise ValueError(f"ton inconnu : {tone_key!r}")
    tone["expression"] = params
    target = lb.creative_path(character_id)
    rotate_backup(target)
    target.write_text(json.dumps(creative, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_photo(character_id, bucket, space, name):
    """Resolves an already-produced photo through `bucket_dir` — the same
    character-scoped resolution `/img` uses — never a raw path sent by the
    client. Kept separate from `render_expression_preview` so the router can
    reject a photo that does not belong to this character (character
    isolation) BEFORE ever asking whether ComfyUI is reachable — the two
    checks answer unrelated questions and a slow/offline ComfyUI must never
    mask a cross-character leak in the response the caller sees."""
    path = ss.bucket_dir(bucket, space, character_id) / name
    if not path.is_file():
        raise FileNotFoundError(f"photo introuvable : {name!r}")
    return path


def render_expression_preview(character_id, path, params):
    """Renders `params` (ExpressionEditor's 12 floats, a single trial value
    each — never a range) onto `path` (from `resolve_photo`), without ever
    touching that photo. Returns (png_bytes, score_apres)."""
    configuration = ss.cfg(character_id)
    checker = ss.checker_partage(configuration)
    return expression.apercu(
        path, params, configuration["comfy_url"],
        mesurer=lambda p: checker.mesure(p)["score"])
