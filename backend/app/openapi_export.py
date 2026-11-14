"""Write the OpenAPI document the frontend generates its API types from.

``frontend/openapi.json`` is a committed snapshot of ``app.openapi()``. The frontend feeds it to
Orval (``pnpm api:generate``), so a changed route or schema shows up as a reviewable diff of that file
and a TypeScript error in the screens that use it, instead of a runtime failure.

    uv run python -m app.openapi_export           # rewrite the snapshot
    uv run python -m app.openapi_export --check   # exit 1 if it is stale (the backend test does the same)

``tests/test_openapi_snapshot.py`` fails when the snapshot differs from the running app.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

SNAPSHOT_PATH = Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"

# The app version comes from the root VERSION file and changes on every release. The frontend does not
# read it, and a release PR must not need a regenerated snapshot, so the snapshot pins a constant.
SNAPSHOT_VERSION = "0.0.0"


def build_document() -> dict[str, Any]:
    """Return the app's OpenAPI document, normalized for the committed snapshot."""
    from app.main import app

    document = json.loads(json.dumps(app.openapi()))  # a copy: ``app.openapi()`` caches its result
    document["info"]["version"] = SNAPSHOT_VERSION
    return document


def render_document(document: dict[str, Any] | None = None) -> str:
    """Serialize deterministically: schema order as FastAPI builds it, two-space indent, final newline."""
    return json.dumps(document if document is not None else build_document(), indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    rendered = render_document()
    if "--check" in argv:
        current = SNAPSHOT_PATH.read_text(encoding="utf-8") if SNAPSHOT_PATH.exists() else ""
        if current != rendered:
            print(f"{SNAPSHOT_PATH} is stale; run: cd backend && uv run python -m app.openapi_export", file=sys.stderr)
            return 1
        return 0
    SNAPSHOT_PATH.write_text(rendered, encoding="utf-8")
    print(f"Wrote {SNAPSHOT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
