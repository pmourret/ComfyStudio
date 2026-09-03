"""Payload shapes of the system-state module (ex `routes/etat.py`).

System state, character registry, wizard, universe tools, journal, NSFW state,
lifecycle of the two processes.
"""
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --------------------------------------------------------------- system state
class RecentImage(BaseModel):
    """One entry of `STATE.recent`, the live strip of the batch in flight."""
    model_config = ConfigDict(extra="allow")

    bucket: str
    name: str
    scene: str
    space: str
    score: Optional[float] = None


class BatchError(BaseModel):
    """Last batch error, `{at, msg}`. Set at BATCH level, not per job, and
    cleared when the next one starts: the chrome shows it even after the user
    has left the Créer screen (J7bis, honest chrome)."""
    at: str
    msg: str


class SystemStateResponse(BaseModel):
    """`STATE` + bucket counts + ETA + undo depth. Polled every 1.5 s.

    Every key of the `STATE` dict is named here, plus the five the route adds.
    `extra="allow"` keeps the response honest if `STATE` ever grows a key:
    dropping one silently would break the frontend far from the change.

    COUPLING — DO NOT BREAK (migration brief §4.3). `running` and `comfy` are
    two of the four inputs of the `#btnRun.disabled` rule; see the note on
    `get_system_state` in routers/state.py.
    """
    model_config = ConfigDict(extra="allow")

    running: bool
    batch_id: Optional[str] = None
    index: int = 0
    total: int = 0
    current: Optional[str] = None
    log: list[str] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)
    stop: bool = False
    started_at: Optional[str] = None
    recent: list[RecentImage] = Field(default_factory=list)
    intensity: int = 0
    edition: bool = False
    # Character of the batch IN FLIGHT, not of the request (see
    # `seconds_per_image`'s own note) — None until the first batch runs, no
    # longer a specific character's id as a placeholder (2026-09-01).
    character: Optional[str] = None
    last_error: Optional[BatchError] = None
    # added by the route on top of STATE
    comfy: bool
    counts: dict[str, int]
    nsfw_counts: dict[str, int]
    eta: Optional[int] = None
    undo: int


# ------------------------------------------------------------------ character
class WorldBrief(BaseModel):
    """`{id, label}` of a world, or null."""
    id: str
    label: str


class UniverseBrief(BaseModel):
    """The RESOLVED PACK — machine-level information, secondary in the chrome
    since ADR-0012. Never chosen by hand: `universe.resolve(type, style)`."""
    id: str
    label: str
    model_family: Optional[str] = None
    output_styles: list[str] = Field(default_factory=list)


class FrozenBaseBrief(BaseModel):
    """The character's frozen identity base: present or not, and under which
    name. Only whether the file is there — no route serves those bytes, and
    inventing one that reads ComfyUI/input/ without a character_id bound would
    reopen the leak closed on 29/08/2026."""
    name: Optional[str] = None
    present: bool


class EditToolState(BaseModel):
    """`nsfw_batch.edit_tool_state()`. Two conditions, never one (J7): the
    character's registry is armed AND its pack declares an edit graph.
    `reason` is the text the interface shows instead of the missing step."""
    model_config = ConfigDict(extra="allow")

    armed: bool
    pack: Optional[str] = None
    has_graph: bool
    available: bool
    reason: Optional[str] = None


class AppearanceBrief(BaseModel):
    """The character's theme override (Phase 0b, `DOCS/design-pass/
    phase-0b-theme-utilisateur.md`) — hue/intensity of the neutral scale and
    hue of the accent. All optional: absent means the platform default
    (hue 220°, intensity 0), identical for every character until this is set.

    Reused as BOTH the response shape (`CharacterSheet.appearance`, always
    present, fields possibly None) and the request body of `POST
    /api/character/appearance` — one shape, not a duplicated pair.

    Bounds are REJECTED, never silently clamped — same doctrine as
    `schemas/expression.py` (`ExpressionParams._within_bounds`): a human
    moving a wheel should see a rejection, not a silent correction.
    """
    model_config = ConfigDict(extra="allow")

    neutral_hue: Optional[float] = None
    neutral_intensity: Optional[float] = None
    accent_hue: Optional[float] = None

    @field_validator("neutral_hue", "accent_hue")
    @classmethod
    def _hue_range(cls, v, info):
        if v is not None and not (0 <= v < 360):
            raise ValueError(f"{info.field_name} hors bornes [0, 360) : {v}")
        return v

    @field_validator("neutral_intensity")
    @classmethod
    def _intensity_range(cls, v):
        # Plafond bas et volontaire (phase-0b) : au-dela, risque de retomber
        # sous les seuils WCAG deja valides en Phase 0.
        if v is not None and not (0 <= v <= 0.05):
            raise ValueError(f"intensite hors bornes [0, 0.05] : {v}")
        return v


class CharacterSheet(BaseModel):
    """The current character, for the chrome and for its sheet (F1.2)."""
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    type: str
    world: Optional[WorldBrief] = None
    output_style: str
    universe: UniverseBrief
    content_types: dict[str, Any] = Field(default_factory=dict)
    nsfw: bool
    base: FrozenBaseBrief
    nsfw_tool: EditToolState
    appearance: AppearanceBrief


class CharacterRow(BaseModel):
    """One line of the registry, for the entry gate (J7bis)."""
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    type: str
    world: Optional[WorldBrief] = None
    nsfw: bool
    content_types: list[str] = Field(default_factory=list)
    known_universe: bool


class CharacterListResponse(BaseModel):
    characters: list[CharacterRow]


# --------------------------------------------------------------------- wizard
class WizardWorld(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    label: str
    tone: Optional[str] = None
    suggested_styles: list[str] = Field(default_factory=list)


class WizardType(BaseModel):
    """One character type, with the styles of its resolved pack and the worlds
    of that pack's model family. Everything comes from the registries — never a
    hard-coded `if` (CLAUDE.md §8.7)."""
    model_config = ConfigDict(extra="allow")

    id: str
    label: str
    family: Optional[str] = None
    styles: list[str] = Field(default_factory=list)
    worlds: list[WizardWorld] = Field(default_factory=list)


class WizardOptionsResponse(BaseModel):
    types: list[WizardType]


class CreateCharacterRequest(BaseModel):
    """The wizard's write. The three frozen axes (character type, output style,
    world) are set HERE and never again — changing one is creating another
    character (CLAUDE.md §3, §8.8). The pack is NOT in this payload: it is
    derived from (type, style) by `universe.resolve()`, never chosen by hand."""
    cid: str = ""
    name: str = ""
    type: Optional[str] = None
    style: Optional[str] = None
    world: Optional[str] = None
    base_gelee: str = ""


class CreateCharacterResponse(BaseModel):
    ok: bool
    id: str


# -------------------------------------------------------------- identity base
class BaseUploadRequest(BaseModel):
    """Identity base PROVIDED by the user. base64 inside a JSON body, never
    multipart — see api/security.py for why that is deliberate."""
    cid: str = ""
    image_base64: Optional[str] = None


class BaseNameResponse(BaseModel):
    """Name to write into `config.json / base_gelee`. The bytes live in
    ComfyUI/input/, the only folder a `LoadImage` reads."""
    ok: bool
    base_gelee: str


class BaseGenerateRequest(BaseModel):
    """Identity base GENERATED: queues N base portraits, identity lock
    BYPASSED — no reference exists yet (CLAUDE.md §4)."""
    cid: str = ""
    type: Optional[str] = None
    style: Optional[str] = None
    world: Optional[str] = None
    n: Optional[int] = None
    seed: Optional[int] = None


class BaseCandidate(BaseModel):
    """One queued portrait: its seed and its ComfyUI prompt_id."""
    model_config = ConfigDict(extra="allow")

    seed: Optional[int] = None
    prompt_id: Optional[str] = None


class BaseGenerateResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    ok: bool
    pack: str
    prompt: Optional[str] = None
    format: Optional[Any] = None
    candidates: list[BaseCandidate] = Field(default_factory=list)


class BaseCandidatesRequest(BaseModel):
    pack: Optional[str] = None
    items: list[dict[str, Any]] = Field(default_factory=list)


class BaseCandidateState(BaseModel):
    """pending / ready (+file) / error (+detail)."""
    model_config = ConfigDict(extra="allow")

    seed: Optional[int] = None
    prompt_id: Optional[str] = None
    state: str
    file: Optional[str] = None
    detail: Optional[str] = None


class BaseCandidatesResponse(BaseModel):
    ok: bool
    results: list[BaseCandidateState]


class BaseFreezeRequest(BaseModel):
    """Freezes the chosen candidate to ComfyUI/input/<CID>_BASE.<ext>."""
    cid: str = ""
    file: Optional[str] = None


# ----------------------------------------------------------------------- misc
class UniverseToolsResponse(BaseModel):
    """The tool panel declared by the character's pack (tools.json, CLAUDE.md
    §5). Never an `if character == "lena"` in the frontend (§8.7)."""
    model_config = ConfigDict(extra="allow")

    universe: Optional[str] = None
    tools: Any


class JournalResponse(BaseModel):
    """Last 300 production rows, filtered on the character, reverse order.
    Rows are raw CSV records — the column set varies with journal migrations,
    hence the free dict rather than a fixed model."""
    rows: list[dict[str, Any]]


class NsfwSourceImage(BaseModel):
    """The bucket travels with the name: the source grid must be able to say
    where each image comes from, and /img needs it to find it back."""
    name: str
    bucket: str


class NsfwStateResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    armed: bool
    outil: EditToolState
    nom: str
    sortie: str
    counts: dict[str, int]
    sources: list[NsfwSourceImage]


# ------------------------------------------------------------------ lifecycle
class MemoryUsage(BaseModel):
    model_config = ConfigDict(extra="allow")

    total: int
    libre: int
    utilisee: int


class VramUsage(MemoryUsage):
    nom: Optional[str] = None
    torch_reserve: int = 0


class ComfyStatsResponse(BaseModel):
    """RAM / VRAM / thermals. Always a dict, never an exception: it feeds a
    display, not a decision. `en_ligne` says whether ComfyUI answered."""
    model_config = ConfigDict(extra="allow")

    en_ligne: bool
    version: Optional[str] = None
    ram: Optional[MemoryUsage] = None
    vram: Optional[VramUsage] = None
    gpu: Optional[Any] = None
