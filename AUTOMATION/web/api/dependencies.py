"""Request-scoped dependencies shared by every router.

This is the only place that reads `?character=` off the query string. The
validation behind it did not move — it is still `shared_state.character()`,
byte for byte the same rejections (AUDIT §5.2): invalid slug, missing folder,
missing character.json, unknown pack, output_style outside the pack, a
`(type, style)` pair that does not resolve to the declared pack, unknown world
or a world incompatible with the pack's model family. All of them come out as
400 JSON, never a 500 and never a filesystem path.
"""
from typing import Annotated, Optional

from fastapi import Depends, Query

import shared_state as ss

# Declared so `?character=` shows up in the OpenAPI page of every route that
# takes it — under aiohttp the contract lived in a docstring and in the JS that
# consumed it (AUDIT §7.8), which is exactly what this migration was asked to
# fix.
_CHARACTER_QUERY = Query(
    description="Identifiant du personnage (registre CHARACTERS/). "
                "Défaut « lena » sauf sur /img, qui l'exige.")


def current_character(character: Annotated[Optional[str], _CHARACTER_QUERY] = None) -> str:
    """Validated character_id of the request, default "lena"."""
    return ss.character(character)


def required_character(character: Annotated[Optional[str], _CHARACTER_QUERY] = None) -> str:
    """Validated character_id, with NO default — the parameter is mandatory.

    Reserved for the routes that serve the BYTES of a character tree (/img).
    Leaving a default there means serving Léna's images to whoever did not ask
    for them: that was the isolation bug of 29/08/2026, where Abyssiaelle's
    Review screen displayed Léna's gallery.
    """
    return ss.character(character, required=True)


CharacterId = Annotated[str, Depends(current_character)]
RequiredCharacterId = Annotated[str, Depends(required_character)]
