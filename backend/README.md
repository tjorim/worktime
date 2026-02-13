# Backend

[![Build Windows Executable](https://github.com/tjorim/worktime/actions/workflows/build-exe.yml/badge.svg)](https://github.com/tjorim/worktime/actions/workflows/build-exe.yml)

This document describes the backend for Worktime: a lightweight API server that bridges the web
frontend with .hday files and team configuration stored on a shared network drive (NFS/SMB). The
goal is to keep the app local-first while enabling shared team data for users on the same network.

> **💡 Quick Start for Windows Users:** Download the [standalone Windows executable](#windows-executable) - no Python installation required!

## Table of contents

- [Backend responsibilities](#backend-responsibilities)
- [File share structure](#file-share-structure)
- [API surface](#api-surface)
- [iCal subscription feed](#ical-subscription-feed)
- [Server-side .hday parser](#server-side-hday-parser)
- [In-memory cache](#in-memory-cache)
- [Concurrency and conflict handling](#concurrency-and-conflict-handling)
- [Audit logging](#audit-logging)
- [Security](#security)
- [CORS](#cors)
- [Hosting and deployment](#hosting-and-deployment)
  - [Windows Executable](#windows-executable)
- [WebPlanner feature analysis](#webplanner-feature-analysis)
- [Resolved questions](#resolved-questions)
- [Conclusions](#conclusions)

## Backend responsibilities

- Serve as an HTTP bridge between the Worktime web frontend and .hday files on a mounted network
  share (NFS/SMB).
- Read team configuration and membership from config/people files on the share.
- Read .hday files from the share, optionally parsing them server-side for structured responses.
- Write .hday files from either raw text or structured JSON events.
- Cache all file data in memory for fast responses, with write-through invalidation and TTL-based
  refresh for external changes.
- Detect and handle concurrent edits (web app and direct file edits on the share).
- Provide an append-only audit log for write operations.

No authentication is required — the backend runs on a trusted internal network. The host OS handles
share access via its logged-in user credentials.

## File share structure

The network share contains team configuration files in a `config/` subdirectory and per-user .hday files in the root:

```text
<share>/
├── config/                    # Team configuration subdirectory
│   ├── team1.conf            # Team 1 configuration (key=value format)
│   ├── team1.people          # Team 1 members list
│   ├── team2.conf            # Team 2 configuration
│   └── team2.people          # Team 2 members list
├── alice.hday                # Alice's time-off events
├── bob.hday                  # Bob's time-off events
└── charlie.hday              # Charlie's time-off events
```

### Config file

Team configuration files are stored in `config/{team_id}.conf` with key=value format:

```text
costcentername=CC000000
costcenterpage=https://example.com/costcenter
disablecr=false
groupname=Generic Group Name
grouppage=https://example.com/group
region=XX
showlink=false
userdefinedday=other
userdefinedoverrules=true
userfilecontact=Contact Person (ABCD)
```

The backend extracts the `groupname` field as the team's display name.

### People file

Team members are listed in `config/{team_id}.people` with CSV format and optional HTML section headers:

```text
<h2>Team Management</h2>
alice,Alice Johnson
bob,Bob Smith

<h2>Team Support</h2>
charlie,Charlie Brown
```

HTML heading tags (`<h1>` through `<h6>`) are skipped during parsing.
The `username` field maps directly to `{username}.hday` in the share root. The display name is used
in the UI.

### .hday files

Per-user time-off event files in the .hday format, stored in the share root directory. 
See the main project's AGENTS.md for format documentation. The backend reads and writes 
these files, optionally parsing them server-side when `?format=parsed` is requested 
(see [Response format](#response-format-formatrawparsed)).

## API surface

| Endpoint              | Method | Purpose                                        |
| --------------------- | ------ | ---------------------------------------------- |
| `/v1/hday/:username`  | GET    | Read a user's .hday file                       |
| `/v1/hday/:username`  | PUT    | Write a user's .hday file                      |
| `/v1/team/:id`        | GET    | Read team config (name + member list)          |
| `/v1/team/:id/hday`   | GET    | Read all team members' .hday files in one call |
| `/v1/health`          | GET    | Health check and share accessibility status    |
| `/v1/debug/benchmark` | GET    | Performance comparison of raw vs parsed modes  |

No authentication required on any endpoint (trusted network).

### Response format: `?format=raw|parsed`

All `.hday` read endpoints (`GET /v1/hday/:username` and `GET /v1/team/:id/hday`) support a
`format` query parameter to control whether the server returns raw .hday text or server-parsed
events:

- **`?format=raw`** — Returns raw .hday text. The frontend's own parser handles structuring the
  data. No server-side parser needed.
- **`?format=parsed`** — Returns server-parsed events as structured JSON. The server needs a .hday
  parser that matches the frontend's output.

The default will be determined by benchmarking (see
[Performance benchmarking](#performance-benchmarking)). The goal is to measure whether server-side
parsing or client-side parsing is more performant end-to-end, especially for the bulk team endpoint.

When `format=parsed` or when both formats are returned, all responses include timing headers:

- `X-File-Read-Ms` — Time spent reading the file(s) from the share.
- `X-Parse-Time-Ms` — Time spent parsing .hday content (0 for `format=raw`).
- `X-Total-Ms` — Total server-side processing time.

### `GET /v1/hday/:username`

Reads `{username}.hday` from the share. The `etag` is a content hash used for conflict detection on
subsequent writes.

**Response with `?format=raw` (200 OK):**

```json
{
  "username": "alice",
  "raw": "2025/01/15 # Vacation day\n2025/12/23-2025/12/27 # Christmas",
  "etag": "sha256:abc123..."
}
```

**Response with `?format=parsed` (200 OK):**

```json
{
  "username": "alice",
  "raw": "2025/01/15 # Vacation day\n2025/12/23-2025/12/27 # Christmas",
  "events": [
    {
      "type": "range",
      "start": "2025/01/15",
      "end": "2025/01/15",
      "flags": ["holiday"],
      "title": "Vacation day"
    }
  ],
  "etag": "sha256:abc123..."
}
```

Both modes always include `raw` so the frontend can edit and PUT back the original text.

**Error responses:**

- **404 Not Found**: No .hday file exists for this username. This is valid — the user may not have
  any events yet.
- **503 Service Unavailable**: Share is not accessible.

### `PUT /v1/hday/:username`

Writes the .hday file. The client can send either raw .hday text or structured JSON events — the
server accepts both formats.

**Request body (raw text):**

```json
{
  "raw": "2025/01/15 # Vacation day\n2025/12/23-2025/12/27 # Christmas",
  "etag": "sha256:abc123..."
}
```

When `raw` is provided, the server writes it to the file as-is. Useful for paste/import workflows
or when the frontend has the .hday text ready.

**Request body (structured events):**

```json
{
  "events": [
    {
      "type": "range",
      "start": "2025/01/15",
      "end": "2025/01/15",
      "flags": ["holiday"],
      "title": "Vacation day"
    },
    {
      "type": "range",
      "start": "2025/12/23",
      "end": "2025/12/27",
      "flags": ["holiday"],
      "title": "Christmas"
    }
  ],
  "etag": "sha256:abc123..."
}
```

When `events` is provided, the server serializes them to .hday format (`to_text()`) before writing.
This is the natural path for UI edits where the frontend works with structured event objects.

If both `raw` and `events` are provided, `events` takes precedence (the structured format is the
canonical representation from the UI).

**Response (200 OK):**

```json
{
  "etag": "sha256:def456..."
}
```

**Error responses:**

- **409 Conflict**: File was modified since the client's last read (etag mismatch). Returns the
  current file content and new etag so the client can merge.
- **422 Unprocessable Entity**: Neither `raw` nor `events` provided, or `events` contains invalid
  data.
- **503 Service Unavailable**: Share is not accessible.

**Creating new files:** When a user has no existing .hday file (previous GET returned 404), the
client sends a PUT with `"etag": null`. If a file was created between the GET and PUT (by another
source), the server detects this and returns 409.

### `GET /v1/team/:id`

Reads the `config` and `people` files for the given team identifier from the share. The `:id`
corresponds to the team's directory or identifier on the share.

**Response (200 OK):**

```json
{
  "id": "alpha",
  "name": "Team Alpha",
  "members": [
    { "username": "alice", "displayName": "Alice Johnson" },
    { "username": "bob", "displayName": "Bob Smith" }
  ]
}
```

**Error responses:**

- **404 Not Found**: No team with this identifier exists on the share.
- **503 Service Unavailable**: Share is not mounted or config/people files are missing.

### `GET /v1/team/:id/hday`

Returns all team members' .hday data in a single response. This avoids N+1 requests when the
frontend needs to display the full team's time-off overview. Supports the same `?format=raw|parsed`
parameter.

**Response with `?format=raw` (200 OK):**

```json
{
  "id": "alpha",
  "name": "Team Alpha",
  "members": [
    {
      "username": "alice",
      "displayName": "Alice Johnson",
      "raw": "2025/01/15 # Vacation day\n2025/12/23-2025/12/27 # Christmas",
      "etag": "sha256:abc123..."
    },
    {
      "username": "bob",
      "displayName": "Bob Smith",
      "raw": "",
      "etag": null
    }
  ]
}
```

**Response with `?format=parsed` (200 OK):**

```json
{
  "id": "alpha",
  "name": "Team Alpha",
  "members": [
    {
      "username": "alice",
      "displayName": "Alice Johnson",
      "raw": "2025/01/15 # Vacation day\n2025/12/23-2025/12/27 # Christmas",
      "events": [
        {
          "type": "range",
          "start": "2025/01/15",
          "end": "2025/01/15",
          "flags": ["holiday"],
          "title": "Vacation day"
        }
      ],
      "etag": "sha256:abc123..."
    },
    {
      "username": "bob",
      "displayName": "Bob Smith",
      "raw": "",
      "events": [],
      "etag": null
    }
  ]
}
```

Members without a .hday file get empty `raw`/`events` and `"etag": null` — they are valid team
members who simply have no time-off events yet.

**Error responses:**

- **404 Not Found**: No team with this identifier exists on the share.
- **503 Service Unavailable**: Share is not accessible.

### `GET /v1/health`

Returns basic health status including share accessibility.

**Response (200 OK):**

```json
{
  "status": "ok",
  "share": "accessible"
}
```

Alias: `/healthz` for container orchestration compatibility.

### Performance benchmarking

`GET /v1/debug/benchmark` runs comprehensive performance benchmarks comparing raw and parsed modes
for both individual file operations and team bulk operations. This helps determine whether
server-side parsing is beneficial or if the frontend should always parse client-side.

**Endpoint:** `GET /v1/debug/benchmark`

**Production Mode:** This endpoint is **disabled in production environments**. The debug router is
only registered when `ENVIRONMENT != "production"` (see `app/main.py`). Attempts to access this
endpoint in production will return 404 Not Found.

**Response (200 OK):**

```json
{
  "file": "testuser.hday",
  "fileSize": 4200,
  "eventCount": 87,
  "iterations": 100,
  "raw": {
    "avgMs": 0.8,
    "p95Ms": 1.2,
    "responseSizeBytes": 4350
  },
  "parsed": {
    "avgMs": 3.1,
    "p95Ms": 4.8,
    "responseSizeBytes": 12400
  },
  "teamBulk": {
    "memberCount": 15,
    "raw": {
      "avgMs": 12.0,
      "p95Ms": 18.5,
      "responseSizeBytes": 65000
    },
    "parsed": {
      "avgMs": 45.2,
      "p95Ms": 62.1,
      "responseSizeBytes": 186000
    }
  },
  "cache": {
    "warmCacheAvgMs": 0.05,
    "coldCacheAvgMs": 0.85
  }
}
```

**Response Fields:**

- `file`: Name of the .hday file used for benchmarking (automatically discovered from share directory)
- `fileSize`: Size of the test file in bytes
- `eventCount`: Number of events in the test file
- `iterations`: Number of iterations run for each benchmark (default: 100)
- `raw`: Individual file benchmark in raw format mode (file I/O only, no server-side parsing)
  - `avgMs`: Average response time in milliseconds
  - `p95Ms`: 95th percentile response time in milliseconds
  - `responseSizeBytes`: Size of the JSON response payload
- `parsed`: Individual file benchmark in parsed format mode (file I/O + server-side parsing)
  - `avgMs`: Average response time including parsing in milliseconds
  - `p95Ms`: 95th percentile response time including parsing in milliseconds
  - `responseSizeBytes`: Size of the JSON response payload (typically 3-4x larger than raw due to
    structured event objects)
- `teamBulk`: Team bulk endpoint benchmarks (reading all team members' .hday files)
  - `memberCount`: Number of team members whose files were read
  - `raw`: Team bulk in raw format mode
  - `parsed`: Team bulk in parsed format mode
- `cache`: Cache performance measurements comparing cold vs warm cache reads
  - `warmCacheAvgMs`: Average response time when data is already cached in memory
  - `coldCacheAvgMs`: Response time for a cold cache read (includes file I/O)

**Error Responses:**

- **503 Service Unavailable** (`no_test_data`): No suitable test data found in the share directory.
  Requires at least one `.hday` file and one team configuration (with both `.conf` and `.people` files in `config/` subdirectory).
- **500 Internal Server Error**: Unexpected error during benchmark execution.

**End-to-End Measurement Guidance:**

The benchmark endpoint measures **server-side processing time only**. To make an informed decision
about the default `?format` parameter, you need to measure the complete round-trip time including
network transfer and client-side processing.

**Total Time Calculations:**

- **Raw mode total** = server file I/O + network transfer time + **client parse time**
- **Parsed mode total** = server file I/O + server parse time + network transfer time (larger payload)

The trade-off is between:

- **Raw mode**: Smaller response payload (faster network transfer), but frontend must parse
- **Parsed mode**: Larger response payload (slower network transfer), but frontend receives
  structured data immediately

**Frontend Timing Approach:**

Use the browser's `performance.now()` API to measure client-side parse time and total request time:

```javascript
// Measuring total request time (including network)
const requestStart = performance.now();
const response = await fetch('/v1/hday/username?format=raw');
const data = await response.json();
const requestEnd = performance.now();
const totalRequestTimeMs = requestEnd - requestStart;

// Measuring client-side parse time (for raw mode)
const parseStart = performance.now();
const events = parseHdayText(data.raw); // Your parser function
const parseEnd = performance.now();
const clientParseTimeMs = parseEnd - parseStart;

// Calculate total time for each mode:
// - Raw mode total = totalRequestTimeMs + clientParseTimeMs
// - Parsed mode total = totalRequestTimeMs (includes server parse + larger payload transfer, no client parsing)
```

**Interpreting Results:**

Compare the totals for each mode across different network conditions:

1. **Fast local network** (e.g., same building):
   - If `raw mode total < parsed mode total`: Default to `?format=raw`
   - Network transfer time is negligible, so client-side parsing overhead matters less
   - Smaller payloads reduce memory pressure on the server

2. **Slow or high-latency network** (e.g., VPN, remote access):
   - If `parsed mode total < raw mode total`: Consider `?format=parsed`
   - Larger payload penalty may be offset by avoiding client-side parse time
   - However, server CPU becomes a bottleneck for team bulk operations

3. **Team bulk operations** (`/v1/team/:id/hday`):
   - With many team members (10+), parsed mode response size can be 150-200 KB+
   - Network transfer time dominates on slower connections
   - Raw mode is typically faster for bulk operations even with client-side parsing

4. **Cache effectiveness**:
   - Compare `warmCacheAvgMs` vs `coldCacheAvgMs` from the benchmark
   - A large difference (10x or more) indicates effective caching
   - Warm cache makes server-side operations very fast, favoring parsed mode
   - Cold cache makes file I/O the bottleneck, reducing the benefit of server-side parsing

**Recommendation:** Start with `?format=raw` as the default. This minimizes server CPU usage and
response payload size while keeping the frontend parser active (needed for offline use anyway). Add
UI controls to let users switch to parsed mode if they prefer, and consider making it
user-configurable in settings.

## iCal subscription feed

`GET /v1/cal/:token.ics` would serve a personalized iCalendar (RFC 5545) feed that calendar apps can
subscribe to. Users add a `webcal://` URL to Google Calendar, Outlook, Apple Calendar, etc. and the
app periodically polls for updates — no manual re-export needed.

This endpoint is a **future enhancement**, not part of the initial implementation. It is documented
here because the design was explored in the original backend plan and remains relevant.

### Why a subscription link instead of file export

A one-time .ics file download becomes stale immediately. A subscription URL lets the calendar app
refresh automatically (typically every few hours), so shift changes and new time-off events appear
without user intervention.

### URL format

```text
webcal://worktime.internal:8000/v1/cal/<feed-token>.ics
```

The `feed-token` is a long-lived, per-user opaque token generated when the user requests a
subscription link. On a trusted network this is mainly for URL uniqueness and user identification
rather than strict security.

### Feed contents

The feed combines data from the user's .hday file and roster configuration:

| Source              | VEVENT fields                                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shifts**          | Computed from roster config + user's team. `SUMMARY`: shift name (e.g., "Morning"). `DTSTART`/`DTEND`: shift hours. `CATEGORIES`: schedule type.         |
| **Time-off events** | From .hday data on the share. `SUMMARY`: event comment or type name. `DTSTART`/`DTEND`: event date(s). `CATEGORIES`: event type flag (holiday, business, sick, etc.). |
| **Public holidays** | Optional. `SUMMARY`: holiday name. `TRANSP`: TRANSPARENT.                                                                                                |

### Response headers

```http
Content-Type: text/calendar; charset=utf-8
Cache-Control: no-cache, no-store, must-revalidate
```

No caching headers — calendar apps manage their own poll interval. The server always returns the
current state by reading the .hday file from the share on each request.

### Security considerations

- **No Bearer auth**: Calendar apps cannot send Authorization headers on subscription URLs. Auth is
  via the feed token embedded in the URL path.
- **Feed token properties**: 256-bit random, URL-safe (base64url). Revocable per user. One active
  feed token per user (generating a new one invalidates the previous).
- **Rate limiting**: 60 requests per token per hour. Returns `429` with `Retry-After` if exceeded.
- **Privacy**: Feed URLs should be treated as personal — the settings UI should warn users not to
  share their subscription link publicly.
- **Revocation**: User can regenerate their feed token from settings, which immediately invalidates
  the old URL.

### Frontend integration

The settings panel would show a "Subscribe to calendar" section with:

1. A generated `webcal://` link the user can copy or click to open in their default calendar app.
2. A "Regenerate link" button that revokes the old token and creates a new one.
3. A brief explanation that the link is personal and should not be shared.

### Calendar import (reverse direction)

The hdayplanner prototype included a Microsoft Graph sync stub (`backend/hdayplanner/app/graph/sync.py`)
that demonstrated importing time-off events from Outlook calendars into .hday format:

- Query out-of-office events for the signed-in user via Microsoft Graph API.
- Map event subjects to .hday flags: "vakantie"/"vacation"/"holiday" → default, "cursus"/"training"
  → course, else → business.
- Respect event privacy: mask titles for events marked as private.
- Return proposed events for user review before merging — never write directly.

This could also apply to Google Calendar API. Both are future enhancements, not currently planned.

## Server-side .hday parser

The server needs .hday processing in two directions:

- **Parser** (`parse_text`): Only needed when `?format=parsed` is requested on GET endpoints. In
  `?format=raw` mode, the server is a pure file I/O bridge and does not parse.
- **Serializer** (`to_text`): Needed when the client PUTs structured `events` JSON. Converts event
  objects to .hday text format for writing to the share.

Whether to use the server-side parser by default on reads is an open question — the
[performance benchmarking](#performance-benchmarking) endpoint exists to help answer it.

The hdayplanner prototype (`backend/hdayplanner/app/hday/parser.py`) provides a working starting
point for both parser and serializer in Python.

### Responsibilities

- **Structured reads** (parsed mode only): Return parsed events alongside raw text so the frontend
  can skip parsing on initial load from the backend.
- **Structured writes**: Serialize JSON events to .hday format when the client sends `events`
  instead of `raw`.
- **Round-trip fidelity**: The `raw` field is always included in GET responses regardless of mode.
  When the client sends `raw` on PUT, the server writes it as-is without reformatting.

### Parser parity

If the server-side parser is used, it must stay in sync with the frontend parser
(`src/lib/hday/parser.ts`, 139 test cases). Share test vectors between the two implementations to
catch divergence. The frontend parser is the reference implementation.

If the backend is implemented in Node.js/TypeScript, the frontend parser can be shared directly,
eliminating this concern entirely.

### Flag handling

Use a loose allowlist for event flags rather than a strict enum. The hdayplanner prototype's
`models.py` defined `Flag` with only 6 values while its `parser.py` handled 12+ flags — this
mismatch caused silent validation errors. Accept all flags defined in the frontend's type system and
pass through unknown flags without error.

### What the prototype got right

- Regex-based parsing with separate patterns for range and weekly events.
- Flag normalization (mutual exclusivity of type and time/location flags).
- `to_text()` round-trip serialization preserving original flag order.
- Defaulting to `holiday` type when no explicit type flag is present.
- Marking unparseable lines as `unknown` type rather than discarding them.

### What to change from the prototype

- Fix the `Flag` type to include all flags the parser actually handles.
- The server should write raw client text, not `to_text(events)` — avoids reformatting.
- Add test vectors shared with the frontend's 139-case test suite.

## In-memory cache

The backend can cache all file data in RAM for a significant speed boost. The files are small (a few
KB each), the team is small, and NFS/SMB network latency is the main bottleneck. Serving from memory
eliminates file I/O on the hot path entirely.

### What to cache

| Data                | Source                          | Memory cost             |
| ------------------- | ------------------------------- | ----------------------- |
| Raw .hday text      | Per-user `.hday` files          | ~2-5 KB per user        |
| Parsed events       | Result of `parse_text()`        | ~5-15 KB per user       |
| Precomputed etags   | SHA-256 of raw file bytes       | 64 bytes per user       |
| Team config         | `config` + `people` files       | < 1 KB                  |

For a 20-person team, total memory footprint is well under 1 MB.

### Cache invalidation strategy

The challenge is that files can change outside the backend (direct edits on the share). Four
strategies were considered:

| Strategy              | How it works                                                      | Trade-off                                           |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| **Polling with mtime** | Periodically check file modification times, reload on change     | Simple, small staleness window (e.g., 5-10s)        |
| **File watcher**       | OS-level notifications (inotify/fsnotify)                        | Instant, but unreliable on NFS/SMB                  |
| **TTL + write-through** | Cache expires after N seconds; API writes invalidate immediately | Simple, predictable, good fit for this use case     |
| **Etag on read**       | Check file hash on each request, serve cached if unchanged       | Always fresh, but still hits the share for stat/hash |

**Recommendation: TTL + write-through.** Most writes go through the API, which invalidates the
cache instantly. A short TTL (5-30 seconds, configurable) catches the rare direct file edit on the
share. This provides near-instant responses for the common case while keeping staleness bounded.

### Cache lifecycle

```text
Startup:
  1. Read all files from share (config, people, *.hday)
  2. Parse all .hday files
  3. Compute etags
  4. Store everything in memory

On GET request:
  1. Check if cache entry has expired (TTL)
  2. If fresh → serve from memory (no file I/O)
  3. If stale → check file mtime on share
     a. If unchanged → refresh TTL, serve from memory
     b. If changed → re-read file, re-parse, update cache, serve

On PUT request (write-through):
  1. Write file to share
  2. Immediately update cache entry (raw text, parsed events, new etag)
  3. Reset TTL

On external file change (detected by TTL expiry):
  1. Next GET triggers re-read from share
  2. Cache entry updated transparently
```

### Impact on `?format=raw` vs `?format=parsed`

With caching, the performance comparison changes significantly:

- **Without cache**: `?format=parsed` adds server parse time on every request.
- **With cache**: Parsed events are computed once and served from memory. Both `?format=raw` and
  `?format=parsed` are essentially the same speed — just serializing from memory to JSON.

This means `?format=parsed` becomes effectively free after the first request (or after cache
refresh). The [performance benchmarking](#performance-benchmarking) endpoint should measure both
cold-cache and warm-cache scenarios to capture this.

### Configuration

| Variable          | Description                                   | Default |
| ----------------- | --------------------------------------------- | ------- |
| `CACHE_TTL`       | Seconds before a cache entry is considered stale | `10`  |
| `CACHE_ENABLED`   | Enable/disable in-memory caching              | `true`  |

Disabling the cache (`CACHE_ENABLED=false`) makes every request read from the share directly. Useful
for debugging or when the share is local and fast.

## Concurrency and conflict handling

Since .hday files live on a shared network drive, they can be edited both through the web app and
directly on the file system (e.g., with a text editor). The backend must handle this gracefully.

### Conflict detection via content hashing

- On `GET`, the server returns the etag (from cache or computed from the raw file bytes).
- On `PUT`, the client sends the `etag` it received on its last read.
- The server checks the current etag (from cache if fresh, otherwise re-read from share) and
  compares:
  - **Match**: Write proceeds. Cache entry and etag updated.
  - **Mismatch**: `409 Conflict`. Current file content + new etag returned for client-side merge.
- If the file was created between the client's 404 and PUT (client sends `etag: null` but file now
  exists), the server returns 409.

### Why not file locking

File locking on NFS/SMB is unreliable across platforms and can leave stale locks if a client
disconnects. Content hashing (optimistic concurrency) is simpler, more portable, and does not block
direct file edits on the share.

### Write atomicity

Writes use a temporary file + rename pattern to prevent partial writes:

1. Write to `{username}.hday.tmp` on the same share.
2. Rename (`os.replace()`) to overwrite the original. This is atomic on the same filesystem.
3. If the rename fails, clean up the temp file.

**Note:** Atomic rename on NFS/SMB is best-effort — some NFS implementations do not guarantee
atomicity for cross-client renames. For the expected usage pattern (single backend writer + rare
direct edits), this is acceptable.

## Audit logging

All write operations are logged for accountability.

### Format

JSON Lines (one JSON object per line), appended to an audit log file:

```json
{"ts": "2025-07-16T10:30:00Z", "target": "alice", "action": "write_hday", "details": "24 events"}
```

### Fields

| Field     | Description                                                       |
| --------- | ----------------------------------------------------------------- |
| `ts`      | UTC ISO 8601 timestamp                                            |
| `target`  | Which user's .hday file was affected                              |
| `action`  | Operation type: `write_hday`, `create_hday`                      |
| `details` | Human-readable context (event count, conflict detected, etc.)     |

### Storage

File-based (JSON Lines) is sufficient for the trusted-network deployment. The log file lives on the
backend host, not on the shared drive, to avoid permission issues and keep audit data separate from
user data.

The hdayplanner prototype's `audit/log.py` provides a working implementation of this pattern.

## Security

### Transport

The backend runs on a trusted internal network, so TLS is not strictly required. However, if the
backend is ever exposed beyond the local network (e.g., via VPN or reverse proxy):

- **TLS 1.2+ required** (TLS 1.3 recommended). Never serve plaintext API responses over untrusted
  networks.
- **HSTS header** on all HTTPS responses:
  `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

### Data at rest

The .hday files and team configuration on the network share are protected by the share's own access
controls (OS-level permissions, SMB/NFS ACLs). The backend does not add an additional encryption
layer — it relies on the share infrastructure for access control.

If at-rest encryption is needed (e.g., for compliance), it should be configured at the share/volume
level (e.g., BitLocker, LUKS, or storage-level encryption), not in the application.

### Client-side encryption (E2EE)

**Not planned.** E2EE would block the server-side parser, the iCal feed, and team-wide .hday
reads. The data categories in Worktime (schedule settings, time-off dates) are not high-risk enough
to justify this trade-off. If a future deployment handles confidential project names in event
titles, offer optional E2EE as an opt-in setting where users accept that server-side features are
unavailable for their encrypted data.

### Authentication

**Not required at launch** — the backend is only accessible on the trusted internal network. If the
backend is later exposed beyond the trusted network, add an auth layer. Two options were explored in
the original backend plan:

- **Device-link tokens**: No passwords, no email verification. Short-lived link tokens (1-5 min)
  exchanged for long-lived access tokens (24h-7d) per device. Good for personal use.
- **Enterprise SSO (OIDC/SAML)**: Azure AD, Google Workspace, or similar. Good for corporate
  deployments where users are already authenticated on the domain.

If auth is added, all endpoints except `GET /v1/health` would require an `Authorization: Bearer
<token>` header.

### Rate limiting

Not required on a trusted internal network. If the backend is exposed externally, add rate limiting
as middleware:

- Auth endpoints (if added): 5 attempts per IP per minute with exponential backoff.
- iCal feed (if added): 60 requests per token per hour.
- General API: 100 requests per IP per minute.

## CORS

Required when the frontend and backend are served from different origins (e.g., frontend on
`localhost:8000`, backend on `localhost:8001`).

**Requirements:**

- **Allowed origins**: Explicit allowlist from environment variable. Never use `*` in production.
  - Production: The origin where Worktime is served (e.g., `http://worktime.internal:8000`).
  - Development: `http://localhost:3000`, `http://localhost:5173`, `http://localhost:8000`.
- **Preflight (OPTIONS)**: Respond with allowed methods (`GET, PUT, OPTIONS`), allowed headers
  (`Content-Type`), and `Max-Age: 86400` (24h cache). Return `204`.

Implementation: use the CORS middleware provided by the framework (`CORSMiddleware` for FastAPI).

The hdayplanner prototype's `get_cors_origins()` function is a working reference — it blocks
wildcard in production and falls back to localhost in development.

## Hosting and deployment

### Runtime

The backend runs on a machine (server or Windows laptop) that has the network share mounted as a
local path. The backend process runs under a user account with read/write access to the share.

### Configuration

Environment variables:

| Variable        | Description                                       | Default                 |
| --------------- | ------------------------------------------------- | ----------------------- |
| `SHARE_DIR`     | Path to mounted share directory                   | `./data/hday_files`     |
| `CORS_ORIGINS`  | Comma-separated allowed origins                   | `http://localhost:5173` |
| `ENVIRONMENT`   | `development` or `production`                     | `development`           |
| `HOST`          | Bind address                                      | `0.0.0.0`               |
| `PORT`          | Bind port                                         | `8000`                  |
| `CACHE_TTL`     | Seconds before a cache entry is considered stale  | `10`                    |
| `CACHE_ENABLED` | Enable/disable in-memory caching                  | `true`                  |

### Deployment options

- **Windows Executable** (recommended for end users): Download the pre-built `worktime-backend.exe` 
  from GitHub Actions artifacts. No Python installation required! Just double-click to run.
  See [Windows Executable](#windows-executable) below for details.
- **Direct**: `uvicorn app.main:app` on the host machine.
- **Docker**: Mount the network share into the container. The hdayplanner prototype's Dockerfile
  (python:3.11-slim + uvicorn) is a working starting point.
- **Windows service**: For long-running deployment on a Windows laptop with share access.

### Windows Executable

For easy deployment on Windows machines, we provide a standalone executable built with Nuitka. This is
the recommended approach for non-technical users.

**Download:**

The Windows executable is automatically built on every commit to `main` and is available as a GitHub
Actions artifact named `worktime-backend-windows`. To download:

1. Go to the [Actions tab](../../actions/workflows/build-exe.yml)
2. Click on the latest successful workflow run
3. Download the `worktime-backend-windows` artifact
4. Extract `worktime-backend.exe`

**Usage:**

1. Place `worktime-backend.exe` in a folder of your choice
2. (Optional) Create a `.env` file in the same folder to configure the server:
   ```
   SHARE_DIR=C:\path\to\shared\files
   CORS_ORIGINS=http://localhost:5173
   PORT=8000
   ```
3. Double-click `worktime-backend.exe` to start the server
4. The server will start on http://localhost:8000 (or the configured PORT)
5. Access the API at http://localhost:8000 or connect your Worktime frontend

**Configuration:**

The executable accepts the same environment variables as the Python version (see Configuration table
above). You can set these in a `.env` file or in Windows environment variables.

**Building from source:**

To build the Windows executable yourself:

```bash
cd backend
pip install -r requirements.txt
pip install nuitka ordered-set zstandard
python -m nuitka app/main.py \
  --onefile \
  --output-dir=dist \
  --output-filename=worktime-backend.exe \
  --include-package=app \
  --windows-console-mode=force \
  --assume-yes-for-downloads
```

The executable will be created in `backend/dist/worktime-backend.exe`.

**Requirements:**
- Windows 10 or later
- Network share access (if using shared .hday files)
- No Python installation required!

### Technology

Two implementation options are under consideration:

- **Python (FastAPI + Pydantic)**: The `backend/hdayplanner/` folder contains a working prototype
  that validated the core patterns (CORS, file I/O, .hday parsing, audit logging). Requires
  maintaining a separate Python .hday parser alongside the frontend's TypeScript parser.
- **Node.js (TypeScript)**: Would share the .hday parser with the frontend
  (`src/lib/hday/parser.ts`), eliminating parser duplication. Frameworks like Fastify or Hono
  provide equivalent capabilities to FastAPI.

Regardless of language choice:

- **No database**: All data lives on the file share. No migration tooling or database management
  needed.
- **Transport**: HTTP/JSON. No TLS required on a trusted internal network, though it can be added
  behind a reverse proxy if needed.

## WebPlanner feature analysis

The `webplanner/` folder contained a Flask-based time tracking prototype (by MDKW) that logged
daily tasks with start/stop times, project tags, reusable templates, a daily progress bar, and
weekly hour aggregation. It stored everything in flat JSON files on the server. The folder has been
removed, but the feature analysis below informed the backend design.

### Features that stay client-side

| Feature              | Worktime approach                                                         |
| -------------------- | ------------------------------------------------------------------------- |
| **Daily task entry** | localStorage, no backend needed. Tasks are small and personal.            |
| **Task templates**   | Stored in `WorktimeUserState`. User-specific, local to the browser.       |
| **Progress bar**     | Client computation: sum durations, compare to configurable daily target.  |
| **Date navigation**  | Client filters localStorage by date. No server round-trip needed.         |
| **Project tags**     | App config or user settings. Revisit if tags become team-shared.          |

### Features where a backend adds value

| Feature                      | Why                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Team time-off overview**   | Requires reading multiple users' .hday files from the share. The `/v1/team/:id/hday` endpoint serves this.                          |
| **Weekly/monthly reporting** | Cross-user team reports and manager dashboards require server-side aggregation. Client falls back to local aggregation when offline.  |
| **Team time summaries**      | Requires access to multiple users' data. Privacy: aggregated totals only unless user opts in.                                        |
| **Data export**              | CSV/JSON export for HR or invoicing. Browser-based PDF generation is fragile.                                                        |
| **Audit trail**              | Append-only log of time entry changes. Legally relevant proof of hours worked. 7+ year retention.                                    |

### Hybrid features

| Feature                  | Client                                   | Backend enhancement                                                             |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| **Template sharing**     | Local create/apply.                      | Share templates via config files on the network share for team template pools.   |
| **Configurable targets** | Daily/weekly targets in user settings.   | Optional backend validation against team/org policies.                          |
| **Push notifications**   | Browser notifications for shift changes. | Server-triggered "you haven't logged hours today" reminders (low priority).     |

### What not to port from WebPlanner

- **Hardcoded paths** — use environment variables or relative paths.
- **Server-side rendering** — Worktime is a React SPA; backend is API-only.
- **Bundled dependencies** — use proper package management.
- **Shutdown endpoint** — not applicable to a hosted service.

## Resolved questions

### Why not the cloud sync architecture?

The original backend plan (snapshot sync, device-link tokens, database storage) was designed for a
different deployment model — personal cloud sync across devices over the internet. The actual
requirement is a bridge to an existing file share on a corporate network. The file share is the
source of truth, not a database.

Cloud sync remains a valid future option for users outside the corporate network, but it would be a
separate deployment mode, not the primary architecture.

### Does the server need its own .hday parser?

**Yes.** Unlike the cloud sync model (where the server stores opaque JSON snapshots), the file share
model requires the server to read .hday files and return structured data. The server also validates
content on write to prevent malformed files from reaching the share.

### Should the server reformat .hday content on write?

**No.** The server validates by parsing, but writes the raw client text as-is. This preserves
formatting, comments, and whitespace. The hdayplanner prototype used `to_text(events)` to serialize
on write, which risks reformatting — the new design avoids this.

### Is authentication needed?

**Not at launch.** The backend runs on a trusted internal network. The host OS handles share access
credentials. If the backend is later exposed beyond the trusted network, add an auth layer then
(token-based or OIDC/SAML for enterprise SSO).

### How should concurrent edits be handled?

**Optimistic concurrency via content hashing.** File locking on NFS/SMB is unreliable. The backend
computes SHA-256 hashes of file content and uses them as etags. Conflicts surface to the client for
resolution.

### How long should inactive data be retained?

**Not applicable for the file share model.** The .hday files live on the network share and are
managed by whoever administers that share. The backend does not delete user data autonomously. If
cloud sync is added later, consider 12 months of inactivity before soft-delete with a 30-day grace
period.

### Is team-level reporting needed at launch?

**No.** The initial backend provides read access to team .hday files. Aggregated reporting
(cross-user summaries, manager dashboards) is a future enhancement that would build on the existing
`/v1/team/:id/hday` endpoint.

### Do time entries need immutability after a cutoff?

**No enforcement at launch.** The audit trail provides accountability. If payroll integration is
added later, introduce a configurable `lockBeforeDate` per user or team.

### Should shared templates be team-scoped or organization-wide?

**Team-scoped initially.** Different teams have different recurring tasks. Org-wide templates can be
added later as a separate global pool. Templates could be stored as config files on the network
share alongside the people and config files.

## Conclusions

### Architecture summary

Worktime remains a **local-first application**. The browser is the primary runtime; localStorage is
the primary data store. The backend is an optional enhancement that provides access to shared team
data on a network drive.

The hdayplanner prototype validated key patterns that carry forward:

- **FastAPI + Pydantic** as the server framework and validation layer.
- **Server-side .hday parser** for structured reads and write validation.
- **File-based storage** via a mounted network share (the prototype's `SHARE_DIR` pattern).
- **CORS handling** with production safety (wildcard blocking, environment-based config).
- **Audit logging** as JSON Lines for write accountability.

The prototype's patterns that do not carry forward:

- **`to_text()` serialization on write** — the server should write raw client text, not reformat.
- **Incomplete flag types** — use a loose allowlist, not a restrictive enum.
- **Azure AD auth placeholder** — not needed on a trusted network.
- **Microsoft Graph sync stub** — interesting concept for calendar import, but not in scope.

### Design principles

1. **File share is the source of truth**: The in-memory cache is a performance optimization, not a
   data store. Writes always go to the share first, and the cache refreshes from the share on TTL
   expiry. If the cache is lost (process restart), it rebuilds from the share on startup.
2. **Bridge, not gateway**: The backend translates HTTP to file operations. It adds caching,
   conflict detection, and audit logging — but it does not own the data.
3. **Offline-resilient frontend**: The Worktime frontend continues to work offline with
   localStorage. The backend enhances with shared team data; it never gates core functionality.
4. **Parser parity**: The server-side .hday parser must produce the same results as the frontend
   parser. Shared test vectors enforce this.
5. **Graceful concurrency**: Optimistic concurrency via content hashing. No file locking. Conflicts
   surface to the user for resolution.
6. **API-only backend**: JSON API. No HTML, no template engines, no UI state management.

### Phased approach

**Phase 1 — File share bridge** (current scope)

- Core .hday API: `GET /v1/hday/:username`, `PUT /v1/hday/:username`.
- Team endpoints: `GET /v1/team/:id`, `GET /v1/team/:id/hday`.
- Response format toggle: `?format=raw|parsed` on GET endpoints.
- Health check: `GET /v1/health`.
- Performance benchmarking: `GET /v1/debug/benchmark`.
- In-memory cache with TTL + write-through invalidation.
- Server-side .hday parser and serializer.
- Optimistic concurrency via content hashing (etags).
- Audit logging for write operations.
- No authentication (trusted network).

**Future enhancements** (not currently planned, but explored in design)

These ideas were brainstormed during backend planning and are documented here for reference. They are
not prioritized or scheduled.

| Feature                     | Description                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **iCal subscription feed**  | `GET /v1/cal/:token.ics` — personalized calendar feed combining shifts + time-off + holidays. See [iCal subscription feed](#ical-subscription-feed) for full spec. |
| **Calendar import**         | Pull time-off from Microsoft Graph (Outlook) or Google Calendar into .hday format. Prototype's `graph/sync.py` demonstrated this.           |
| **Data export**             | `GET /v1/export?format=csv&from=...&to=...` — CSV/JSON export of time-off events for HR or reporting.                                      |
| **Team reporting**          | `GET /v1/reports/weekly`, `GET /v1/reports/monthly`, `GET /v1/reports/team` — cross-user aggregated time-off summaries for managers.         |
| **Template sharing**        | Share task/event templates via config files on the network share for team template pools.                                                    |
| **Authentication**          | If exposed beyond the trusted network: device-link tokens for personal use, or OIDC/SAML for enterprise SSO.                                |
| **Cloud sync**              | For users outside the corporate network: optional snapshot-based sync to a cloud database as a separate deployment mode.                     |
| **Push notifications**      | Server-triggered reminders (e.g., "you haven't logged hours today"). Low priority.                                                          |
