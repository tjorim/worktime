"""Exercise concurrent sessions through the local-development engine setup."""

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import text

from app.database import engine as database_engine


async def test_file_sqlite_concurrent_writes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(database_engine, "_engine", None)
    monkeypatch.setattr(database_engine, "_session_factory", None)
    monkeypatch.setattr(database_engine.settings, "DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path / 'test.db'}")
    engine, factory = database_engine._build_engine()
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE writes (id INTEGER PRIMARY KEY)"))

        async def write(worker: int) -> None:
            for index in range(60):
                async with factory() as session:
                    await session.execute(text("INSERT INTO writes (id) VALUES (:id)"), {"id": worker * 60 + index})
                    await session.commit()

        async def read() -> None:
            for _ in range(60):
                async with factory() as session:
                    await session.execute(text("SELECT * FROM writes"))
                await asyncio.sleep(0)

        results = await asyncio.gather(
            *(write(worker) for worker in range(8)), *(read() for _ in range(3)), return_exceptions=True
        )
        assert all(result is None for result in results), results
        async with engine.connect() as connection:
            assert (await connection.execute(text("SELECT COUNT(*) FROM writes"))).scalar_one() == 480
    finally:
        await engine.dispose()


@pytest.mark.parametrize("url", ["sqlite+aiosqlite://", "sqlite+aiosqlite:///:memory:"])
async def test_memory_sqlite_retains_data(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setattr(database_engine, "_engine", None)
    monkeypatch.setattr(database_engine, "_session_factory", None)
    monkeypatch.setattr(database_engine.settings, "DATABASE_URL", url)
    engine, factory = database_engine._build_engine()
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE retained (id INTEGER PRIMARY KEY)"))
            await connection.execute(text("INSERT INTO retained VALUES (1)"))
        async with factory() as session:
            assert (await session.execute(text("SELECT id FROM retained"))).scalar_one() == 1
    finally:
        await engine.dispose()
