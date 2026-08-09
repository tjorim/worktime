"""Audit logging functionality for tracking API operations.

This module provides audit logging that records all API operations
to a persistent, size-rotated log file with structured JSON entries.

Audit logging is diagnostic, not transactional: a logging failure (disk
full, permission error, ...) must never fail the operation being recorded.
``append()`` therefore never raises, and — when called from within a running
event loop, as every caller in this codebase is — performs the file write on
a background thread so a slow or contended disk never blocks request
handling.
"""

import asyncio
import json
import logging
import threading
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

logger = logging.getLogger(__name__)

# Audit log location (in backend data directory, not on shared drive)
AUDIT_LOG_DIR = Path(__file__).parent.parent.parent / "data"
AUDIT_LOG_FILE = AUDIT_LOG_DIR / "audit.log"

# Rotate at 10 MiB, keeping 5 backups (~50 MiB max on disk) so the log
# doesn't grow without bound.
_MAX_BYTES = 10 * 1024 * 1024
_BACKUP_COUNT = 5

_loggers_lock = threading.Lock()
# Keyed by log file path rather than a single module-level logger so tests
# can monkeypatch AUDIT_LOG_DIR/AUDIT_LOG_FILE per test (each temp path gets
# its own logger+handler) without one test's state leaking into another's.
_loggers: dict[Path, logging.Logger] = {}

# Tracks in-flight background writes so flush() can wait for them. Entries
# remove themselves via add_done_callback once complete.
_pending_writes: set[asyncio.Future] = set()


def _get_audit_logger(log_dir: Path, log_file: Path) -> logging.Logger | None:
    """Return the rotating-file logger for *log_file*, creating it on first use.

    Returns None (never raises) if the directory or file can't be created —
    callers treat that as "logging unavailable this time" and move on.
    """
    with _loggers_lock:
        existing = _loggers.get(log_file)
        if existing is not None:
            return existing

        try:
            log_dir.mkdir(parents=True, exist_ok=True)
        except (PermissionError, OSError) as e:
            logger.error(f"Failed to create audit log directory: {e}")
            return None

        try:
            handler = RotatingFileHandler(log_file, maxBytes=_MAX_BYTES, backupCount=_BACKUP_COUNT, encoding="utf-8")
        except (PermissionError, OSError) as e:
            logger.error(f"Failed to open audit log file: {e}")
            return None

        handler.setFormatter(logging.Formatter("%(message)s"))
        # A dedicated Logger instance (not the module's `logger`, and not
        # registered via getLogger) keeps audit entries from ever leaking
        # into the application's general log stream.
        audit_logger = logging.Logger(f"worktime.audit[{log_file}]", level=logging.INFO)
        audit_logger.propagate = False
        audit_logger.addHandler(handler)
        _loggers[log_file] = audit_logger
        return audit_logger


def _write_entry_sync(entry: dict) -> None:
    """Write one JSON-lines entry to the audit log.

    Never raises: RotatingFileHandler.emit() already routes write failures
    (e.g. disk full) through logging.Handler.handleError() instead of
    propagating them, and handler/directory creation failures are caught in
    _get_audit_logger().
    """
    audit_logger = _get_audit_logger(AUDIT_LOG_DIR, AUDIT_LOG_FILE)
    if audit_logger is None:
        return
    audit_logger.info(json.dumps(entry, ensure_ascii=False))


def append(target: str, action: str, details: str | None = None) -> None:
    """Record an audit log entry for *target* / *action* / *details*.

    Args:
        target: The target of the action (e.g., filename, user, resource)
        action: The action performed (e.g., "read", "write", "delete")
        details: Optional additional details about the action

    The entry is a JSON object: ``{"ts", "target", "action", "details"}``,
    written as one line to the rotating audit log file.

    When called from a running event loop (the normal case — every call site
    in this codebase is inside an async request/tool handler), the file
    write is dispatched to a background thread so it can't block the event
    loop. Outside a running loop (e.g. a script or a plain sync test), the
    write happens inline. Either way, this function itself never raises.
    """
    entry = {
        "ts": datetime.now(UTC).isoformat(),
        "target": target,
        "action": action,
        "details": details,
    }

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        _write_entry_sync(entry)
        return

    future = loop.run_in_executor(None, _write_entry_sync, entry)
    _pending_writes.add(future)
    future.add_done_callback(_pending_writes.discard)


async def flush() -> None:
    """Wait for all currently in-flight background audit writes to finish.

    Production code never needs this — audit logging is intentionally
    fire-and-forget. It exists for tests that assert on audit log file
    contents immediately after triggering a write from within a running
    event loop (where append() dispatches to a background thread).
    """
    pending = list(_pending_writes)
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
