# Worktime .hday Helper

A minimal, self-contained HTTP server that reads and writes `.hday` files from a local or
network-share directory. Compiled to a single executable with Bun (Windows or Linux) — no
runtime installation required on the target machine.

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
- On Windows, runs from a system tray icon instead of an open console window — see
  [Tray icon (Windows)](#tray-icon-windows) below
- On Linux, runs as a `systemd` service instead — see [Linux (systemd)](#linux-systemd) below

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
   `http://127.0.0.1:8080` as the `.hday` helper URL.

Once it's running, you can also open `http://127.0.0.1:8080/settings` in a browser to change
configuration without editing `.env` by hand, or `http://127.0.0.1:8080/logs` to see what it's doing.

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

## Tray icon (Windows)

On Windows, the console window is hidden by default and replaced with a system tray icon —
tinted green when the share is reachable, gray while starting up, red when it isn't (the same
states `/health` reports). Left- or right-clicking it opens a context menu:

| Item                  | Action                                          |
|-----------------------|--------------------------------------------------|
| Open helper status    | Opens `/health` in the default browser            |
| Settings              | Opens `/settings` in the default browser          |
| View logs             | Opens `/logs` in the default browser              |
| Restart               | Restarts the helper (same effect as saving `/settings` with no changes) |
| Quit                  | Stops the server and exits                        |

Set `HDAY_HELPER_NO_TRAY=1` (as an environment variable or in `.env`) to keep the old plain
console-app behavior instead — no tray icon, console window left visible. This is also what
happens automatically on every non-Windows platform, and if tray/window setup fails for any
reason (logged, not fatal): the HTTP server keeps running either way.

The tray icon variants are pre-rendered PNGs under `hday-helper/assets/` (tinted from
`frontend/public/assets/icons/icon-16.png` by `hday-helper/scripts/generate-tray-icons.ts`), not
generated at runtime — re-run that script and commit the result if the source logo changes.

The Win32 window/message-pump/menu logic runs in a separate Worker thread
(`hday-helper/src/tray-worker-entry.ts`), not on the thread that serves HTTP requests — the tray
context menu (`TrackPopupMenu`) blocks synchronously until the user picks an item or dismisses it,
and running that on the HTTP server's own thread would freeze request handling for as long as the
menu stayed open. That worker is pre-bundled to plain JS at build time
(`hday-helper/src/tray-worker.generated.js`, via `hday-helper/scripts/bundle-tray-worker.ts`) since
loading a `.ts` file directly into a `new Worker(...)` doesn't get transpiled inside a `bun build
--compile` standalone executable — re-run that script and commit the result if
`tray-worker-entry.ts` or anything under `hday-helper/src/win32/` changes.

### Manual QA checklist

The tray/window half of this feature (`hday-helper/src/tray.ts`, `hday-helper/src/tray-worker-entry.ts`,
`hday-helper/src/win32/`) has no CI coverage — there's no Windows GUI runner to verify a real
`Shell_NotifyIconW`/`WndProc` round trip against, only what `bun test` can check without actually
calling into `user32.dll`/`shell32.dll` (see `hday-helper/tests/tray.test.ts`,
`tray-worker-entry.test.ts`, `win32-structs.test.ts`). Before shipping a change to any of them,
manually verify on real Windows:

- [ ] The console window is hidden on launch and a tray icon appears
- [ ] The tray icon is gray briefly on startup, then green (with a share directory that's reachable)
- [ ] Making the share unreachable (e.g. disconnecting the mapped drive) turns the icon red within
      a few seconds; reconnecting it turns the icon back to green
- [ ] Left-click and right-click both open the same context menu, positioned at the cursor
- [ ] Each menu item does what it says: Open helper status / Settings / View logs open the right
      page in the default browser; Restart briefly drops and re-adds the tray icon; Quit exits
      the process and removes the tray icon (no ghost icon left behind)
- [ ] Clicking away from an open context menu (instead of choosing an item) dismisses it normally
- [ ] With the network share deliberately made slow/unreachable, the HTTP server (e.g. `/health`)
      keeps responding promptly — confirms the status poll's async fs check isn't blocking it
- [ ] While the tray context menu is open (not just while the tray is idle), the HTTP server (e.g.
      `/health`) still responds promptly — confirms the Win32 message pump and the blocking
      `TrackPopupMenu` call are actually isolated to the tray worker thread, not the HTTP server's
- [ ] Force a tray init failure (e.g. temporarily rename one of the `hday-helper/assets/
      tray-icon-*.png` files before building) and confirm the console stays visible instead of
      being hidden with nothing to show for it
- [ ] `HDAY_HELPER_NO_TRAY=1` restores the old plain-console behavior (visible window, no tray icon)

## Linux (systemd)

The helper is plain Bun/TypeScript with no OS-specific code outside `tray.ts` (Windows-only, see
above), so it runs on Linux the same way it does on Windows — just without a tray icon, since
desktop Linux has no `Shell_NotifyIcon` equivalent (a GNOME/KDE tray icon would go through a
D-Bus `StatusNotifierItem` service instead, which isn't implemented here).

Rather than a tray icon, run it as a `systemd` service:

1. Build (or download) the Linux binary — see [Building from source](#building-from-source)
2. Place it somewhere, e.g. `/opt/worktime-hday-helper/worktime-hday-helper`, and `chmod +x` it
3. Create a `.env` file next to it (same format as Windows — see [Configuration](#configuration)),
   e.g. with `SHARE_DIR` pointing at an NFS/CIFS mount instead of a UNC path
4. Copy `hday-helper/worktime-hday-helper.service` to `/etc/systemd/system/`, adjusting its
   `WorkingDirectory`/`ExecStart` to match, then:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now worktime-hday-helper
   ```

A config change saved via `/settings` still works under systemd: the shipped unit file sets
`HDAY_HELPER_NO_SELF_RESPAWN=1`, which tells the helper to just exit on a settings-triggered
restart instead of spawning its own detached replacement the way it does when run directly —
`Restart=always` brings it back up instead, avoiding two processes racing for the same port, and
an orphaned one `systemctl restart` wouldn't know about.

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

Returns an HTML form pre-filled with the current `SHARE_DIR`/`HOST`/`PORT`/`CORS_ORIGINS` values,
plus one or more ready-to-paste `.hday` helper URLs (with a Copy button) for Worktime's Developer
Options field. `HOST=127.0.0.1` or another specific address is shown as-is; `HOST=0.0.0.0` isn't
itself a dialable address, so it's expanded into `http://127.0.0.1:PORT` (this machine) plus
`http://<address>:PORT` for every non-internal IPv4 address found on the host (other machines on
the LAN — the reason to bind `0.0.0.0` in the first place).

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

A `: keepalive` comment is sent every 15s, mirroring `/hday/:username/events`. Capped at 50
concurrent subscribers — further connection attempts get HTTP 503 until one disconnects.

## Building from source

Requires [Bun](https://bun.sh/) ≥ 1.1.

```bash
# From the repo root:
bun build hday-helper/src/main.ts --compile --outfile worktime-hday-helper
# Windows cross-compile:
bun build hday-helper/src/main.ts --compile --target=bun-windows-x64 --outfile worktime-hday-helper.exe
# Linux cross-compile (explicit target, same result as the untargeted command above on a Linux host):
bun build hday-helper/src/main.ts --compile --target=bun-linux-x64 --outfile worktime-hday-helper
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
