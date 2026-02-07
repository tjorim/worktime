# Backend

This document captures backend-focused considerations for adding optional multi-device sync to
Worktime. The goal is to keep the app local-first while enabling a lightweight server that stores
sync state for users who opt in.

## Backend responsibilities (minimal)

- Store a single JSON snapshot per user plus metadata (updatedAt, version, etag).
- Provide auth/identity (account or device-link token).
- Enforce basic rate limits and payload validation.
- Expose simple CRUD endpoints for upload/download.
- Support secure deletion of user snapshots and associated metadata (updatedAt, version, etag, tokens); honor authenticated deletion requests; return audit-safe responses (204 on success or 404 if already deleted); apply rate limiting and ownership validation to prevent unauthorized erasure.

## API surface (proposed)

- `POST /v1/sync` (authenticated) to upload a snapshot (returns new version/etag). Requires `Authorization: Bearer <token>` header.
- `GET /v1/sync` (authenticated) to download the latest snapshot (supports `If-None-Match`). Requires `Authorization: Bearer <token>` header.
- `DELETE /v1/sync` (authenticated) to erase all user data (GDPR/CCPA compliance). Requires `Authorization: Bearer <token>` header.
- `GET /v1/health` (unauthenticated) for uptime checks and basic monitoring.
- `POST /v1/auth/link` (device-link flow) to exchange a link token for an access token. See "Authentication" section for token exchange details.

## Authentication

**Header format:**

```
Authorization: Bearer <access_token>
```

**Token types (choose one strategy):**

- **Opaque tokens**: Server-generated random strings (stored in-DB for lookup). Simple, requires server state.
- **JWT**: Self-contained, stateless tokens with embedded user_id and expiry. Reduces server lookups but requires key rotation.
- **Device-specific tokens**: Scoped to a single device/client; enables revocation per device without invalidating all user tokens.

**Token lifecycle:**

- **Lifetime**: Access tokens typically valid for 24 hours to 7 days. Short lives reduce compromise window; long lives reduce refresh burden.
- **Expiry**: Server rejects tokens after expiry with `401 Unauthorized`; client must refresh or re-authenticate.
- **Refresh flow (optional)**: If implemented, issue a separate long-lived refresh token (30–90 days). Client uses refresh token to obtain new access token without re-entering credentials.

**Device-link exchange (POST /v1/auth/link):**

- **Request**: Client sends a link token (short-lived, shared out-of-band, e.g., QR code or manual entry) and a device ID.
  - **Body (JSON)**: `{"link_token":"...","device_id":"..."}`
  - **Required**: `link_token` (string), `device_id` (string)
  - **Format**: Treat as opaque strings; trim whitespace; reject empty values.
- **Response**: Server validates `link_token`; if valid, returns an access token associated with the provided `device_id`, then invalidates the `link_token`.
- **Linkage**: New access token is associated with the device/client ID, enabling per-device token revocation (device-specific invalidation).
- **Link token lifetime**: Typically 1–5 minutes to reduce brute-force window. Once exchanged, link token is invalidated.
- **Example flow**: User scans QR code on device → QR contains link token → device calls `POST /v1/auth/link` → server returns access token → device stores token locally and uses for sync.
- **Example request**:

```
POST /v1/auth/link
Content-Type: application/json

{
  "link_token": "LT-abc123",
  "device_id": "dev-5f7d2b0c"
}
```

**Token validation on authenticated endpoints:**

- All endpoints requiring auth (`POST /v1/sync`, `GET /v1/sync`, `DELETE /v1/sync`) must validate the `Authorization` header.
- If header is missing, malformed, or token is invalid/expired, return `401 Unauthorized`.
- If token is valid but user lacks permission for the action (e.g., read-only token on DELETE), return `403 Forbidden`.

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

## User data deletion (GDPR/CCPA)

The `DELETE /v1/sync` endpoint enables permanent account closure and erasure compliance:

**Request:**

```
DELETE /v1/sync
Authorization: Bearer <access_token>
```

**Authentication & Authorization:**

- Requires valid `Authorization` header with access token (same auth as POST/GET).
- Returns `401 Unauthorized` if token is missing or invalid.
- Returns `403 Forbidden` if token lacks deletion rights (e.g., read-only or expired).

**Response codes:**

- `204 No Content` – User data successfully erased. Response body is empty. Subsequent GET/POST requests for this user will receive `404 Not Found` (no data exists).
- `404 Not Found` – No data exists for this user (either already deleted or never created). Still considered success for idempotency.
- `401 Unauthorized` – Missing or invalid authentication credential.
- `403 Forbidden` – User is not authorized to delete this data (e.g., token has insufficient scope).
- `429 Too Many Requests` – Rate limit exceeded; retry with exponential backoff.

**Idempotency:**

- The DELETE operation is idempotent. Calling it multiple times with the same valid token always returns `204` (or `404` after first deletion) and never raises an error for repeating requests.
- Useful for clients that may retry during network failures.

**Data removal semantics:**

- All snapshots for the user are permanently erased from the main data table.
- All version/etag history is removed (no rollback recovery available after deletion).
- Any associated audit logs, soft-delete markers, or backup snapshots are purged within 30 days (comply with data retention windows).
- Device-link tokens and access tokens for that user are immediately invalidated (no new syncs possible).
- Linked account data (if any) is also removed, including metadata (createdAt, updatedAt).
- Dependent records (e.g., rate-limit counters, sessions) should be cleaned up or anonymized.

**Audit and logging:**

- Log each deletion request with timestamp, authenticated user/token ID, IP address, and result code.
- Maintain an immutable audit log (separate table) of deletions for compliance verification (kept for ≥7 years or per jurisdiction).
- Do not log the actual deleted payload (privacy-first); only log that deletion occurred.
- If using soft-deletes initially, transition to hard-delete after 30-day retention window.

**Interaction with snapshot sync:**

- Unlike `GET /v1/sync` (which returns `304 Not Modified` with `If-None-Match`), DELETE has no conditional request form. It always attempts deletion if authorized.
- After successful deletion, a subsequent `GET /v1/sync` returns `404 Not Found` and no etag/version (the snapshot no longer exists).
- If a client attempts `POST /v1/sync` after deletion, the server treats it as a new snapshot creation for that user (version resets to 1, new etag computed).

## Data visibility and encryption

**Transport security (required baseline):**

- All API endpoints **must** use TLS 1.2+ with HTTPS only; redirect HTTP to HTTPS; do not serve unencrypted JSON payloads.

**Database encryption (required baseline):**

- Database fixtures (at-rest) **must** be encrypted using AES-256 or equivalent (e.g., SQLite `PRAGMA cipher`, cloud provider managed keys, or envelope encryption).
- Encryption key must be stored separately from database (e.g., environment variable, secrets manager) and never committed to version control.

**Client-side end-to-end encryption (E2EE):**

- Plaintext server storage means operators can inspect user data; for stronger privacy, use client-side encryption (E2EE).
- If E2EE: server only stores opaque encrypted blobs and metadata (no key material on server).
- **Key management strategy**:
  - **Key generation**: Client generates per-user symmetric key on first use (e.g., random 256-bit key derived from password or stored in IndexedDB).
  - **Key storage**: Encrypted keys stored locally (device only) or wrapped with a password; never sent to server.
  - **Key rotation**: Client-initiated on password change; old snapshots re-encrypted with new key before upload (or kept in archive).
  - **Secrets protection**: Keys protected by local device security (secure enclave, hardware wallet, or OS credential store where available); no server-side key recovery.

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
