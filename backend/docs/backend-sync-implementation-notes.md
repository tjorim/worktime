# Backend Sync Implementation Notes (Draft)

These notes capture backend-focused considerations for adding optional multi-device sync to
Worktime. The goal is to keep the app local-first while enabling a lightweight server that stores
sync state for users who opt in.

## Backend responsibilities (minimal)
- Store a single JSON snapshot per user plus metadata (updatedAt, version, etag).
- Provide auth/identity (account or device-link token).
- Enforce basic rate limits and payload validation.
- Expose simple CRUD endpoints for upload/download.

## API surface (proposed)
- `POST /v1/sync` to upload a snapshot (returns new version/etag).
- `GET /v1/sync` to download the latest snapshot (supports `If-None-Match`).
- `GET /v1/health` for uptime checks and basic monitoring.
- `POST /v1/auth/link` to exchange a link token for an access token (if using device-link flow).

## Storage model
- Single table keyed by `user_id`:
  - `user_id` (primary key)
  - `payload` (JSON/blob)
  - `updated_at` (timestamp)
  - `version` (integer)
  - `etag` (hash of payload + version)
- Optional audit table for last N writes if rollback is desired.

## Conflict handling
- Assume last-write-wins for the minimal version.
- Require client to send `version` or `etag` on write to detect divergence.
- If mismatch: return `409 Conflict` with server snapshot and metadata.

## Data visibility and encryption
- Plaintext storage means operators can inspect data.
- For stronger privacy, encrypt payloads client-side before upload (end-to-end encryption).
- If E2EE: server only stores opaque blobs and metadata.

## Transport and format
- Prefer HTTP/JSON with gzip compression for payloads.
- Consider protobuf only if payloads become large or frequent.
- MQTT is possible but likely overkill for snapshot sync.

## Backend options (lightweight)
- Cloudflare Workers + D1 for low-ops SQL and global edge.
- FastAPI (Python) or Fastify (Node) for a minimal REST service.
- SQLite is sufficient for single-instance deployments; Postgres is better for growth.

## Hosting considerations
- A backend means the app can no longer be purely GitHub Pages.
- Vercel/Render/Fly.io or Cloudflare Workers are practical options.
- Plan for backups (daily DB snapshots) and basic monitoring (latency/error rate).

## Open questions
- Do we need accounts, or will device-link tokens be enough?
- Is end-to-end encryption required for any data categories?
- Should sync be opt-in per feature (schedule vs time tracking)?
- How long should inactive accounts/snapshots be retained?
