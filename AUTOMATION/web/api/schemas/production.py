"""Payload shapes of the production module (ex `routes/production.py`).

Launching, job queue, declensions, NSFW arming.

WHY THE NUMBERS ARE TYPED `int | str | None` AND NOT `int`.

`create.js payload()` reads them straight off `<input>.value`, so they travel as
STRINGS — and as the EMPTY STRING whenever the settings panel has not been
painted yet, which is the case on the very first `refreshPlan()` fired by
`renderScenes()`. `entier()` has always absorbed that: `if v in (None, ""):
return None`.

Declaring `count: int | None` would therefore answer 400 to every first plan of
every session. And declaring `ge=1, le=24` would answer 400 to `count=9999`,
which must still come back 200 with a plan of 24 images — the server bound is a
CLAMP, not a validation (test_serveur_http, case [M9]).

So the schema documents the wire type honestly and `clamped_int()` keeps doing
the coercion, the clamping and the French rejection message it always did.
"""
from typing import Any, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

# An integer as it actually arrives: a number, the string of an input field
# (« » included), or nothing at all.
WireInt = Union[int, str, None]


# ------------------------------------------------------------- shared payload
class RunPayload(BaseModel):
    """The launch payload — ONE shape for /api/plan and /api/run.

    Not a catch-all: it is genuinely the same object the frontend builds once
    in `create.js payload()` and posts to both routes. `/api/plan` is the dry
    run of `/api/run`, replayed on every keystroke; giving them two schemas
    would let them drift apart, which is exactly what the preview exists to
    prevent.
    """
    model_config = ConfigDict(extra="allow")

    scenes: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    count: WireInt = None
    format: Optional[str] = None
    limit: WireInt = None
    seed: WireInt = None
    no_variants: bool = False
    no_qc: bool = False
    # Free dicts: `preset` is merged into config.json as-is, `nsfw` is filtered
    # by the NSFW_OVERRIDABLE allow-list. Their values can be null — the panel
    # sends `parseFloat("")`, i.e. NaN, which JSON.stringify turns into null.
    preset: dict[str, Any] = Field(default_factory=dict)
    nsfw: dict[str, Any] = Field(default_factory=dict)
    # creative journey: absent = level 0 (strict SFW)
    intensity: WireInt = None
    confirm_intensity: bool = False
    tone: Optional[str] = None
    intention: Optional[str] = None
    edit_instruction: str = ""
    # NSFW notch: the images to edit, and the mode. The server subtracts what
    # is no longer editable (`valid_sources`) — the list may have aged.
    sources: list[str] = Field(default_factory=list)
    generer_avant: bool = False
    # scene amendment for THIS launch, never saved. Kept only when a single
    # scene is selected, and put through the same face check as saved scenes.
    scene_override: Optional[str] = None


# --------------------------------------------------------------- /api/plan
class PromptFragment(BaseModel):
    """One piece of the final prompt, and the share of it that it represents.

    On a typical scene, 69 % of the final prompt is assembled out of sight of
    whoever wrote the scene (measured 26/08/2026: 179 characters written out of
    578). Until that was displayed, a failed result could not be diagnosed.
    """
    model_config = ConfigDict(extra="allow")

    source: str
    texte: str
    part: int


class PromptEcho(BaseModel):
    """A background word appearing in SEVERAL fragments. Neither a wall nor a
    judgement: an observation. Two fragments talking about the same subject
    fight each other — the tone saying « close intimate framing » against the
    intention's « full figure in frame ». The human decides between a useful
    repetition and a contradiction."""
    mot: str
    sources: list[str]


class PromptPreview(BaseModel):
    """What actually goes out, shown before launching."""
    total_car: int
    n_jobs: int
    scene: str
    fragments: list[PromptFragment]
    echos: list[PromptEcho]


class PlannedJob(BaseModel):
    """One image of the plan. Same fields `build_jobs` produced — the route
    projects them, it does not invent any."""
    model_config = ConfigDict(extra="allow")

    scene: str
    category: Optional[str] = None
    format: Optional[str] = None
    variant: Optional[str] = None
    seed: Optional[int] = None
    prompt: str
    intensity: int
    outfit: Optional[Any] = None


class PlanResponse(BaseModel):
    """Dry run. ALWAYS 200, even when the guard refuses — see the box on
    `build_plan` in routers/production.py: `total` and `erreur` are the server
    side of the `#btnRun.disabled` contract, and a 4xx would change what the
    two client timers read.

    `alertes` comes back even on refusal: the edit screen would otherwise show
    nothing while the instruction is empty — which is precisely when it is
    being written.
    """
    model_config = ConfigDict(extra="allow")

    total: int
    jobs: list[PlannedJob] = Field(default_factory=list)
    alertes: list[str] = Field(default_factory=list)
    apercu: Optional[PromptPreview] = None
    erreur: Optional[str] = None
    edition: Optional[bool] = None


# ---------------------------------------------------------------- /api/run
class RunStartedResponse(BaseModel):
    """A batch is on its way. `batch_id` is the timestamp the journal and the
    live strip carry; the frontend follows it through /api/state."""
    model_config = ConfigDict(extra="allow")

    ok: bool
    batch_id: str
    total: int
    edition: Optional[bool] = None
    mode: Optional[str] = None
    libelle: Optional[str] = None


# ------------------------------------------------------------- /api/decline
class DeclineRequest(BaseModel):
    """Short loop: start again from an image already produced.

    `dry` only returns what each mode WOULD produce, so the interface shows
    only the declensions that make sense on this image.
    """
    model_config = ConfigDict(extra="allow")

    name: str = ""
    dry: bool = False
    mode: Optional[str] = None
    n: WireInt = None
    tone: Optional[str] = None
    confirm_intensity: bool = False
    edit_instruction: str = ""
    no_qc: bool = False


class DeclineDryResponse(BaseModel):
    """What is available on this image, and under which locks.

    `suivant_verrouille` and `edition_verrouillee` mirror the SAME locks as the
    main intensity slider: a confirmation to show, an arming to offer, rather
    than letting the user click and fail on a generic toast.
    """
    model_config = ConfigDict(extra="allow")

    ok: bool
    modes: dict[str, Any]
    scene: Optional[str] = None
    intensite: int
    ton: str = ""
    niveau_suivant: Optional[str] = None
    suivant_requires: Optional[str] = None
    suivant_verrouille: bool
    edition_label: Optional[str] = None
    edition_verrouillee: bool
    edition_raison: Optional[str] = None
    suivant_instruction: bool


# ------------------------------------------------------- /api/nsfw/instructions
class InstructionRow(BaseModel):
    """An instruction already used, and what it yielded. Sorted by the mean
    identity obtained — the only comparable measure available on an
    instruction. The ones without a score come last: they never led to one."""
    texte: str
    n: int
    identite: Optional[float] = None
    alertes: list[str] = Field(default_factory=list)


class NsfwInstructionsResponse(BaseModel):
    """The graph's REAL preamble plus the instructions already used.

    The preamble used to be described by a sentence in the interface (« la pose
    et le décor sont déjà protégés ») without ever being shown. Measured result:
    5 of the 16 instructions written after the redesign rewrote `same pose`. We
    show the text and stop paraphrasing it.
    """
    preambule: str
    historique: list[InstructionRow]


# --------------------------------------------------------------- /api/nsfw/arm
class NsfwArmRequest(BaseModel):
    """Explicit arming: the exact word must be retyped, not merely clicked.

    Writes the switch into the character registry (`character.json` / `nsfw`)
    since J4 (ADR-0010) — no longer into config.json, which keeps only the NSFW
    workflow settings. There is no global switch: nothing holds true for every
    character at once (CLAUDE.md §6).
    """
    model_config = ConfigDict(extra="allow")

    arm: bool = False
    confirm: str = ""


class NsfwArmResponse(BaseModel):
    ok: bool
    armed: bool
