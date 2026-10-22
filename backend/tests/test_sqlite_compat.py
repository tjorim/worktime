"""app.database.sqlite: the two ways SQLite differs from PostgreSQL for this schema."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.database.models import TimeTrackingTask, User


def _skip_unless_sqlite(engine: AsyncEngine) -> None:
    if engine.dialect.name != "sqlite":
        pytest.skip("SQLite compatibility layer")


async def test_aware_datetimes_round_trip_as_utc(test_db: AsyncEngine) -> None:
    _skip_unless_sqlite(test_db)
    plus_two = timezone(timedelta(hours=2))
    factory = async_sessionmaker(test_db, expire_on_commit=False)
    async with factory() as session:
        user = User(username="tz-user", display_name="TZ")
        session.add(user)
        await session.flush()
        session.add(
            TimeTrackingTask(
                id="tz-task",
                user_id=user.id,
                text="offset",
                start_time=datetime(2026, 6, 1, 9, 0, tzinfo=plus_two),
                client_updated_at=datetime.now(UTC),
            )
        )
        await session.commit()

    async with factory() as session:
        task = (await session.execute(select(TimeTrackingTask))).scalar_one()

    assert task.start_time == datetime(2026, 6, 1, 7, 0, tzinfo=UTC)
    assert task.start_time.utcoffset() == timedelta(0)
    # Comparing with an aware value must not raise.
    assert task.start_time < datetime(2026, 6, 2, tzinfo=UTC)


async def test_foreign_keys_are_enforced(test_db: AsyncEngine) -> None:
    _skip_unless_sqlite(test_db)
    factory = async_sessionmaker(test_db, expire_on_commit=False)
    async with factory() as session:
        session.add(
            TimeTrackingTask(
                id="orphan",
                user_id=999_999,
                text="no such user",
                start_time=datetime(2026, 6, 1, tzinfo=UTC),
                client_updated_at=datetime.now(UTC),
            )
        )
        with pytest.raises(IntegrityError):
            await session.commit()
