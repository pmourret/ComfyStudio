"""Payload shapes of the advanced (Lightroom-style) photo editor.

`LayerSettings` now covers the full design-pass shape (screen-photo-editor.md
§7b) — the 4 basic sliders shipped first, this pass adds curves/levels/HSL/
sharpen/selective-blur/perspective/AI-retouch fields. Every new field has a
NEUTRAL default (identity curve, zero shift, no mask): an older sidecar
missing them, or a request that omits them, still validates — Pydantic's
default `extra="ignore"` means no migration is needed when the shape grows,
by design (see the previous pass's own note, still true here).

Points/radii inside a `Mask` are NORMALIZED to the image (0..1, radius as a
fraction of the larger image dimension) rather than pixel coordinates: a
stroke drawn on the screen-size preview canvas must still land in the right
place when the same mask is rendered again at full export resolution.
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

LayerKind = Literal["photo", "reglage", "image", "retouche"]
CurveChannel = Literal["rgb", "r", "g", "b"]
HslBandName = Literal["rouges", "jaunes", "verts", "cyans", "bleus", "magentas"]
MaskMode = Literal["sujet", "ciel", "arriere-plan", "pinceau", "degrade", "radial"]

_IDENTITY_CURVE = [{"x": 0, "y": 0}, {"x": 255, "y": 255}]


class CurvePoint(BaseModel):
    x: float = Field(ge=0, le=255)
    y: float = Field(ge=0, le=255)


class Curves(BaseModel):
    """One list of control points per channel — `curveChannel` (on
    `LayerSettings`) only says which of these four the editor currently
    shows, it does not pick which one is "active": all four always apply
    together when rendering (design-pass: courbe RGB puis par canal)."""

    # Literal instance defaults, not `Field(default_factory=...)`: Pydantic
    # v2 already deep-copies a BaseModel/list default per instance (unlike a
    # plain dataclass, sharing mutable state across instances is NOT a risk
    # here — verified: two `Layer()`s never share the same `curves` list).
    # `default_factory` fields don't get a `default` value in the emitted
    # OpenAPI schema (a factory can't be serialized as a static JSON value),
    # and `openapi-typescript` then treats the TS field as OPTIONAL — which
    # would force `layer.settings.curves` to be checked for `undefined`
    # everywhere it's read, for a field that in practice never is.
    rgb: list[CurvePoint] = [CurvePoint(**p) for p in _IDENTITY_CURVE]
    r: list[CurvePoint] = [CurvePoint(**p) for p in _IDENTITY_CURVE]
    g: list[CurvePoint] = [CurvePoint(**p) for p in _IDENTITY_CURVE]
    b: list[CurvePoint] = [CurvePoint(**p) for p in _IDENTITY_CURVE]


class HslBand(BaseModel):
    h: float = 0
    s: float = 0
    l: float = 0  # noqa: E741 — matches the design-pass field name (teinte/saturation/luminance)

    @field_validator("h")
    @classmethod
    def _h_bounds(cls, v):
        if not (-30 <= v <= 30):
            raise ValueError(f"hors bornes [-30, 30] : {v}")
        return v

    @field_validator("s", "l")
    @classmethod
    def _sl_bounds(cls, v):
        if not (-100 <= v <= 100):
            raise ValueError(f"hors bornes [-100, 100] : {v}")
        return v


class Point01(BaseModel):
    """A point in NORMALIZED image space — see this module's own header."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class Stroke(BaseModel):
    points: list[Point01]
    radius: float = Field(ge=0, le=1)


class GradientDef(BaseModel):
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    x2: float = Field(ge=0, le=1)
    y2: float = Field(ge=0, le=1)


class RadialDef(BaseModel):
    cx: float = Field(ge=0, le=1)
    cy: float = Field(ge=0, le=1)
    rx: float = Field(ge=0, le=1)
    ry: float = Field(ge=0, le=1)
    rotation: float = 0
    feather: float = Field(default=20, ge=0, le=100)


class Mask(BaseModel):
    """Shared by selective blur AND AI retouch (design-pass §7b: "remplace
    le pinceau simple partout où une zone doit être ciblée"). `sujet`/
    `ciel`/`arriere-plan` are selectable but produce no actual mask this
    pass — no segmentation backend exists yet, same status as AI retouch
    itself; the frontend keeps them visibly inert rather than pretending
    they work."""

    mode: MaskMode = "pinceau"
    brushRadius: float = Field(default=0.05, ge=0, le=1)
    strokes: list[Stroke] = []
    gradient: Optional[GradientDef] = None
    radial: Optional[RadialDef] = None


class LayerSettings(BaseModel):
    """Bounds for `expo`/`contrast`/`sat`/`temp` copied from
    `photoEditorPixels.ts`'s own `SLIDERS` — the same 4 adjustments, so a
    value the client's own slider could never produce is rejected here too,
    rather than silently clamped. Same discipline for every field added
    since."""

    expo: float = 0
    contrast: float = 0
    sat: float = 0
    temp: float = 0

    curveChannel: CurveChannel = "rgb"
    curves: Curves = Curves()

    levelBlack: float = 0
    levelMid: float = 0
    levelWhite: float = 0

    hsl: dict[HslBandName, HslBand] = {}

    sharpen: float = Field(default=0, ge=0, le=100)

    blurOn: bool = False
    blurMask: Optional[Mask] = None
    blurRadius: float = Field(default=0.02, ge=0, le=1)
    blurStrength: float = Field(default=50, ge=0, le=100)

    perspH: float = 0
    perspV: float = 0

    aiMask: Optional[Mask] = None
    aiBrushSize: float = Field(default=0.05, ge=0, le=1)
    aiPrompt: str = ""

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

    @field_validator("levelBlack", "levelMid", "levelWhite")
    @classmethod
    def _level_bounds(cls, v):
        if not (-50 <= v <= 50):
            raise ValueError(f"hors bornes [-50, 50] : {v}")
        return v

    @field_validator("perspH", "perspV")
    @classmethod
    def _persp_bounds(cls, v):
        if not (-30 <= v <= 30):
            raise ValueError(f"hors bornes [-30, 30] : {v}")
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
