# Backend

This document captures backend-focused considerations for adding optional multi-device sync to
Worktime. The goal is to keep the app local-first while enabling a lightweight server that stores
sync state for users who opt in.

## Table of contents

- [Backend responsibilities](#backend-responsibilities)
- [API surface](#api-surface)
- [iCal subscription feed](#ical-subscription-feed)
- [Authentication](#authentication)
- [Storage model](#storage-model)
- [Data deletion (GDPR/CCPA)](#data-deletion-gdprccpa)
- [Security](#security)
- [CORS](#cors)
- [Hosting and deployment](#hosting-and-deployment)
- [WebPlanner feature analysis](#webplanner-feature-analysis)
- [Resolved questions](#resolved-questions)
- [Conclusions](#conclusions)

## Backend responsibilities

- Store a single JSON snapshot per user plus metadata (updated_at, version, etag).
- Provide auth/identity via device-link tokens (lightweight accounts added later if team features
  are needed).
- Enforce basic rate limits and payload validation.
- Expose simple CRUD endpoints for snapshot upload/download.
- Support secure deletion of user data for GDPR/CCPA compliance.

## API surface

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/sync` | POST | Required | Upload snapshot (see [Sync upload](#sync-upload)) |
| `/v1/sync` | GET | Required | Download latest snapshot (supports `If-None-Match`) |
| `/v1/sync` | DELETE | Required | Erase all user data (see [Data deletion](#data-deletion-gdprccpa)) |
| `/v1/health` | GET | None | Uptime checks and monitoring |
| `/v1/cal/:token.ics` | GET | Token in URL | iCal subscription feed (see [iCal subscription feed](#ical-subscription-feed)) |
| `/v1/auth/link` | POST | None | Exchange link token for access token (see [Authentication](#authentication)) |

All authenticated endpoints require an `Authorization: Bearer <token>` header. Missing, malformed,
or expired tokens receive `401 Unauthorized`. Insufficient permissions receive `403 Forbidden`.

### Sync upload

`POST /v1/sync` uploads a complete user state snapshot. Request body (JSON):

- `payload` (object): The complete user state snapshot.
- `version` (integer) **or** `etag` (string): Must match the server's current value for conflict
  detection.

**Responses:**

- **200 OK**: Write succeeded. Returns `{"version": 6, "etag": "def456", "updated_at": "..."}`.
- **409 Conflict**: Version/etag mismatch. Returns the current server snapshot with metadata so the
  client can merge and retry.

## iCal subscription feed

`GET /v1/cal/:token.ics` serves a personalized iCalendar (RFC 5545) feed that calendar apps can
subscribe to. Users add a `webcal://` URL to Google Calendar, Outlook, Apple Calendar, etc. and the
app periodically polls for updates — no manual re-export needed.

### Why a subscription link instead of file export

A one-time .ics file download becomes stale immediately. A subscription URL lets the calendar app
refresh automatically (typically every few hours), so shift changes and new time-off events appear
without user intervention.

### URL format

```
webcal://api.worktime.example.com/v1/cal/<feed-token>.ics
```

The `feed-token` is a long-lived, per-user opaque token generated when the user requests a
subscription link. It is separate from the access token used for sync — feed tokens are embedded in
URLs that calendar apps store, so they must not expire on the same short schedule.

### Feed contents

The feed combines data from the user's synced snapshot:

| Source | VEVENT fields |
|--------|---------------|
| **Shifts** | Computed from roster config + user's team. `SUMMARY`: shift name (e.g., "Morning"). `DTSTART`/`DTEND`: shift hours. `CATEGORIES`: schedule type. |
| **Time-off events** | From .hday data. `SUMMARY`: event comment or type name. `DTSTART`/`DTEND`: event date(s). `CATEGORIES`: event type flag (holiday, business, sick, etc.). |
| **Public holidays** | Optional. `SUMMARY`: holiday name. `TRANSP`: TRANSPARENT. |

### Response headers

```http
Content-Type: text/calendar; charset=utf-8
Cache-Control: no-cache, no-store, must-revalidate
```

No caching headers — calendar apps manage their own poll interval. The server always returns the
current state.

### Security considerations

- **No Bearer auth**: Calendar apps cannot send Authorization headers on subscription URLs. Auth is
  via the feed token embedded in the URL path.
- **Feed token properties**: 256-bit random, URL-safe (base64url). Revocable per user. One active
  feed token per user (generating a new one invalidates the previous).
- **Rate limiting**: 60 requests per token per hour. Returns `429` with `Retry-After` if exceeded.
- **Privacy**: Feed URLs are secret — treat them like API keys. The settings UI should warn users
  not to share their subscription link publicly.
- **Revocation**: User can regenerate their feed token from settings, which immediately invalidates
  the old URL.

### Frontend integration

The settings panel shows a "Subscribe to calendar" section with:

1. A generated `webcal://` link the user can copy or click to open in their default calendar app.
2. A "Regenerate link" button that revokes the old token and creates a new one.
3. A brief explanation that the link is personal and should not be shared.

### Phase

This endpoint is part of **Phase 2** (after basic sync is operational), since it requires server
access to the user's snapshot to generate the feed.

## Authentication

**Decision: Device-link tokens at launch.** No passwords, no email verification. If team features
are added later, introduce a minimal account model (email grouping device tokens) without requiring
a password.

### Device-link exchange

`POST /v1/auth/link` exchanges a short-lived link token for a long-lived access token.

**Request:**

```json
{
  "link_token": "LT-abc123",
  "device_id": "dev-5f7d2b0c"
}
```

- Both fields are required opaque strings (trim whitespace, reject empty).
- On success: server returns an access token associated with the `device_id`, then invalidates the
  `link_token`.
- Link tokens live 1-5 minutes. Once exchanged, they cannot be reused.

**Example flow:** User scans QR code on new device -> QR contains link token -> device calls
`POST /v1/auth/link` -> server returns access token -> device stores token locally for sync.

### Token lifecycle

- **Type**: Device-specific opaque tokens stored server-side. Enables per-device revocation.
- **Lifetime**: 24 hours to 7 days. Short lives reduce compromise window; long lives reduce refresh
  burden.
- **Expiry**: Server rejects expired tokens with `401 Unauthorized`.
- **Refresh (optional)**: Separate long-lived refresh token (30-90 days) to obtain new access tokens
  without re-linking.

### Rate limiting and brute-force protection

Applies to `POST /v1/auth/link` as middleware before handler logic.

**Limits:**

- 5 attempts per IP per minute; 10 attempts per `device_id` per hour.
- Exponential backoff on failures: 0ms -> 100ms -> 500ms -> 1s -> 2s + lockout.
- After 5 failures: IP locked for 5 minutes, `device_id` locked for 15 minutes.
- Locked requests receive `429 Too Many Requests` with `Retry-After` header.

**Security principles:**

- Generic error responses only — never reveal whether a link token exists, is expired, or was used.
- Log all attempts with IP, `device_id`, timestamp, and result. Never log raw tokens; use an opaque
  `token_id` (keyed HMAC-SHA-256 digest generated at creation time) in all logs and audit trails.
- On successful exchange, immediately invalidate the link token in the database. On lockout,
  optionally invalidate it as a security measure (configurable per deployment).

## Storage model

Single table keyed by `user_id`:

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | string (PK) | Unique user identifier |
| `payload` | JSON/blob | Complete user state snapshot |
| `updated_at` | timestamp | Last write time |
| `version` | integer | Monotonically increasing; used for conflict detection |
| `etag` | string | `SHA256(json_payload + stored_version.toString()).hex()` — computed immediately before persisting, using the final version value |

Optional audit table for last N writes if rollback is desired.

### Conflict handling

- Last-write-wins for the minimal version.
- Client sends `version` or `etag` on write; server rejects on mismatch with `409 Conflict` and
  returns the current server snapshot for client-side merge.

## Data deletion (GDPR/CCPA)

`DELETE /v1/sync` enables permanent data erasure.

**Response codes:**

| Code | Meaning |
|------|---------|
| `204 No Content` | Data erased. Subsequent GET/POST returns `404`. |
| `404 Not Found` | No data exists (already deleted or never created). Success for idempotency. |
| `401 Unauthorized` | Missing or invalid token. |
| `403 Forbidden` | Insufficient scope for deletion. |
| `429 Too Many Requests` | Rate limited. |

**Idempotency:** Calling DELETE multiple times with the same valid token always succeeds (204 or
404). Safe to retry during network failures.

**What gets deleted:**

- User snapshot and all version/etag history (no rollback after deletion).
- All device-link and access tokens for the user (immediate invalidation).
- Associated metadata (created_at, updated_at) and dependent records (rate-limit counters,
  sessions).
- Operational logs (debug, soft-delete markers, backups): purged within 30 days.

**What gets kept:**

- Compliance audit logs (deletion events, auth events, security incidents): retained for 7+ years
  per GDPR Article 30 / SOC 2. These logs record _that_ deletion occurred, never the deleted
  payload.
- Legal hold exception: all logs preserved until hold is lifted, regardless of retention policy.

**Interaction with sync:** After deletion, `GET /v1/sync` returns `404`. A subsequent
`POST /v1/sync` creates a new snapshot (version resets to 1).

## Security

### Transport

- **TLS 1.2+ required** (TLS 1.3 recommended). Never serve plaintext API responses.
- **HSTS header** on all HTTPS responses:
  `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- Submit to [hstspreload.org](https://hstspreload.org) after infrastructure is stable.

### Database encryption

- At-rest encryption required (AES-256 or equivalent: SQLite cipher, cloud-managed keys, or
  envelope encryption).
- Encryption keys stored separately from the database (environment variable or secrets manager),
  never committed to version control.

### Client-side encryption (E2EE)

**Decision: No E2EE at launch.** TLS + at-rest encryption is the baseline.

E2EE would block server-side reporting, export, and team summaries. The data categories in Worktime
(schedule settings, time-off dates, time tracking entries) are not high-risk enough to justify this
trade-off for the current user base.

If a future user population handles confidential project names, offer optional E2EE as an opt-in
setting. Users who enable it accept that server-side features are unavailable for their encrypted
data. Key management: client-generated per-user symmetric key stored locally (IndexedDB or OS
credential store), never sent to the server.

## CORS

Required for the frontend to make authenticated API requests from a different origin.

**Requirements:**

- **Allowed origins**: Explicit allowlist only. Never use `*` in production.
  - Production: `https://worktime.example.com` (and any app subdomains).
  - Development: `http://localhost:3000`, `http://localhost:5173`, `http://localhost:8000`.
- **Credentials**: Set `Access-Control-Allow-Credentials: true` (required for `Authorization`
  header). When set, `Allow-Origin` must echo the validated request origin, not `*`.
- **Preflight (OPTIONS)**: Respond with allowed methods (`GET, POST, DELETE, OPTIONS`), allowed
  headers (`Content-Type, Authorization`), and `Max-Age: 86400` (24h cache). Return `204`.
- **Production hardening**: Only allow HTTPS origins (except localhost in dev). Do not expose
  sensitive headers via `Access-Control-Expose-Headers` unless necessary.

Implementation: use the CORS middleware provided by your framework (e.g., `cors` for Express,
`@fastify/cors` for Fastify, `CORSMiddleware` for FastAPI) or set headers manually in Workers.

## Hosting and deployment

A backend means the app can no longer be purely GitHub Pages.

**Platform options:**

- **Cloudflare Workers + D1**: Low-ops, global edge, SQL-based. Good fit for the minimal sync API.
- **Fly.io / Render**: Lightweight container hosting. Good for FastAPI or Fastify.
- **Vercel**: Serverless functions + edge. Simple deployment from Git.

**Database:** SQLite is sufficient for single-instance deployments. Postgres for growth or
multi-region.

**Transport format:** HTTP/JSON with gzip compression. Protobuf and MQTT are unnecessary for
snapshot sync at this scale.

**Operational basics:**

- Daily database backups.
- Basic monitoring: latency, error rate, sync volume.

## WebPlanner feature analysis

The `webplanner/` folder contained a Flask-based time tracking prototype (by MDKW) that logged
daily tasks with start/stop times, project tags, reusable templates, a daily progress bar, and
weekly hour aggregation. It stored everything in flat JSON files on the server. The folder has been
removed, but the feature analysis below informed the backend design.

### Features that stay client-side

| Feature | Worktime approach |
|---------|-------------------|
| **Daily task entry** | localStorage, synced via snapshot. Tasks are small and personal. |
| **Task templates** | Stored in `WorktimeUserState`. User-specific, synced as part of snapshot. |
| **Progress bar** | Client computation: sum durations, compare to configurable daily target. |
| **Date navigation** | Client filters localStorage by date. No server round-trip needed. |
| **Project tags** | App config or user settings. Revisit if tags become team-shared. |

### Features where a backend adds value

| Feature | Why | Proposed endpoint |
|---------|-----|-------------------|
| **Weekly/monthly reporting** | Cross-user team reports and manager dashboards require server-side aggregation. Client falls back to local aggregation when offline. | `GET /v1/reports/weekly`, `GET /v1/reports/monthly` |
| **Team time summaries** | Requires access to multiple users' data. Privacy: aggregated totals only unless user opts in. | `GET /v1/reports/team` (manager auth) |
| **Data export** | CSV/JSON export for HR or invoicing. Browser-based PDF generation is fragile. | `GET /v1/export?format=csv&from=...&to=...` |
| **Audit trail** | Append-only log of time entry changes. Legally relevant proof of hours worked. 7+ year retention. | Server-side event log (not a public endpoint) |

### Hybrid features

| Feature | Client | Backend enhancement |
|---------|--------|---------------------|
| **Template sharing** | Local create/apply. | `POST /v1/templates/share` and `GET /v1/templates/shared?team=N` for team template pools. |
| **Configurable targets** | Daily/weekly targets in user settings. | Optional backend validation against team/org policies. |
| **Push notifications** | Browser notifications for shift changes. | Server-triggered "you haven't logged hours today" reminders (low priority). |

### What not to port

- **File-based storage** — use database, not JSON/list files on disk.
- **Hardcoded paths** — use environment variables or relative paths.
- **Server-side rendering** — Worktime is a React SPA; backend is API-only.
- **Bundled dependencies** — use proper package management.
- **Shutdown endpoint** — not applicable to a hosted service.
- **No authentication** — Worktime backend requires token-based auth.

### Impact on sync API

- **Payload growth**: ~2 KB/day for time tracking, ~700 KB/year. Well within single-snapshot size.
- **Partial sync**: If snapshots grow large, split into sync channels later. Not a launch concern.
- **Conflict granularity**: Whole-snapshot last-write-wins may lose concurrent edits from two
  devices on the same day. Per-entry merge logic is a future enhancement.

### Phase 2-3 endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/v1/cal/:token.ics` | GET | Token in URL | iCal subscription feed (shifts + time-off + holidays) |
| `/v1/reports/weekly` | GET | Required | Weekly hours by project |
| `/v1/reports/monthly` | GET | Required | Monthly hours by project |
| `/v1/reports/team` | GET | Required (manager) | Team aggregated hours |
| `/v1/export` | GET | Required | Export time entries (CSV/JSON) |
| `/v1/templates/share` | POST | Required | Share template with team |
| `/v1/templates/shared` | GET | Required | Fetch team-shared templates |

These are additive; the core sync/auth/health endpoints remain unchanged.

## Resolved questions

### Do we need accounts, or will device-link tokens be enough?

**Device-link tokens at launch.** Worktime is a personal tool, not enterprise SaaS. Device-link
tokens avoid password management and account recovery complexity. If team reporting is added later,
introduce a minimal account model (email grouping device tokens) without requiring a password.

### Is end-to-end encryption required?

**No E2EE at launch.** TLS + at-rest encryption is sufficient. E2EE would block server-side
reporting and export. Offer optional E2EE later as an opt-in if confidential project names become a
concern.

### Should sync be per-feature?

**Single snapshot.** All data syncs together. Per-feature channels add complexity for negligible
benefit at current scale (~700 KB/year). Split into channels later if payload size becomes a
problem.

### How long should inactive data be retained?

**12 months** after last sync, with a reminder at 10 months and a 30-day soft-delete grace period
before hard deletion at 13 months. Compliance audit logs retained separately (7+ years).

### Same snapshot or separate sync channel for time tracking?

**Same snapshot.** Time tracking entries live in `WorktimeUserState` alongside schedule and time-off
data. Extract into a separate channel only if splitting becomes necessary.

### Is team-level reporting needed at launch?

**No.** Ship individual sync first. Team reporting (requiring user-to-team mapping, manager roles,
privacy opt-in) is Phase 3.

### Do time entries need immutability after a cutoff?

**No enforcement at launch.** The audit trail provides accountability. If payroll integration is
added later, introduce a configurable `lockBeforeDate` per user or team.

### Should shared templates be team-scoped or organization-wide?

**Team-scoped initially.** Different teams have different recurring tasks. Org-wide templates can be
added later as a separate global pool.

## Conclusions

### Architecture summary

Worktime remains a **local-first application**. The browser is the primary runtime; localStorage is
the primary data store. The backend is an optional enhancement for multi-device sync, and later,
team-level features.

The WebPlanner prototype validated that time tracking is a useful companion to shift scheduling. Its
implementation patterns (server rendering, file storage, no auth) do not carry over, but the feature
set is directly relevant:

- **Task entry, templates, progress tracking, date navigation** stay client-side.
- **Reporting, export, audit trails** justify backend involvement.
- **Template sharing, push notifications** are hybrid — useful but not essential at launch.

### Phased rollout

**Phase 1 — Individual sync** (minimum viable backend)

- Core sync API: `POST /v1/sync`, `GET /v1/sync`, `DELETE /v1/sync`, `GET /v1/health`.
- Device-link authentication: `POST /v1/auth/link`.
- Single snapshot model: entire `WorktimeUserState` syncs as one JSON payload.
- Deploy on Cloudflare Workers + D1 or equivalent.

**Phase 2 — Calendar feed, export, and audit**

- `GET /v1/cal/:token.ics` iCal subscription feed for calendar app integration.
- `GET /v1/export` for CSV/JSON export of time entries.
- Server-side audit trail (append-only event log for time entry changes).
- Individual user data only — no cross-user access.

**Phase 3 — Team features**

- Lightweight accounts (email + device tokens) for stable user identity.
- Server-side team mapping (user -> team number).
- Reporting endpoints: `/v1/reports/weekly`, `/v1/reports/monthly`, `/v1/reports/team`.
- Template sharing: `/v1/templates/share`, `/v1/templates/shared`.
- User opt-in required for team data visibility.

### Design principles

1. **Offline-first**: Every feature works without a backend. The server enhances; it never gates.
2. **Single snapshot**: One payload, one version counter, one sync operation. No premature channel
   splitting.
3. **Privacy by default**: No data shared with teammates or managers unless the user opts in.
4. **API-only backend**: JSON API. No HTML, no template engines, no UI state management.
5. **Incremental complexity**: Each phase stands alone. Do not build Phase 3 infrastructure during
   Phase 1.
