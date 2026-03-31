#!/usr/bin/env python3
"""One-off migration: seed existing Worktime users into SuperTokens.

This script reads all users from the local ``users`` table, creates
corresponding accounts in the SuperTokens core via its REST API, and
stores the resulting ``supertokens_user_id`` back into the local table.

Prerequisites
-------------
* The SuperTokens core must be running and reachable.
* The Worktime PostgreSQL database must be accessible.
* The Alembic migration ``002_add_supertokens_user_id`` must have been
  applied so the ``supertokens_user_id`` column exists.

Usage
-----
    # Set environment variables (or rely on .env defaults)
    export DATABASE_URL="postgresql+asyncpg://worktime:worktime@localhost/worktime"
    export SUPERTOKENS_CONNECTION_URI="http://localhost:3567"

    cd backend
    uv run python scripts/migrate_users_to_supertokens.py

The script is idempotent: users that already have a ``supertokens_user_id``
are skipped.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Ensure the project root is on sys.path so ``app`` imports resolve.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.models import User  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


async def _create_supertokens_user(
    client: httpx.AsyncClient,
    core_url: str,
    email: str,
    password_hash: str,
) -> str | None:
    """Import a user into SuperTokens using the import-user-with-password-hash API.

    Returns the SuperTokens user ID on success, or ``None`` on failure.

    The endpoint ``POST /recipe/user/passwordhash/import`` allows importing
    users with their existing password hash (Argon2 is supported).
    """
    resp = await client.post(
        f"{core_url}/recipe/user/passwordhash/import",
        json={
            "email": email,
            "passwordHash": password_hash,
            "hashingAlgorithm": "argon2",
        },
    )
    if resp.status_code != 200:
        logger.error("SuperTokens API error for %s: %s %s", email, resp.status_code, resp.text)
        return None

    data = resp.json()
    status = data.get("status")
    if status == "OK":
        return data["user"]["id"]
    if status == "EMAIL_ALREADY_EXISTS_ERROR":
        logger.info("User %s already exists in SuperTokens, skipping", email)
        return None

    logger.error("Unexpected response for %s: %s", email, data)
    return None


async def main() -> None:
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://worktime:worktime@localhost/worktime",
    )
    core_url = os.environ.get(
        "SUPERTOKENS_CONNECTION_URI",
        "http://localhost:3567",
    ).rstrip("/")

    engine = create_async_engine(database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    migrated = 0
    skipped = 0

    async with httpx.AsyncClient(timeout=30) as http_client:
        async with session_factory() as session:
            result = await session.execute(
                select(User).where(User.supertokens_user_id.is_(None))
            )
            users = result.scalars().all()

            if not users:
                logger.info("No users to migrate (all already have supertokens_user_id)")
                return

            logger.info("Found %d user(s) to migrate", len(users))

            for user in users:
                # SuperTokens emailpassword uses email; we use the username
                # as the email identifier.
                email = user.username if "@" in user.username else f"{user.username}@worktime.local"

                st_user_id = await _create_supertokens_user(
                    http_client,
                    core_url,
                    email=email,
                    password_hash=user.hashed_password,
                )

                if st_user_id is None:
                    skipped += 1
                    continue

                await session.execute(
                    update(User)
                    .where(User.id == user.id)
                    .values(supertokens_user_id=st_user_id)
                )
                migrated += 1
                logger.info(
                    "Migrated user %s (id=%d) → SuperTokens %s",
                    user.username,
                    user.id,
                    st_user_id,
                )

            await session.commit()

    await engine.dispose()
    logger.info("Migration complete: %d migrated, %d skipped", migrated, skipped)


if __name__ == "__main__":
    asyncio.run(main())
