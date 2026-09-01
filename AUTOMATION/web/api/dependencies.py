"""Request-scoped dependencies shared by every router.

This is the only place that reads `?character=` off the query string. The
validation behind it did not move — it is still `shared_state.character()`,
byte for byte the same rejections (AUDIT §5.2): invalid slug, missing folder,
missing character.json, unknown pack, output_style outside the pack, a
`(type, style)` pair that does not resolve to the declared pack, unknown world
or a world incompatible with the pack's model family. All of them come out as
400 JSON, never a 500 and never a filesystem path.

NO DEFAULT ANYWHERE (amended 2026-09-01) — there used to be a two-tier
contract: most routes fell back to a specific character when `?character=`
was omitted, and only `/img` (`RequiredCharacterId`) refused that, after the
29/08/2026 isolation bug where Abyssiaelle's Review screen displayed that
default character's gallery. That bug is exactly what an implicit default
invites elsewhere too — every route now goes through `RequiredCharacterId`,
the single dependency below. A route with genuinely nothing character-scoped
to do (VRAM/RAM stats, ComfyUI process control) takes no character parameter
at all rather than a required-but-unused one — see `api/routers/app.py`.
"""
from typing import Annotated, Optional

from fastapi import Depends, Query

import shared_state as ss

# Declared so `?character=` shows up in the OpenAPI page of every route that
# takes it — under aiohttp the contract lived in a docstring and in the JS that
# consumed it (AUDIT §7.8), which is exactly what this migration was asked to
# fix.
_CHARACTER_QUERY = Query(
    description="Identifiant du personnage (registre CHARACTERS/). Obligatoire.")


def required_character(character: Annotated[Optional[str], _CHARACTER_QUERY] = None) -> str:
    """Validated character_id of the request — mandatory, no fallback."""
    return ss.character(character)


RequiredCharacterId = Annotated[str, Depends(required_character)]
