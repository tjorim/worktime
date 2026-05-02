# Worktime .hday Helper

A minimal, self-contained HTTP server that reads and writes `.hday` files from a local or
network-share directory. Compiled to a single Windows EXE with Bun — no runtime installation
required on the target machine.

## What it does

- Exposes the same `/hday/:username` API shape as `backend/app/routers/hday.py`
- Reads from / writes to a configurable directory (local path or UNC/mapped-drive path)
- No database, no OIDC, no authentication — pure file I/O over HTTP

## Quick start

1. Download `worktime-hday-helper.exe` from the [Actions artifacts][ci]
2. Place it in any folder
3. Create a `.env` file next to it (optional):
   ```
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

### `GET /hday/:username[?format=raw|parsed]`

Returns a user's `.hday` file content.

- `format=raw` (default) — returns raw text only
- `format=parsed` — also parses the file into structured events

```json
{
  "username": "jsmith",
  "raw": "2025/01/15 # Day off\n",
  "etag": "sha256:abc123...",
  "events": null
}
```

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

## Building from source

Requires [Bun](https://bun.sh/) ≥ 1.1.

```bash
# From the repo root:
bun build hday-helper/src/main.ts --compile --outfile worktime-hday-helper
# Windows cross-compile:
bun build hday-helper/src/main.ts --compile --target=bun-windows-x64 --outfile worktime-hday-helper.exe
```

[ci]: https://github.com/tjorim/worktime/actions/workflows/build-hday-helper.yml
