# Local Worktime MCP Server

Worktime now ships a FastMCP v3 server in `backend/app/mcp_server.py` with read-only tools for schedule/work status queries.

## Prerequisites

```bash
cd backend
uv sync
uv run alembic upgrade head
```

Configure backend auth as usual (`OIDC_ISSUER_URL`, optional `OIDC_AUDIENCE`, etc).

Optional integration-key auth for local automation:

- `WORKTIME_MCP_INTEGRATION_KEYS` format: `token=user_id` or `token=user_id:admin`
- Multiple entries: comma-separated

Example:

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

## Exposed read-only tools

- `whoami`
- `get_current_status`
- `get_next_shift`
- `get_team_status`
- `get_time_off_summary`
- `get_hday_events`
- `get_work_location_summary`
- `get_time_tracking_summary`
- `get_gantt_tasks`
- `get_sync_status`
