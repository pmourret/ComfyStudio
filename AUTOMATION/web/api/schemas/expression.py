"""Payload shapes of the facial expression editor.

The 12 fields mirror ComfyUI's `ExpressionEditor` node
(comfyui-advancedliveportrait) 1:1 — `expression.BORNES` is the source of
truth for the bounds, validated HERE rather than silently clamped: the clamp
inside `expression.tirage()` exists for a random draw, a human moving a
slider should see a rejection, not a silent correction.
"""
from typing import Optional

from pydantic import BaseModel, field_validator

import expression as _expression

_PARAM_NAMES = tuple(_expression.BORNES)


class ExpressionParams(BaseModel):
    """One trial value per parameter — what the live preview renders."""

    smile: Optional[float] = None
    aaa: Optional[float] = None
    eee: Optional[float] = None
    woo: Optional[float] = None
    blink: Optional[float] = None
    wink: Optional[float] = None
    eyebrow: Optional[float] = None
    pupil_x: Optional[float] = None
    pupil_y: Optional[float] = None
    rotate_pitch: Optional[float] = None
    rotate_yaw: Optional[float] = None
    rotate_roll: Optional[float] = None

    @field_validator(*_PARAM_NAMES)
    @classmethod
    def _within_bounds(cls, v, info):
        if v is None:
            return v
        lo, hi = _expression.BORNES[info.field_name]
        if not (lo <= v <= hi):
            raise ValueError(f"{info.field_name} hors bornes [{lo}, {hi}] : {v}")
        return v


class ExpressionRangeParams(BaseModel):
    """A [min, max] pair per parameter — what a tone saves. Only the
    INCLUDED parameters are sent; the rest stay unset (None), and drop out of
    the tone entirely (`ExpressionToneSaveRequest.params.model_dump
    (exclude_none=True)`)."""

    smile: Optional[tuple[float, float]] = None
    aaa: Optional[tuple[float, float]] = None
    eee: Optional[tuple[float, float]] = None
    woo: Optional[tuple[float, float]] = None
    blink: Optional[tuple[float, float]] = None
    wink: Optional[tuple[float, float]] = None
    eyebrow: Optional[tuple[float, float]] = None
    pupil_x: Optional[tuple[float, float]] = None
    pupil_y: Optional[tuple[float, float]] = None
    rotate_pitch: Optional[tuple[float, float]] = None
    rotate_yaw: Optional[tuple[float, float]] = None
    rotate_roll: Optional[tuple[float, float]] = None

    @field_validator(*_PARAM_NAMES)
    @classmethod
    def _valid_range(cls, v, info):
        if v is None:
            return v
        lo, hi = v
        blo, bhi = _expression.BORNES[info.field_name]
        if lo > hi:
            raise ValueError(f"{info.field_name} : minimum > maximum ({lo} > {hi})")
        if not (blo <= lo <= bhi) or not (blo <= hi <= bhi):
            raise ValueError(f"{info.field_name} hors bornes [{blo}, {bhi}]")
        return v


class ExpressionPreviewRequest(BaseModel):
    bucket: str
    space: str
    name: str
    params: ExpressionParams


class ExpressionToneSaveRequest(BaseModel):
    tone: str
    params: ExpressionRangeParams
