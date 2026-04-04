"""SuperTokens utility helpers shared across routers."""

from __future__ import annotations


def username_to_st_email(username: str) -> str:
    """Map a local username to the SuperTokens email-password identifier."""
    return username if "@" in username else f"{username}@worktime.local"
