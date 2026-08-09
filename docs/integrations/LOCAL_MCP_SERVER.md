# Local Worktime MCP Server

Worktime ships a FastMCP v3 server in `backend/app/mcp_server.py` — split into
a thin assembler (auth, tool registration) plus focused domain modules under
`backend/app/mcp/` (identity, schedule, time_tracking, work_location,
time_off, gantt) — exposing both read tools and personal write tools scoped
to the authenticated caller's own data.

## Prerequisites

```bash
cd backend
uv sync
uv run alembic upgrade head
```

Configure backend auth as usual (`OIDC_ISSUER_URL`, optional `OIDC_AUDIENCE`, etc).

## Automation credentials (managed integration clients)

Automation callers (e.g. a home automation hub, a personal script) authenticate
with a **managed integration client** instead of an interactive OIDC login:

1. Sign in normally and create one via `POST /api/integration-clients`
   (`name`, optional `scopes` — defaults to `["worktime:mcp"]` — and
   `rate_limit_per_minute`, default 120). The response includes the raw key
   **once**; only its hash is stored server-side.
2. Use that key as the MCP client's Bearer token.
3. List (`GET /api/integration-clients`), rotate
   (`POST /api/integration-clients/{id}/rotate`), or revoke
   (`DELETE /api/integration-clients/{id}`) at any time — no server restart
   required. A revoked/rotated-away key stops working on its very next call.

`worktime:admin` is a separate, deliberate scope — granting it requires the
requesting Keycloak session to already be an admin; a non-admin caller (and,
structurally, any integration-client or personal-access-token caller — see
`backend/app/routers/integration_clients.py`) cannot mint or escalate a
credential via this endpoint. Every client is also rate-limited
per-minute (`rate_limit_per_minute`); calls beyond the limit fail with a
clear error instead of a silent 429 (MCP tool calls are JSON-RPC, not HTTP).

### Rotate the managed-key hashing secret

Set the new `INTEGRATION_KEY_HASH_SECRET` and temporarily retain the old value
as `INTEGRATION_KEY_HASH_SECRET_PREVIOUS`. Credentials verified with the old
secret are rehashed with the current secret on successful use. Remove the
previous value after every active client has authenticated or after the
operator-defined overlap window; only one previous secret is accepted.

### Legacy static integration keys (deprecated, still supported)

`WORKTIME_MCP_INTEGRATION_KEYS` — a comma-separated `token=user_id` or
`token=user_id:admin` env var parsed once at process startup — still works
alongside managed integration clients, for a migration/overlap period. It has
**no rotation or revocation** short of removing the entry and restarting the
process, so treat any configured value as a credential that needs manual
lifecycle management. New integrations should provision a managed
integration client instead; existing `WORKTIME_MCP_INTEGRATION_KEYS`
deployments should migrate off it before its removal (tracked in a future
issue). Support ends with the first Worktime release on or after **2026-11-01**;
that release will refuse `WORKTIME_MCP_INTEGRATION_KEYS` and operators must
provision managed clients before upgrading.

Example (legacy, deprecated):

```bash
export WORKTIME_MCP_INTEGRATION_KEYS="local-agent-token=1:admin"
```

## Run over stdio

```bash
cd backend
uv run python -m app.mcp_server
```

## Example client config

### Claude Desktop

```json
{
  "mcpServers": {
    "worktime": {
      "command": "uv",
      "args": ["run", "python", "-m", "app.mcp_server"],
      "cwd": "/absolute/path/to/worktime/backend"
    }
  }
}
```

### Codex CLI (example)

```json
{
  "mcp": {
    "servers": {
      "worktime": {
        "command": "uv",
        "args": ["run", "python", "-m", "app.mcp_server"],
        "cwd": "/absolute/path/to/worktime/backend"
      }
    }
  }
}
```

## Capability discovery

`GET /api/mcp/capabilities` returns the authoritative, drift-proof list of
registered tools (sourced directly from `app.mcp_server.MCP_TOOL_CAPABILITIES`,
the same dict used to register tools), each tagged with its side-effect
classification (`read` / `personal_write` / `admin_write`) and required
ownership tier (`owner` / `admin`). Use it instead of trusting this table if
the two ever appear to disagree — this doc can drift; that endpoint cannot.

## Exposed read tools

- `whoami` — includes managed integration-client identity/scopes when the
  caller authenticated that way (never raw key material)
- `get_current_status`
- `get_next_shift`
- `get_team_status`
- `get_next_shifts_for_team`
- `get_time_off_summary`
- `get_work_location_summary`
- `get_time_tracking_summary`
- `list_labels`
- `get_gantt_tasks`
- `get_sync_status`

## Exposed write tools

All write tools are scoped to the authenticated caller's own data (no tool
accepts a target user id) and share Worktime's domain-error mapping — a
`ConflictError`/`NotFoundError`/`ValidationError` from the underlying service
surfaces as a `ValueError` with the original, actionable message.

- `delete_label`
- `start_time_entry` / `stop_time_entry`
- `create_time_tracking_task` / `update_time_tracking_task` / `delete_time_tracking_task`
- `set_work_location` / `delete_work_location`
- `create_time_off_event` / `update_time_off_event` / `delete_time_off_event`
- `create_gantt_task` / `update_gantt_task` / `delete_gantt_task`

## Mutation audit trail

Every write tool call (and its REST equivalent) writes a durable audit entry
in the *same* database transaction as the mutation itself — see
`backend/app/audit/db.py`. Read it back via `GET /api/audit` (bounded,
`(created_at, id)`-ordered, own trail for non-admins, any/all with admin
scope). The rotated file logger from #984 (`backend/app/audit/logger.py`)
keeps running as secondary, best-effort operational telemetry; it is not the
authoritative record.
