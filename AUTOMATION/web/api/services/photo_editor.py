"""Layer persistence for the advanced (Lightroom-style) photo editor.

Composing a layer stack into pixels happens ENTIRELY client-side (Canvas2D,
same "screen-size preview / full-res only at save" trick already used by
`PhotoEditor.tsx` / `photoEditorPixels.ts`) — a server round-trip per
slider tick would be the wrong latency budget for a tool that wants to feel
instant. This service therefore only PERSISTS the layer stack and writes
the bytes the client already composited, mirroring `services/journal.py` +
`routers/review.py::save_edit`'s copy/overwrite contract almost exactly.

Sidecar convention: `<stem>.layers.json` next to the image, same idea as
`pose_tools.py`'s own `_chemin_points` (`POSE_DIR / (stem + ".json")`) —
resolved through the SAME `bucket_dir(bucket, space, character_id)` the
image itself uses, so character isolation is automatic rather than a
second thing to get right.
"""
import json
from pathlib import Path

from pydantic import ValidationError

import shared_state as ss

from ..schemas.photo_editor import Layer

BASE_LAYER_ID = "base"


def default_layers() -> list[Layer]:
    """The one always-present, locked, neutral base layer — what a photo
    with no sidecar yet simply has. Never written to disk on its own."""
    return [Layer(id=BASE_LAYER_ID, name="Photo", kind="photo", locked=True)]


def _sidecar_path(image_path: Path) -> Path:
    return image_path.with_name(image_path.stem + ".layers.json")


def resolve_photo(character_id, bucket, space, name) -> Path:
    """Character-scoped resolution, same guarantee as
    `services/expression.py::resolve_photo` — `bucket_dir` never leaves this
    character's tree. Validated against `SAFE_NAME` up front (unlike the
    expression preview's read-only lookup): this service also WRITES bytes
    under a name derived from this one, the same risk category as
    `save_edit`, which validates the same way before touching disk."""
    if not ss.SAFE_NAME.match(name or ""):
        raise FileNotFoundError(f"nom de fichier invalide : {name!r}")
    path = ss.bucket_dir(bucket, space, character_id) / name
    if not path.is_file():
        raise FileNotFoundError(f"photo introuvable : {name!r}")
    return path


def load_layers(character_id, bucket, space, name) -> list[Layer]:
    """The photo's persisted layer stack, or the single default base layer
    if it was never edited yet. A sidecar that fails to parse or validate
    falls back the same way rather than 500ing — same discipline as
    `mesures.py::charger()`: an unreadable store must never block."""
    path = resolve_photo(character_id, bucket, space, name)
    sidecar = _sidecar_path(path)
    if not sidecar.exists():
        return default_layers()
    try:
        raw = json.loads(sidecar.read_text(encoding="utf-8"))
        layers = [Layer.model_validate(entry) for entry in raw]
    except (json.JSONDecodeError, OSError, ValidationError) as e:
        ss.push_log(f"photo-editor: sidecar illisible pour {name!r}, "
                    f"repli sur le calque de base ({type(e).__name__})")
        return default_layers()
    return layers or default_layers()


def write_layers(image_path: Path, layers: list[Layer]) -> None:
    sidecar = _sidecar_path(image_path)
    sidecar.write_text(
        json.dumps([layer.model_dump() for layer in layers], ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
