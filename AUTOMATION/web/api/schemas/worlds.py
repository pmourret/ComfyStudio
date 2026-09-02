"""Payload shapes of the world catalog module (ADR-0015).

`places` is a WORLD resource, not a character one: these routes read and
write `WORLDS/<id>.json`, never `CHARACTERS/<id>/scenes.json`. That split is
the isolation guarantee — see `api/services/worlds.py`.
"""
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class Place(BaseModel):
    """One entry of a world's catalog — a FRAME (label/intention/prompt),
    never a wardrobe. `extra="allow"` for the same reason as `SceneMeta`: this
    layer relays a file it does not own."""
    model_config = ConfigDict(extra="allow")

    id: str
    label: str = ""
    intention: str = ""
    prompt: str


class PlacesResponse(BaseModel):
    world: str
    label: str
    places: list[Place]


class SavePlacesRequest(BaseModel):
    """The business shape (unique ids, non-empty prompt, no character-only
    key) is validated in `services/worlds.py`, not here — same reasoning as
    `SceneBankSaveRequest`: this is a FILE that belongs to the world, not a
    request payload the schema layer should own the rules of."""
    model_config = ConfigDict(extra="allow")

    places: list[dict[str, Any]] = Field(default_factory=list)


class PlacesRejected(BaseModel):
    """400 of a refused save. `erreur` is the first problem — what the screen
    shows; `problemes` is the whole list, for the details panel."""
    ok: bool = False
    erreur: str
    problemes: list[str] = Field(default_factory=list)


# --------------------------------------------------------------- world registry
class WorldSummary(BaseModel):
    """One row of the « Mondes » screen's registry — enough to card it and
    link to its places editor, nothing a character sheet needs."""
    model_config = ConfigDict(extra="allow")

    id: str
    label: str
    compatible_families: list[str] = Field(default_factory=list)
    tone: str = ""
    places_count: int = 0


class WorldListResponse(BaseModel):
    worlds: list[WorldSummary]


class PackOption(BaseModel):
    """One entry of the pack picker on the world-creation form. `family` is
    shown so the form can explain what `compatible_families` will be derived
    to — never typed by hand (ADR-0016)."""
    id: str
    label: str
    family: Optional[str] = None


class WorldOptionsResponse(BaseModel):
    packs: list[PackOption]


class CreateWorldRequest(BaseModel):
    """The short form of ADR-0016: id, name, an EXISTING pack (to derive
    `compatible_families`/`suggested_styles` from), an optional tone. No
    family field — typing it back in would be the same mistake the pack
    picker exists to avoid."""
    id: str = ""
    label: str = ""
    pack: str = ""
    tone: str = ""


class CreateWorldResponse(BaseModel):
    ok: bool
    id: str
