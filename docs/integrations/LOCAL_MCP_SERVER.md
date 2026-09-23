# Local Worktime MCP Server

Worktime ships a FastMCP v4 server in `backend/app/mcp_server.py` — split into
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

1. Sign in normally, then open **Settings → Account → Integration clients** and
   create one. For automation, the equivalent endpoint is `POST /api/integration-clients`
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

## Connect over authenticated HTTP

Worktime tools require an authenticated principal, so stdio is not a supported
transport. Configure `MCP_BASE_URL`, run the FastAPI backend, and
connect to its `/mcp` endpoint using OAuth or a managed integration-client key
that carries the `worktime:mcp` scope.

## Capability discovery

`GET /api/mcp/capabilities` returns the authoritative, drift-proof list of
registered tools (sourced directly from `app.mcp_server.MCP_TOOL_CAPABILITIES`,
the same dict used to register tools). Use it instead of trusting this table if
the two ever appear to disagree — this doc can drift; that endpoint cannot.

The manifest follows the cross-app capability contract v1
([tjorim/apps#229](https://github.com/tjorim/apps/issues/229)), shared by
Travel, Worktime, Champagnefestival and Daynest:

- Top level: `contract_version` (`1`), `enabled`, `mount_path`, `version`,
  `tools`, `resources`, `prompts`. `tools` is empty when MCP isn't mounted.
- Per tool: `name`; `effect` (`read` or `write`); `requires_confirmation`
  (always `false` — Worktime has no per-call confirmation step); and `access`,
  an object of app-specific policy details. Worktime's `access` is
  `{"tier": "owner"}`: every tool acts on the caller's own data.
- Worktime's finer classification (`personal_write`) is reported as
  `effect_detail` on write tools. The flat `required_tier` key is a legacy
  duplicate of `access.tier`, kept for one release.
- The manifest describes tools; it never grants access. Each tool's
  authorization checks are unchanged (integration-client management tools stay
  hidden from managed/service credentials).

Each registered tool also carries standard MCP tool annotations (`readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`), which MCP clients read
from `tools/list`. They are hints, not enforcement. `readOnlyHint` is true
exactly when `effect` is `read`. For write tools, `destructiveHint` is true when
the tool can delete or overwrite existing data (updates, deletes,
`set_work_location`, integration-client rotate/revoke) and false for additive
ones (creates, `start_time_entry`, `stop_time_entry`, which only fills the empty
stop time). `create_time_off_event` is destructive because an existing
`entry_id` makes it overwrite that entry. `idempotentHint` is true only when
repeating the identical call has no further effect (updates, deletes,
`set_work_location`); `revoke_integration_client` is not, since every call
rewrites `revoked_at` and appends an audit entry.

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
