# -*- coding: utf-8 -*-
"""Write the FastAPI OpenAPI schema to disk, without starting a server.

The schema is the SOURCE OF TRUTH for the frontend's data types (migration
brief, point 6): `openapi-typescript` turns this file into `src/api/schema.d.ts`
and no TypeScript interface for an API payload is ever written by hand. A
hand-copied shape is a second copy of the contract that drifts in silence — the
exact failure AUDIT §7.8 recorded when the contract lived only in docstrings and
in the JS that consumed it.

Offline on purpose: importing `api.main` builds the app object and `app.openapi()`
renders the document, so type generation never needs a running studio, a GPU, or
a character on disk.

    python AUTOMATION/tools/dump_openapi.py
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WEB = REPO / "AUTOMATION" / "web"
OUT = WEB / "ui" / "src" / "api" / "openapi.json"

sys.path.insert(0, str(WEB))
sys.path.insert(0, str(WEB.parent))

from api.main import app  # noqa: E402


def main():
    schema = app.openapi()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    print(f"{OUT.relative_to(REPO)} — {len(schema['paths'])} chemins, "
          f"{len(schema.get('components', {}).get('schemas', {}))} schemas")


if __name__ == "__main__":
    main()
