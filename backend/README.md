# Backend

This document captures backend-focused considerations for adding optional multi-device sync to
Worktime. The goal is to keep the app local-first while enabling a lightweight server that stores
sync state for users who opt in.

## Backend responsibilities (minimal)

- Store a single JSON snapshot per user plus metadata (updated_at, version, etag).
- Provide auth/identity (account or device-link token).
- Enforce basic rate limits and payload validation.
- Expose simple CRUD endpoints for upload/download.
- Support secure deletion of user snapshots and associated metadata (updated_at, version, etag, tokens); honor authenticated deletion requests; return audit-safe responses (204 on success or 404 if already deleted); apply rate limiting and ownership validation to prevent unauthorized erasure.

## API surface (proposed)

- `POST /v1/sync` (authenticated) to upload a snapshot. Requires `Authorization: Bearer <token>` header. Request body must be JSON containing:
  - `payload` (object): The complete user state snapshot to store
  - `version` (integer) **or** `etag` (string): For conflict detection; must match server's current version/etag
  - Example: `{"payload": {...}, "version": 5}` or `{"payload": {...}, "etag": "abc123"}`
  - **Success response (200 OK)**: Returns new `version` and `etag` after write: `{"version": 6, "etag": "def456", "updated_at": "2026-02-08T12:34:56Z"}`
  - **Conflict response (409 Conflict)**: Server detects divergence (version/etag mismatch); returns current server snapshot with metadata: `{"payload": {...}, "version": 6, "etag": "xyz789", "updated_at": "2026-02-08T11:00:00Z"}`. Client should merge server state with local changes and retry POST with updated version/etag.
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

**Rate limiting and brute-force protections:**

- **Default limits**: Enforce 5 attempts per IP address per minute and 10 attempts per `device_id` per hour to prevent token enumeration attacks.
- **Failure tracking**: Track failed attempts independently by:
  - **IP address**: Count invalid link_token submissions per IP (resets after successful exchange or 1-minute window).
  - **device_id**: Count failed attempts per device_id (resets after successful exchange or 1-hour window).
- **Exponential backoff**: After each failed attempt from the same IP or device_id, increase response delay:
  - 1st failure: 0ms delay
  - 2nd failure: 100ms delay
  - 3rd failure: 500ms delay
  - 4th failure: 1s delay
  - 5th+ failure: 2s delay + temporary lockout
- **Temporary lockout**: After 5 failed attempts within the rate-limit window:
  - **IP lockout**: Block all `/v1/auth/link` requests from IP for 5 minutes.
  - **Device lockout**: Reject all requests with the same `device_id` for 15 minutes.
  - Return `429 Too Many Requests` with `Retry-After` header (e.g., `Retry-After: 300` for 5 minutes).
- **Generic error responses**: On throttled or failed attempts, return consistent error messages to prevent information leakage:
  - Success: `200 OK` with access token.
  - Invalid token or rate-limited: `401 Unauthorized` with generic message: `{"error": "Invalid or expired link token"}`.
  - Lockout/throttle: `429 Too Many Requests` with `{"error": "Too many attempts, try again later", "retry_after": 300}`.
  - Never reveal whether link_token exists, is expired, or has been used.
- **Server-side logging**: Log all attempts (success and failure) with IP, device_id, timestamp, and result for fraud detection and auditing. Raw tokens or token prefixes must never be logged. Instead, generate an opaque `token_id` (e.g., keyed HMAC-SHA-256 digest of the token) at token creation time and store it alongside the token hash. Use this `token_id` in all log entries and audit trails. Include:
  - Failed token validation attempts (identified by `token_id` only).
  - Rate-limit triggers and lockout events.
  - Anomaly detection flags (e.g., multiple device_ids from same IP, rapid token rotation).
- **Link token invalidation**: On successful exchange, immediately invalidate the `link_token` in the database/cache. Log the invalidation event using the `token_id`, never the raw token or any prefix. On lockout or max attempts, consider invalidating the link_token as a security measure (configurable per deployment).
- **Implementation**: Apply rate-limiting as middleware before handler logic (e.g., Express rate-limiter, Cloudflare Workers rate-limit API, or custom Redis-based counter). Ensure limits are enforced atomically (check-and-increment) to prevent race conditions.

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
  - `etag` (lowercase hex SHA-256 digest of the serialized payload concatenated with the version that will be stored, i.e., the post-increment/final version: `etag = SHA256(json_payload + stored_version.toString()).hex()`. Compute the etag immediately before persisting, using the final version value, to avoid circular dependency between etag and version.)
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
- Any associated operational logs (e.g., debug logs, soft-delete markers, backup snapshots) are purged within 30 days to comply with data retention and storage limits.
- Device-link tokens and access tokens for that user are immediately invalidated (no new syncs possible).
- Linked account data (if any) is also removed, including metadata (created_at, updated_at).
- Dependent records (e.g., rate-limit counters, sessions) should be cleaned up or anonymized.

**Audit and logging:**

- Log each deletion request with timestamp, authenticated user/token ID, IP address, and result code.
- Maintain an immutable compliance audit log (separate table) of deletion events for regulatory verification; retain the audit logs of deletion events for ≥7 years or per jurisdiction requirements such as GDPR Article 30 (processing records) or SOC 2, while ensuring user data itself is deleted promptly to satisfy GDPR Article 17 (erasure).
- Do not log the actual deleted payload (privacy-first); only log that deletion occurred.
- If using soft-deletes initially, transition to hard-delete after 30-day retention window.
- **Log retention policy summary**:
  - **Operational/debug logs**: Purged within 30 days (includes soft-delete markers, backup metadata, request logs).
  - **Compliance audit logs**: Retained for ≥7 years minimum (includes deletion events, authentication events, security incidents).
  - **Legal hold exception**: If user data is subject to litigation hold or investigation, all logs (operational + compliance) are preserved until hold is lifted, regardless of normal retention policy.

**Interaction with snapshot sync:**

- Unlike `GET /v1/sync` (which returns `304 Not Modified` with `If-None-Match`), DELETE has no conditional request form. It always attempts deletion if authorized.
- After successful deletion, a subsequent `GET /v1/sync` returns `404 Not Found` and no etag/version (the snapshot no longer exists).
- If a client attempts `POST /v1/sync` after deletion, the server treats it as a new snapshot creation for that user (version resets to 1, new etag computed).

## Data visibility and encryption

**Transport security (required baseline):**

- All API endpoints **must** use TLS 1.2+ (TLS 1.3 recommended) with HTTPS; API clients must use HTTPS URLs, and HSTS should enforce HTTPS after first visit. Optional HTTP→HTTPS redirects may be provided for user convenience, but plaintext API requests must not be served.
- Do not serve unencrypted JSON payloads under any circumstance.
- **HSTS header (required)**: Serve `Strict-Transport-Security` header on all HTTPS responses to enforce HTTPS-only access in browsers:

  ```
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ```

  - **max-age=31536000**: Enforce HTTPS for 1 year (31536000 seconds).
  - **includeSubDomains**: Apply policy to all subdomains (e.g., api.example.com, sync.example.com).
  - **preload**: Signal eligibility for browser HSTS preload lists (Chrome, Firefox, Safari). Only add after meeting [preload requirements](https://hstspreload.org): valid TLS cert, HTTPS on all subdomains, HSTS header on base domain, max-age ≥ 1 year.

- **Configuration examples**:
  - **Nginx**: Add to HTTPS server block:
    ```nginx
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    ```
  - **Node.js (Express/Fastify)**: Use middleware like `helmet`:
    ```javascript
    app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true, preload: true }));
    ```
  - **Cloudflare Workers**: Add header in response:
    ```javascript
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
    ```
  - **Caddy**: HSTS enabled by default when serving HTTPS; customize in Caddyfile:
    ```
    header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    ```
- **Preload submission**: After deployment with valid TLS cert and HSTS header, submit domain to [hstspreload.org](https://hstspreload.org) for inclusion in browser preload lists (typically takes 2-3 months for propagation). Do not submit until infrastructure is stable; preload is difficult to undo.

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

**CORS configuration (required for frontend access):**

Cross-Origin Resource Sharing (CORS) must be configured to allow the frontend to make authenticated API requests from a different origin (e.g., frontend at `https://worktime.example.com`, API at `https://api.worktime.example.com`).

- **Allowed origins**:
  - **Production**: Explicitly list production frontend origin(s) in allowlist. **Never use `*` wildcard in production** (blocks credentials and exposes API to any site).
    - Example: `https://worktime.example.com`, `https://app.worktime.example.com`
  - **Development**: Include localhost ports for local dev/testing: `http://localhost:3000`, `http://localhost:5173`, `http://localhost:8000`
  - **Dynamic origin validation**: If multiple origins are allowed, validate incoming `Origin` header against allowlist and echo the matching origin in response:
    ```javascript
    // Pseudocode
    const allowedOrigins = ["https://worktime.example.com", "http://localhost:5173"];
    const origin = request.headers.get("Origin");
    if (allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    ```
- **Credentials handling**:
  - If using cookies or `Authorization` header with credentials: set `Access-Control-Allow-Credentials: true` in all responses.
  - **Critical**: When `Allow-Credentials: true` is set, `Access-Control-Allow-Origin` **must** be a specific origin (not `*`). Echo the exact validated origin from the request.
  - If not using credentials (e.g., token in URL params only), omit `Allow-Credentials` header entirely.
- **Preflight requests (OPTIONS)**:
  - Browsers send OPTIONS preflight before POST/DELETE or when custom headers are present (e.g., `Authorization`).
  - Server must respond to OPTIONS with:
    - `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS` (list all supported methods)
    - `Access-Control-Allow-Headers: Content-Type, Authorization` (list all custom headers clients may send)
    - `Access-Control-Max-Age: 86400` (cache preflight for 24 hours to reduce overhead)
    - `Access-Control-Allow-Origin: <validated-origin>` (same validation as actual requests)
    - `Access-Control-Allow-Credentials: true` (if credentials are used)
  - Return `204 No Content` or `200 OK` with empty body for OPTIONS.
- **Secure production defaults**:
  - Enable CORS only for HTTPS origins in production (reject `http://` origins except localhost in dev).
  - Use narrow origin allowlist (specific domains only, no wildcards or regex).
  - Set `Access-Control-Max-Age` high (86400 seconds = 24 hours) to reduce preflight frequency.
  - Do not expose sensitive headers via `Access-Control-Expose-Headers` unless necessary.
- **Framework-specific middleware configuration**:
  - **Express (Node.js)**: Use `cors` package:
    ```javascript
    const cors = require("cors");
    app.use(
      cors({
        origin: (origin, callback) => {
          const allowedOrigins = ["https://worktime.example.com", "http://localhost:5173"];
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true,
        methods: ["GET", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
      }),
    );
    ```
  - **Fastify (Node.js)**: Use `@fastify/cors` plugin:
    ```javascript
    await fastify.register(require("@fastify/cors"), {
      origin: ["https://worktime.example.com", "http://localhost:5173"],
      credentials: true,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    });
    ```
  - **FastAPI (Python)**: Use `CORSMiddleware`:
    ```python
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["https://worktime.example.com", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
        max_age=86400
    )
    ```
  - **Cloudflare Workers**: Set headers manually in response:
    ```javascript
    response.headers.set("Access-Control-Allow-Origin", validatedOrigin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    ```
- **Testing CORS**:
  - Use browser DevTools Network tab to inspect preflight OPTIONS requests and CORS headers.
  - Verify `Access-Control-Allow-Origin` matches frontend origin exactly (not `*`).
  - Test authenticated requests (with `Authorization` header) to ensure preflight succeeds.
  - Test from disallowed origins to confirm server rejects (no CORS headers → browser blocks).

## Open questions

- Do we need accounts, or will device-link tokens be enough?
- Is end-to-end encryption required for any data categories?
- Should sync be opt-in per feature (schedule vs time tracking)?
- How long should inactive accounts/snapshots be retained?
