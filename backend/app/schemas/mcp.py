"""MCP capability manifest schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.base import ResponseModel


class McpToolAccess(ResponseModel):
    tier: str


# Plain BaseModel: ``effect_detail`` is omitted from read tools (``response_model_exclude_unset``).
class McpToolCapability(BaseModel):
    """One tool in the MCP capability manifest (contract v1)."""

    name: str
    effect: Literal["read", "write"]
    # Present only for non-read tools.
    effect_detail: str | None = None
    requires_confirmation: bool
    access: McpToolAccess


class McpCapabilities(ResponseModel):
    """Authoritative MCP capability manifest."""

    contract_version: int
    enabled: bool
    mount_path: str
    version: str | None
    tools: list[McpToolCapability]
    # Always empty in contract v1.
    resources: list[object]
    prompts: list[object]
