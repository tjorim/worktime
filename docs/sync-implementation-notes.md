# Sync Implementation Notes (Draft)

These notes capture our current thinking on how multi-device sync could work for Worktime without
disrupting the local-first experience. The intent is to keep the app fast and offline-capable while
allowing optional sync for users who want it.

## Local-first baseline
- Keep localStorage as the runtime source of truth for settings, time-off data, and time tracking.
- Continue running schedule and time-off calculations in the browser to preserve offline behavior.

## Sync model (minimal)
- Add an optional backend that stores a single JSON snapshot per user.
- Sync can be background-only; the UI should still read/write local state first.
- If sync is enabled, upload on change and download on startup.

## Data visibility and encryption
- If data is stored in plaintext on the server, operators can inspect it.
- For stronger privacy, encrypt data client-side before sync (end-to-end encryption).

## Transport
- Prefer HTTP APIs for sync (simple CRUD and conflict handling).
- MQTT is possible but likely overkill for state sync.

## Backend options (lightweight)
- Cloudflare Workers + D1 for a low-ops SQL backend.
- FastAPI (Python) or Fastify (Node) for a minimal REST API.
- SQLite is sufficient for single-instance deployments; Postgres is better for growth.

## Hosting
- A backend means the app can no longer be purely GitHub Pages; it needs a server host.
- Vercel/Render/Fly.io or Cloudflare Workers are practical options.

## Open questions
- Do we need accounts, or will device-link tokens be enough?
- Is end-to-end encryption required for any data categories?
- Should sync be opt-in per feature (schedule vs time tracking)?
