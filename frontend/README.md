# Frontend (Worktime)

## Mock mode (MSW scenarios)

Worktime can run in demo/test fixture mode without a backend:

```bash
cd frontend
VITE_MSW=true pnpm dev
```

Optional default fixture selection:

```bash
VITE_MSW=true VITE_MSW_SCENARIO=sync-conflict pnpm dev
```

### Auth assumptions in mock mode

- `demo-default` uses a valid authenticated session (`/api/me` returns a profile).
- Auth failure scenarios:
  - `auth-signed-out` → 401
  - `auth-expired` → 401
  - `auth-forbidden` → 403

### Scenario switching

Stable screenshot/dev switches are available through URL routing and query params:

- `http://localhost:5173/__mock/current-shift-day`
- `http://localhost:5173/__mock/time-tracking-validation-failure`
- `http://localhost:5173/__mock/time-off-overlap`
- `http://localhost:5173/__mock/sync-conflict`
- `http://localhost:5173/__mock/server-error`
- `http://localhost:5173/?mswScenario=sync-conflict`

Runtime API switch/reset:

- `GET /api/mock/scenario` (active + available scenarios)
- `POST /api/mock/scenario` with `{ "id": "sync-conflict" }`
- `POST /api/mock/reset` (restores `demo-default`)

### Deterministic reset behavior

- `tests/setup.ts` resets MSW scenario state before every test (`resetMockScenario()`).
- For per-test overrides, use `withMockScenario("<id>", async () => { ... })`; it restores the previous/default scenario automatically.
- Scenario data and dates are deterministic (seeded around 2026), which keeps repeated Playwright/browser screenshots stable.

### Fixture coverage

Scenario fixtures include:

- Current shift and team status (day/night/off/handover)
- Time tracking states (active/paused/completed/correction needed/validation failure)
- Time off request states (pending/approved/rejected/overlap/quota edge)
- Holiday and H-day calendar-related deterministic holiday/paydate sources
- Sync states (clean/pending local changes/conflict/retryable failure/offline)
- Work location status/action responses
- Auth states (signed out/valid/expired/forbidden)
