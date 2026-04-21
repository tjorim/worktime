"""SuperTokens SDK initialization for Worktime backend.

Configures the ``emailpassword`` + ``session`` recipes and connects to the
self-hosted SuperTokens core specified by ``SUPERTOKENS_CONNECTION_URI``.

A session-creation override injects ``local_user_id`` and ``is_admin``
claims into the access-token payload so that downstream FastAPI dependencies
(see ``app.routers.auth``) can resolve the local database user without an
extra query per request.
"""

from __future__ import annotations

import logging
from hashlib import sha256
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from supertokens_python import InputAppInfo, SupertokensConfig, init
from supertokens_python.asyncio import get_user as st_get_user
from supertokens_python.recipe import dashboard, emailpassword, session
from supertokens_python.recipe.session.interfaces import (
    RecipeInterface as SessionRecipeInterface,
)
from supertokens_python.recipe.session.interfaces import (
    SessionContainer,
)
from supertokens_python.types import RecipeUserId

from app.config import settings
from app.database.engine import get_session_factory
from app.schemas import UserCreate
from app.services.db_service import ConflictError, create_user

logger = logging.getLogger(__name__)


def _connection_uri_tag(connection_uri: str) -> str:
    """Create a non-sensitive identifier for connection URI logging."""
    parsed = urlparse(connection_uri)
    scheme = parsed.scheme or "unknown"
    fingerprint = sha256(connection_uri.encode("utf-8")).hexdigest()[:8]
    return f"{scheme}://***#{fingerprint}"


def _derive_username_and_display_name(email: str, user_id: str) -> tuple[str, str]:
    """Derive a local username/display name from a SuperTokens identity."""
    raw_email = (email or "").strip()
    if not raw_email:
        fallback = f"user-{user_id[:8]}"
        return fallback, fallback

    local_part = raw_email.split("@", 1)[0].strip() or raw_email
    display_name = local_part
    return raw_email, display_name


async def _find_available_username(db_session, base_username: str, user_id: str) -> str:
    """Return a unique local username candidate for a SuperTokens identity."""
    from app.database.models import User

    candidate = base_username
    attempt = 0

    while True:
        username_result = await db_session.execute(
            select(User).where(User.username == candidate),
        )
        if username_result.scalar_one_or_none() is None:
            return candidate

        attempt += 1
        suffix_length = min(8 + attempt - 1, len(user_id))
        suffix = user_id[:suffix_length]
        # When user_id is shorter than the desired suffix length (atypical for UUIDs
        # but possible in tests), we fall through to the counter-suffixed form immediately.
        if suffix_length < len(user_id):
            candidate = f"{base_username}-{suffix}"
        else:
            candidate = f"{base_username}-{suffix}-{attempt}"


async def _get_or_create_local_user(user_id: str):
    """Return the local user for a SuperTokens user, auto-provisioning when missing."""
    from app.database.models import User

    session_factory = get_session_factory()
    async with session_factory() as db_session:
        result = await db_session.execute(select(User).where(User.supertokens_user_id == user_id))
        local_user = result.scalar_one_or_none()
        if local_user is not None:
            return local_user

        st_user = await st_get_user(user_id)
        if st_user is None:
            raise RuntimeError("SuperTokens user not found while provisioning local account")

        primary_email = st_user.emails[0] if st_user.emails else ""
        username, display_name = _derive_username_and_display_name(primary_email, user_id)
        username = await _find_available_username(db_session, username, user_id)

        try:
            local_user = await create_user(
                db_session,
                UserCreate(
                    username=username,
                    display_name=display_name,
                    settings={},
                ),
                supertokens_user_id=user_id,
            )
        except (IntegrityError, ConflictError):
            # Handles two concurrent-first-login races:
            # - IntegrityError: both requests passed the pre-insert username check and the
            #   DB unique constraint fired on the second INSERT.
            # - ConflictError: create_user's pre-insert get_user_by_username check found the
            #   name already taken (a different user claimed it after _find_available_username
            #   returned the candidate, or a concurrent first-login for the same ST user won).
            # In both cases, re-fetch by supertokens_user_id: if the winner was this same ST
            # user, return their row.  If not (name taken by a different user), re-raise.
            await db_session.rollback()
            result = await db_session.execute(
                select(User).where(User.supertokens_user_id == user_id),
            )
            local_user = result.scalar_one_or_none()
            if local_user is None:
                raise

        logger.info(
            "Auto-provisioned local Worktime user %s for SuperTokens user %s",
            username,
            user_id,
        )
        return local_user


def _override_session_functions(
    original_implementation: SessionRecipeInterface,
) -> SessionRecipeInterface:
    """Wrap ``create_new_session`` to embed local user data in the access token."""

    original_create = original_implementation.create_new_session

    async def create_new_session(
        user_id: str,
        recipe_user_id: RecipeUserId,
        access_token_payload: dict[str, Any] | None,
        session_data_in_database: dict[str, Any] | None,
        disable_anti_csrf: bool | None,
        tenant_id: str,
        user_context: dict[str, Any],
    ) -> SessionContainer:
        if access_token_payload is None:
            access_token_payload = {}

        # Look up the local user record by their SuperTokens user ID so we
        # can store the integer ``local_user_id`` and ``is_admin`` flag in
        # the session's access-token payload.  This query only runs when a
        # new session is created (i.e. at login time), not on every request.
        try:
            local_user = await _get_or_create_local_user(user_id)
        except Exception:
            logger.exception("Failed to resolve local user for session creation")
            raise

        admin_usernames = {
            u.strip() for u in settings.ADMIN_USERNAMES.split(",") if u.strip()
        }
        access_token_payload["local_user_id"] = local_user.id
        access_token_payload["is_admin"] = local_user.username in admin_usernames
        access_token_payload["displayName"] = local_user.display_name

        return await original_create(
            user_id,
            recipe_user_id,
            access_token_payload,
            session_data_in_database,
            disable_anti_csrf,
            tenant_id,
            user_context,
        )

    original_implementation.create_new_session = create_new_session  # type: ignore[assignment]  # ty: ignore[invalid-assignment]
    return original_implementation


def init_supertokens() -> None:
    """Initialize the SuperTokens SDK.

    Must be called once during application startup, before the ASGI app
    starts accepting requests.
    """
    connection_uri = settings.SUPERTOKENS_CONNECTION_URI
    api_key = settings.SUPERTOKENS_API_KEY or None

    init(
        app_info=InputAppInfo(
            app_name="Worktime",
            api_domain=settings.SUPERTOKENS_API_DOMAIN,
            website_domain=settings.SUPERTOKENS_WEBSITE_DOMAIN,
            api_base_path=settings.SUPERTOKENS_API_BASE_PATH,
            website_base_path=settings.SUPERTOKENS_WEBSITE_BASE_PATH,
        ),
        supertokens_config=SupertokensConfig(
            connection_uri=connection_uri,
            api_key=api_key,
        ),
        framework="fastapi",
        recipe_list=[
            emailpassword.init(),
            session.init(
                override=session.InputOverrideConfig(
                    functions=_override_session_functions,
                ),
            ),
            dashboard.init(api_key=api_key),
        ],
        mode="asgi",
    )

    logger.info(
        "SuperTokens SDK initialized (core: %s)",
        _connection_uri_tag(connection_uri),
    )
