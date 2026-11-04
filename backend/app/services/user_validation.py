"""Validation for explicit user writes; stored/OIDC identities remain readable."""

import re
from typing import Any

from app.core.errors import ErrorCode, api_error
from app.database.models import User


def validate_user_fields(data: dict[str, Any], *, current: User | None = None, is_admin: bool = True) -> None:
    """Normalize changed usernames without revalidating legacy stored values."""
    username = data.get("username")
    if username is not None and (current is None or username != current.username):
        username = username.strip()
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._@+-]{0,63}", username):
            raise api_error(
                400,
                ErrorCode.USERNAME_INVALID,
                "Username must contain 1–64 ASCII letters, digits, dots, underscores, @, plus or hyphens (starting with a letter or digit)",
            )
        if not is_admin and username.lower() in {"admin", "administrator", "root", "system", "support"}:
            raise api_error(400, ErrorCode.USERNAME_RESERVED, "Username is reserved")
        data["username"] = username
    name = data.get("display_name")
    if name is not None and (current is None or name != current.display_name) and len(name) > 150:
        raise api_error(400, ErrorCode.DISPLAY_NAME_INVALID, "Display name must be at most 150 characters")
