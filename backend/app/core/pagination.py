"""In-process pagination for list endpoints.

The list_* service functions still fetch every matching row for the user
(cheap given the per-user composite indexes — see migration 003) rather than
pushing LIMIT/OFFSET into the query. Slicing here instead of in the service
layer keeps every existing service-function caller (MCP tools, read models,
other routers) working unchanged, while still bounding the JSON response size
sent to a paginating client.
"""

from __future__ import annotations

# Upper bound on `limit` accepted by any paginated list endpoint.
MAX_PAGE_LIMIT = 500


def paginate[T](items: list[T], *, limit: int | None, offset: int) -> tuple[list[T], int]:
    """Return ``(page, total)``; *total* is the full, unsliced item count.

    ``offset`` is always applied (0 is a no-op slice). ``limit=None`` returns
    every remaining item after ``offset`` — the default, preserving the
    unpaginated behavior existing callers rely on when they don't pass these
    params at all.
    """
    total = len(items)
    page = items[offset:]
    if limit is not None:
        page = page[:limit]
    return page, total
