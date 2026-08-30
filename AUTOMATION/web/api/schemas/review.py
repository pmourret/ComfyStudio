"""Payload shapes of the review module (ex `routes/tri.py`).

Gallery, human sorting, realism judgement, measurement catch-up, browser edit.
"""
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------- /api/gallery
class GalleryItem(BaseModel):
    """One image of a bucket, as the Review and Galerie grids read it.

    `score` is a STRING, not a float: it comes straight from the journal column
    when there is one, and falls back to a `%.3f` of the measured identity
    otherwise. The screen displays it as-is; typing it as a float here would
    turn the empty case into a null the grid would have to special-case.
    """
    model_config = ConfigDict(extra="allow")

    name: str
    bucket: str
    space: str
    score: str
    scene: str
    categorie: str
    format: str
    seed: str
    date: str
    # COUPLING — see the box on `get_gallery` in routers/review.py. `v` is the
    # mtime of the BYTES, and the only reason `/api/edit/save?remplacer` does
    # not leave a stale image on screen.
    v: int
    prompt: str
    nettete: Optional[float] = None
    texture: Optional[float] = None
    fond: Optional[float] = None
    flag: Optional[str] = None


class ReferenceCount(BaseModel):
    """How much of the reference corpus has been measured. Without it the
    calibration bands have no scale."""
    mesurees: int
    total: int


class GalleryResponse(BaseModel):
    """Content of one sorting folder — of THIS character, and of it alone.

    `sans_mesure` is counted over the WHOLE folder, not over the 200 items
    displayed: the button announces what /api/mesurer will really have to do,
    and that one walks everything. The two figures contradicted each other as
    soon as a folder went past 200 images.
    """
    model_config = ConfigDict(extra="allow")

    items: list[GalleryItem]
    sans_mesure: int
    references: ReferenceCount
    # Calibration bands, derived from the images judged convincing, never
    # written as constants (CLAUDE.md §8.4). None until there are enough
    # judgements.
    bandes: dict[str, Any]
    juges: int


# ---------------------------------------------------------------- /api/action
class SortRequest(BaseModel):
    """A human sorting gesture. `action` is the wire contract, in French:
    valider / revoir / rejeter / archiver."""
    model_config = ConfigDict(extra="allow")

    name: str = ""
    bucket: str = ""
    action: str = ""
    space: Optional[str] = None


class SortResponse(BaseModel):
    """`export` is the name of the published JPEG when the gesture produced
    one, "" otherwise. `undo` is the depth of the undo stack FOR THIS
    CHARACTER — the stack is shared, the reading is scoped."""
    model_config = ConfigDict(extra="allow")

    ok: bool
    bucket: str
    export: str
    undo: int


class UndoResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    ok: bool
    bucket: str
    name: str
    export: str
    undo: int


# ---------------------------------------------------------------- /api/delete
class DeleteRequest(BaseModel):
    """DEFINITIVE removal — not a sort, not in UNDO, no way back.

    Removes the file, its thumbnail and its export copy. `journal_batch.csv`,
    `mesures.json` and `PROD/soulglade.db` stay intact on purpose: they are
    append-only histories, not an index of what exists on disk. A row pointing
    at a vanished file remains a true fact — that image existed, was scored,
    and was deleted.
    """
    model_config = ConfigDict(extra="allow")

    name: str = ""
    bucket: str = ""
    space: Optional[str] = None


# ------------------------------------------------------------------ /api/flag
class FlagRequest(BaseModel):
    """Human judgement on realism. Independent of sorting: it moves nothing.
    `flag` is "ok", "ia", or null to clear it."""
    model_config = ConfigDict(extra="allow")

    name: str = ""
    flag: Optional[str] = None


class FlagResponse(BaseModel):
    ok: bool
    flag: Optional[str] = None


# --------------------------------------------------------------- /api/mesurer
class MeasureRequest(BaseModel):
    """Catches up the missing realism measurements of a folder, IN BATCHES.

    `lot` is clamped server-side to [1, 40] — it CLAMPS, it does not reject, so
    no `ge`/`le` here (same rule as the numbers of the production module).
    """
    model_config = ConfigDict(extra="allow")

    bucket: str = "OK"
    space: Optional[str] = None
    lot: Any = None


class MeasureResponse(BaseModel):
    """COUPLING — see the box on `measure_batch` in routers/review.py.

    `restant` is what makes the frontend call again. It is the whole contract:
    the loop lives in the client, and this response is the only thing that ends
    it.
    """
    ok: bool
    faites: int
    restant: int
    erreur: Optional[str] = None


# ------------------------------------------------------------ /api/edit/save
class EditSaveRequest(BaseModel):
    """Saves a browser-side retouch (crop / colour / grain).

    By default a NEW file `<name>_edit`, in the same bucket as the original.
    `remplacer: true` overwrites the source (F3.3, 30/08/2026) — the frontend
    only sends it after an explicit confirmation, and it is never its primary
    button.
    """
    model_config = ConfigDict(extra="allow")

    name: str = ""
    bucket: str = ""
    space: Optional[str] = None
    remplacer: bool = False
    data_base64: str = ""


class EditSaveResponse(BaseModel):
    """`remplace` tells the two paths apart: a copy under a new name, or the
    source overwritten. `export` is only filled on the overwrite path, where
    the published JPEG had to be redone from the new bytes."""
    model_config = ConfigDict(extra="allow")

    ok: bool
    name: str
    remplace: bool
    export: Optional[str] = None
