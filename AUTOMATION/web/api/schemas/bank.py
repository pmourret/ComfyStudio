"""Payload shapes of the scene-bank module (ex `routes/banque.py`).

Scene bank, creative taxonomy, scene composer.
"""
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from .expression import ExpressionRangeParams


# ------------------------------------------------------------------ /api/scenes
class SceneMeta(BaseModel):
    """What the SERVER computes about a scene so the frontend does not have to
    reimplement the runner's compatibility defaults (`scene_intention`,
    `scene_band`). Not the scene itself — that travels raw in `data`."""
    model_config = ConfigDict(extra="allow")

    # NULLABLE, and it matters: `lb.scene_intention()` returns None for a scene
    # that declares no intention (an unmigrated bank, or one freshly written by
    # hand). The aiohttp version emitted `null` there; a `str` here turned that
    # into a 500 on the whole bank. The schema documents the contract, it does
    # not get to tighten it.
    intention: Optional[str] = None
    band: list[int]
    tags: list[str] = Field(default_factory=list)
    tones: list[str] = Field(default_factory=list)
    pose: Optional[str] = None


class ScenePreview(BaseModel):
    """Last image produced BY THIS CHARACTER for that scene, to illustrate the
    scene cards. Without the character, the Créer screen illustrated every
    card with Léna's images whatever character was open."""
    bucket: str
    name: str


class SceneStats(BaseModel):
    """Per scene: how many images were produced, how many the HUMAN validated,
    and the mean identity score. `ok` counts the human sort, not the QC verdict
    (base.stats_par_scene). `avg` is null while no image carries a score."""
    model_config = ConfigDict(extra="allow")

    n: int
    ok: Optional[int] = None
    avg: Optional[float] = None


class SceneBankResponse(BaseModel):
    """`data` is scenes.json VERBATIM — the file belongs to the character, not
    to this layer, so it is relayed untouched and unmodelled."""
    model_config = ConfigDict(extra="allow")

    data: Any
    # `list[str | None]` for the same reason as SceneMeta.intention: the
    # categories are the DISTINCT intentions of the bank, so a scene without one
    # puts a null in there.
    categories: list[Optional[str]]
    scene_ids: list[str]
    previews: dict[str, ScenePreview]
    meta: dict[str, SceneMeta]
    stats: dict[str, SceneStats]
    avg_duration: int
    poses: list[str]


class SceneBankSaveRequest(BaseModel):
    """Two accepted forms, `text` (a JSON string) or `data` (the object), and a
    deliberate escape hatch.

    `autoriser_pertes` disarms the batch-erasure guard for ONE save. It is the
    payload key, French, because it is part of the wire contract — renaming it
    would silently disable the guard for any client still sending the old name.
    Nothing in the frontend sends it today; it exists for a deliberate mass
    edit made by hand.
    """
    model_config = ConfigDict(extra="allow")

    text: Optional[str] = None
    data: Any = None
    autoriser_pertes: bool = False


class SceneBankRejected(BaseModel):
    """400 of a refused save. `erreur` is the first problem — what the screen
    shows; `problemes` is the whole list, for the details panel."""
    ok: bool = False
    erreur: str
    problemes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------- /api/creative
class CreativeIntention(BaseModel):
    model_config = ConfigDict(extra="allow")

    key: str
    label: Optional[str] = None


class CreativeTone(BaseModel):
    model_config = ConfigDict(extra="allow")

    key: str
    label: Optional[str] = None
    # Made explicit for the expression editor (api/routers/expression.py),
    # the first real reader of this field — `extra="allow"` already let it
    # through untyped before.
    expression: Optional[ExpressionRangeParams] = None


class IntensityTier(BaseModel):
    """One notch of the intensity slider, as the interface rebuilds it.

    A tier requiring arming that does not have it IS NOT EMITTED at all — the
    notch is absent from the interface, not greyed out (ADR-0003: NSFW is off by
    default, and a greyed notch is still an invitation). So the frontend has
    nothing to filter, and nothing to filter BY CHARACTER NAME (CLAUDE.md §8.7).
    `guard_intensity` remains the server lock: hiding never replaces the guard.

    Everything from creative.json passes through (`extra="allow"`); the four
    fields the route computes are `destination`, `besoin_instruction`, `unite`
    and `scenes`.
    """
    model_config = ConfigDict(extra="allow")

    level: int
    key: Optional[str] = None
    label: str
    pipeline: Optional[str] = None
    wardrobe: Optional[Any] = None
    prompt_add: Optional[str] = None
    export: bool = True
    requires: Optional[str] = None
    base_level: Optional[int] = None
    # computed by the route, never read from the file
    destination: str
    besoin_instruction: bool
    unite: str
    scenes: int


class CreativeResponse(BaseModel):
    intentions: list[CreativeIntention]
    tones: list[CreativeTone]
    intensity: list[IntensityTier]


# ----------------------------------------------------------------- /api/compose
class ComposeRequest(BaseModel):
    """`intention` is the free French text describing what is wanted;
    `intention_cible` is the taxonomy KEY being imposed. Confusing the two put
    the French sentence into the scenes' intention field. `category` is the old
    name of `intention_cible`, still accepted."""
    model_config = ConfigDict(extra="allow")

    intention: str = ""
    intention_cible: str = ""
    category: str = ""
    count: Optional[int] = None


class ComposeResponse(BaseModel):
    """Proposed scenes, ready to be reviewed — never written to the bank on
    their own. `brut` is the LLM's raw answer, truncated to 2000 characters, so
    a disappointing proposal can be diagnosed."""
    ok: bool
    scenes: list[dict[str, Any]]
    brut: str
