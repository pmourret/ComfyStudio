"""Payload shapes of the advanced (Lightroom-style) photo editor.

`LayerSettings` covers ONLY what this pass implements client-side — the 4
basic sliders (`expo`/`contrast`/`sat`/`temp`, same 4 fields and bounds as
`PhotoEditor.tsx`'s own `SLIDERS`, renamed `bright` -> `expo` per the
design-pass `Layer` shape). Curves/levels/HSL/sharpen/blur/perspective are
NOT fields here yet: they land with their own step, and Pydantic's default
`extra="ignore"` on both models means an older sidecar missing tomorrow's
fields, or a request that does not send them, never fails validation — no
migration needed when the shape grows.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

LayerKind = Literal["photo", "reglage", "image", "retouche"]


class LayerSettings(BaseModel):
    """Bounds copied from `photoEditorPixels.ts`'s own `SLIDERS` — the same
    4 adjustments, so a value the client's own slider could never produce
    is rejected here too, rather than silently clamped."""

    expo: float = 0
    contrast: float = 0
    sat: float = 0
    temp: float = 0

    @field_validator("expo", "contrast")
    @classmethod
    def _bounds_60(cls, v):
        if not (-60 <= v <= 60):
            raise ValueError(f"hors bornes [-60, 60] : {v}")
        return v

    @field_validator("sat")
    @classmethod
    def _bounds_100(cls, v):
        if not (-100 <= v <= 100):
            raise ValueError(f"hors bornes [-100, 100] : {v}")
        return v

    @field_validator("temp")
    @classmethod
    def _bounds_50(cls, v):
        if not (-50 <= v <= 50):
            raise ValueError(f"hors bornes [-50, 50] : {v}")
        return v


class Layer(BaseModel):
    id: str
    name: str = ""
    kind: LayerKind
    visible: bool = True
    opacity: float = Field(default=100, ge=0, le=100)
    locked: bool = False
    settings: LayerSettings = LayerSettings()


class PhotoEditorLayersResponse(BaseModel):
    layers: list[Layer]


class PhotoEditorSaveRequest(BaseModel):
    """Same copy/overwrite contract as `EditSaveRequest` (`schemas/review.py`)
    — `data_base64` is the already-composited PNG, computed client-side
    (Canvas2D, no server render for this pass)."""

    name: str
    bucket: str
    space: Optional[str] = None
    remplacer: bool = False
    layers: list[Layer]
    data_base64: str = ""


class PhotoEditorSaveResponse(BaseModel):
    """Mirrors `EditSaveResponse` field for field — same two paths, same
    `export` semantics (filled on overwrite only)."""

    ok: bool
    name: str
    remplace: bool
    export: Optional[str] = None
