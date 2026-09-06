# Worktime .hday Helper

A minimal, self-contained HTTP server that reads and writes `.hday` files from a local or
network-share directory. Compiled to a single Windows EXE with Bun — no runtime installation
required on the target machine.

## What it does

- Exposes `/hday/:username` and `/team/:teamId` HTTP endpoints for `.hday` file and team-config access
- Notifies clients over SSE (`/hday/:username/events`) when a user's `.hday` file changes on disk
- Reads `.hday` files from the share root; reads team config (`.conf`, `.people`) from `{SHARE_DIR}/config/`
- Reads from / writes to a configurable directory (local path or UNC/mapped-drive path)
- No database, no OIDC, no authentication — pure file I/O over HTTP
- `/settings` lets you view and edit `SHARE_DIR`/`PORT`/`HOST`/`CORS_ORIGINS` from a browser instead
  of hand-editing `.env` and restarting manually — saving restarts the helper for you
- Logs each request (method, path, status, timing) to the console, an in-memory ring buffer, and a
  rotating log file next to the executable — reachable from a browser at `/logs`, so diagnostics
  stay available even with no console window open

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

Once it's running, you can also open `http://localhost:8080/settings` in a browser to change
configuration without editing `.env` by hand, or `http://localhost:8080/logs` to see what it's doing.

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

Returns the server status, the helper's own version, and whether the share directory is accessible.

```json
{ "status": "ok", "version": "2026.8.2", "share": "accessible", "share_dir": "Z:\\worktime" }
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

### `GET /hday/:username/events`

Server-Sent Events stream that notifies a client when that user's `.hday` file changes on
disk — written by this server (`PUT`) or edited directly on the share by other tooling. Mirrors
the main app's own notify-then-pull pattern: the event carries only the file's current etag, not
its content, so a client that already knows that etag (e.g. because it just wrote it) can ignore
the notification instead of re-fetching.

```text
event: hday_changed
data: {"type":"hday_changed","username":"jsmith","etag":"sha256:abc123..."}
```

A `: keepalive` comment is sent every 15s. One directory watcher is shared across all connected
clients, started on the first subscriber and stopped once the last one disconnects.

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

### `GET /settings`

Returns an HTML form pre-filled with the current `SHARE_DIR`/`HOST`/`PORT`/`CORS_ORIGINS` values.

### `POST /settings`

Submits the form (`application/x-www-form-urlencoded`, the four fields above) and rewrites `.env`
next to the executable with **just those four keys** — any other lines, comments, or extra keys in
an existing `.env` are not preserved. Before anything is written, the new `HOST`/`PORT` are checked
to actually be bindable (skipped when unchanged) so a typo can't strand the helper mid-restart, and
the new `SHARE_DIR` is checked to be a usable directory — created if it doesn't exist yet (an empty
share, e.g. for a first-time setup, is expected and fine), rejected if it can't be created or isn't
read/write accessible. If saved, the helper immediately restarts itself to apply the change (needed
for `PORT`/`HOST`, and simpler than special-casing which settings are hot-reloadable), and the
response page polls the new address and redirects back to `/settings` once it's back up. Returns
HTTP 400 with the form re-rendered if a value is invalid, unbindable, or an unusable `SHARE_DIR`, 403
if the request's `Origin` doesn't match its own `Host` (CSRF defense — a cross-site form submission
can't reconfigure the helper), 413 if the body is too large.

### `GET /logs`

Returns the last ~500 logged request lines. Plain text (`text/plain`) by default, suitable for
`curl` or scripts; returns a minimally-styled auto-scrolling HTML viewer instead when the request's
`Accept` header includes `text/html` (i.e. when opened in a browser), which stays live via
`/logs/events`.

Logs are also written to a rotating file (`hday-helper.log`, capped at 5 MiB with one backup) next
to the executable, so history survives a restart or crash even with no console attached.

### `GET /logs/events`

Server-Sent Events stream that pushes each new log line as it's written.

```text
event: log_line
data: {"type":"log_line","line":"[2026-01-01T00:00:00.000Z] GET /health -> 200 (1.2ms)"}
```

A `: keepalive` comment is sent every 15s, mirroring `/hday/:username/events`.

## Building from source

Requires [Bun](https://bun.sh/) ≥ 1.1.

```bash
# From the repo root:
bun build hday-helper/src/main.ts --compile --outfile worktime-hday-helper
# Windows cross-compile:
bun build hday-helper/src/main.ts --compile --target=bun-windows-x64 --outfile worktime-hday-helper.exe
```

## Testing

```bash
# From the repo root:
bun test hday-helper/tests
```

Tests spawn the real `src/main.ts` script as a child process against a throwaway
`SHARE_DIR` and exercise it over real HTTP — black-box, no test-only exports needed.
Covers routing, path-traversal defense, write-conflict/ETag semantics, the request
size cap, team aggregation, CORS, the log ring buffer/SSE stream, and `/settings`
form validation and persistence. The `/settings` tests run against their own
dedicated instance with `HDAY_HELPER_SKIP_RESTART_FOR_TESTS=1` set, so a valid save
can be exercised without the shared test instance actually restarting mid-suite; a
separate, single end-to-end test (no env var) verifies the real self-restart on its
own throwaway port.

[ci]: https://github.com/tjorim/worktime/actions/workflows/build-hday-helper.yml
