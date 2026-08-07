"""Shared response-formatting helpers for MCP domain modules."""

from __future__ import annotations

from datetime import UTC, date, datetime


def to_iso_date(value: date) -> str:
    return value.isoformat()


def to_iso_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()
