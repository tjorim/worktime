# Worktime .hday Helper

A minimal, self-contained HTTP server that reads and writes `.hday` files from a local or
network-share directory. Compiled to a single Windows EXE with Bun — no runtime installation
required on the target machine.

## What it does

- Exposes the same `/hday/:username` and `/team/:teamId` API shapes as the Python backend
- Reads `.hday` files from the share root; reads team config (`.conf`, `.people`) from `{SHARE_DIR}/config/`
- Reads from / writes to a configurable directory (local path or UNC/mapped-drive path)
- No database, no OIDC, no authentication — pure file I/O over HTTP

## Quick start

1. Download `worktime-hday-helper.exe` from the [Actions artifacts][ci]
2. Place it in any folder
3. Create a `.env` file next to it (optional):
   ```env
   SHARE_DIR=Z:\worktime
   CORS_ORIGINS=https://worktime.example.com
   PORT=8080
   ```
4. Double-click `worktime-hday-helper.exe` or run from a terminal:
   ```cmd
   worktime-hday-helper.exe
   ```
5. Open **Worktime → Settings → About → Developer Options** and enter
   `http://localhost:8080` as the `.hday` helper URL.

## Configuration

All settings are read from environment variables (or a `.env` file in the current directory).

| Variable       | Default               | Description                                     |
|----------------|-----------------------|-------------------------------------------------|
| `SHARE_DIR`    | `./hday_files`        | Path to the directory containing `*.hday` files |
| `PORT`         | `8080`                | TCP port the server listens on                  |
| `HOST`         | `127.0.0.1`           | Bind address (`0.0.0.0` to allow LAN access)    |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed CORS origins. Use `*` only for local dev. |

### Network share (UNC path)

```env
SHARE_DIR=\\server\share\worktime
```

Or with a mapped drive letter:

```env
SHARE_DIR=Z:\worktime
```

## API

### `GET /health`

Returns the server status and whether the share directory is accessible.

```json
{ "status": "ok", "share": "accessible", "share_dir": "Z:\\worktime" }
```

HTTP 200 when accessible, 503 when the share directory cannot be reached.

### `GET /hday/:username`

Returns a user's `.hday` file content, always including parsed events.

```json
{
  "username": "jsmith",
  "raw": "2025/01/15 # Day off\n",
  "etag": "sha256:abc123...",
  "events": [{ "date": "2025-01-15", "label": "Day off" }]
}
```

`events` is an empty array if the file exists but cannot be parsed.
HTTP 200 on success, 404 if the file does not exist, 503 if the share is unreachable.

### `PUT /hday/:username`

Creates or updates a user's `.hday` file.

Request body:
```json
{
  "raw": "2025/01/15 # Day off\n",
  "etag": "sha256:abc123..."
}
```

| Field    | Required | Description                                                    |
|----------|----------|----------------------------------------------------------------|
| `raw`    | one of   | Raw `.hday` text to write                                      |
| `events` | one of   | Parsed events to serialize and write (takes precedence)        |
| `etag`   | no       | Expected current etag; omit to create a new file               |

Returns HTTP 200 `{ "etag": "sha256:..." }` on success, 409 if the etag doesn't match
(conflict), 422 if neither `raw` nor `events` is provided, 503 if the share is unreachable.

### `GET /team/:teamId`

Returns team name and member list parsed from `{SHARE_DIR}/config/{teamId}.conf` and
`{SHARE_DIR}/config/{teamId}.people`.

```json
{
  "team_id": "myteam",
  "name": "My Team",
  "sections": [
    { "title": "Management", "members": [{ "username": "jsmith", "display_name": "Jane Smith" }] }
  ],
  "members": [{ "username": "jsmith", "display_name": "Jane Smith" }]
}
```

If the `.people` file has no `<h2>` section headers, `sections` contains a single entry with `title: null`.
HTTP 200 on success, 404 if team config/people files not found, 503 if the share is unreachable.

### `GET /team/:teamId/hday`

Returns team info plus each member's `.hday` file content, always including parsed events.
Members without a `.hday` file get `raw: ""`, `etag: null`, `events: []`.

```json
{
  "team_id": "myteam",
  "name": "My Team",
  "sections": [
    {
      "title": "Management",
      "members": [
        { "username": "jsmith", "display_name": "Jane Smith", "raw": "...", "etag": "sha256:...", "events": [...] }
      ]
    }
  ],
  "members": [
    { "username": "jsmith", "display_name": "Jane Smith", "raw": "...", "etag": "sha256:...", "events": [...] }
  ]
}
```

HTTP 200 on success, 404 if team not found, 503 if the share is unreachable.
Response headers include `X-File-Read-Ms` and `X-Parse-Time-Ms`.

## Building from source

Requires [Bun](https://bun.sh/) ≥ 1.1.

```bash
# From the repo root:
bun build hday-helper/src/main.ts --compile --outfile worktime-hday-helper
# Windows cross-compile:
bun build hday-helper/src/main.ts --compile --target=bun-windows-x64 --outfile worktime-hday-helper.exe
```

[ci]: https://github.com/tjorim/worktime/actions/workflows/build-hday-helper.yml
