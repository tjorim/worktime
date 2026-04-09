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
from supertokens_python import InputAppInfo, SupertokensConfig, init
from supertokens_python.recipe import emailpassword, session
from supertokens_python.recipe.session.interfaces import (
    RecipeInterface as SessionRecipeInterface,
)
from supertokens_python.recipe.session.interfaces import (
    SessionContainer,
)
from supertokens_python.types import RecipeUserId

from app.config import settings
from app.database.engine import get_session_factory

logger = logging.getLogger(__name__)


def _connection_uri_tag(connection_uri: str) -> str:
    """Create a non-sensitive identifier for connection URI logging."""
    parsed = urlparse(connection_uri)
    scheme = parsed.scheme or "unknown"
    fingerprint = sha256(connection_uri.encode("utf-8")).hexdigest()[:8]
    return f"{scheme}://***#{fingerprint}"


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
            from app.database.models import User

            session_factory = get_session_factory()
            async with session_factory() as db_session:
                result = await db_session.execute(
                    select(User).where(User.supertokens_user_id == user_id)
                )
                local_user = result.scalar_one_or_none()
        except Exception:
            logger.exception("Failed to look up local user for session creation")
            raise

        if local_user is not None:
            admin_usernames = {
                u.strip() for u in settings.ADMIN_USERNAMES.split(",") if u.strip()
            }
            access_token_payload["local_user_id"] = local_user.id
            access_token_payload["is_admin"] = local_user.username in admin_usernames
            access_token_payload["displayName"] = local_user.display_name
        else:
            logger.error(
                "No local user found for SuperTokens user %s; "
                "refusing to create session without local_user_id claim",
                user_id,
            )
            raise RuntimeError(
                "No local user found for SuperTokens user; cannot create session"
            )

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
        ],
        mode="asgi",
    )

    logger.info(
        "SuperTokens SDK initialized (core: %s)",
        _connection_uri_tag(connection_uri),
    )
