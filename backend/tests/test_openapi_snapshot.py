"""``frontend/openapi.json`` is the committed OpenAPI document the frontend generates its types from (#2031)."""

from __future__ import annotations

import difflib

from app.openapi_export import SNAPSHOT_PATH, SNAPSHOT_VERSION, build_document, render_document

REGENERATE = "cd backend && uv run python -m app.openapi_export"


def test_snapshot_matches_the_running_app():
    assert SNAPSHOT_PATH.exists(), f"{SNAPSHOT_PATH} is missing; run: {REGENERATE}"
    expected = render_document().splitlines(keepends=True)
    actual = SNAPSHOT_PATH.read_text(encoding="utf-8").splitlines(keepends=True)
    if expected != actual:
        diff = "".join(difflib.unified_diff(actual, expected, "frontend/openapi.json", "app.openapi()", n=1))
        raise AssertionError(f"frontend/openapi.json is stale; run: {REGENERATE}\n{diff[:4000]}")


def test_snapshot_does_not_carry_the_release_version():
    """A release bump rewrites VERSION; the snapshot must not need regenerating for it."""
    assert build_document()["info"]["version"] == SNAPSHOT_VERSION


def test_snapshot_lists_every_api_path():
    """The snapshot is the whole API (database routes included), whatever the test environment enables."""
    paths = build_document()["paths"]
    assert "/api/sync/pull" in paths
    assert "/api/health" in paths
