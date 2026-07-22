"""Alembic environment — sync psycopg3 for migrations, asyncpg for the app."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.engine import Connection
from sqlalchemy.engine.url import make_url

from app.config import settings
from app.database.models import Base  # noqa: F401 — registers all tables with Base.metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Resolve the database URL the same way the app does. An explicit DATABASE_URL
# override wins first; otherwise prefer alembic.ini's sqlalchemy.url when a
# caller has configured one explicitly, since resolved_database_url() always
# returns a URL (built from DB_HOST/DB_PORT/DB_NAME/DB_USER defaults when
# nothing else is set) and would otherwise make that alembic.ini setting
# unreachable. Replace the async driver with psycopg3 (sync) for migrations.
_raw_url = settings.DATABASE_URL or config.get_main_option("sqlalchemy.url") or settings.resolved_database_url()
if _raw_url:
    _parsed = make_url(_raw_url)
    _sync_drivername = _parsed.drivername.replace("+asyncpg", "+psycopg")
    sync_url: str | None = _parsed.set(drivername=_sync_drivername).render_as_string(hide_password=False)
else:
    sync_url = None


def run_migrations_offline() -> None:
    if not sync_url:
        raise RuntimeError("No DATABASE_URL configured for migrations.")
    context.configure(
        url=sync_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    if not sync_url:
        raise RuntimeError("No DATABASE_URL configured for migrations.")
    connectable = create_engine(sync_url)
    try:
        with connectable.connect() as conn:
            do_run_migrations(conn)
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
