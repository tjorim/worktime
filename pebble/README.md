# Worktime for Pebble

A companion watch app for [Pebble Time 2 / Pebble Round 2](https://developer.repebble.com/), built with
[Alloy](https://developer.repebble.com/guides/alloy/) (Pebble's JS/TS SDK). It shows today's or the next
configured shift, provides an active-task glance, and supports clocking in/out.

## How it works

Alloy's `fetch()` API runs on the watch and reaches the internet through the
official phone-side `@moddable/pebbleproxy` package. So:

- **`src/embeddedjs/main.js`** — runs on the watch. Renders status/timer and
  calls the dedicated Worktime Pebble endpoints with watch-side `fetch()`.
- **`src/pkjs/index.js`** — runs on the phone, inside the Pebble mobile app.
  Hosts the Alloy network proxy and relays runtime configuration to the
  watch via AppMessage.
- **`frontend/src/pages/PebblePairPage.tsx`** — the authenticated
  configuration webview opened via `Pebble.openURL()` when the user taps the
  app's settings in the Pebble mobile app. It rotates a dedicated Pebble
  credential and returns it to `pkjs` through `pebblejs://close#<data>`.

Authentication uses a **personal access token** (`Settings > Account > API tokens` in the Worktime web app),
not the OIDC session the web app uses — Pebble's constrained JS runtime has no good way to run an OAuth
Authorization Code + PKCE flow. The generated companion credential carries only
`pebble:read` and `pebble:write`; it cannot access the ordinary web/Android API,
account management, token management, or MCP. Revoke it from the web app at any
time to disconnect the watch.

The watch uses this narrow API surface:

- `GET /api/pebble/dashboard` (`pebble:read`) — current task, soonest planned task, and shift glance.
- `POST /api/pebble/actions/clock-in` (`pebble:write`) — start a "Working" task.
- `POST /api/pebble/actions/clock-out` (`pebble:write`) — stop the current task.

## Planned-task reminder

A "planned" task — logged ahead of time, `stop_time` set, `start_time` still ahead — is the
same concept the webapp and Android badge as "Planned" (see `isPlanned` in `DailyTaskList.tsx`)
and remind about via push (#1204) and a local alarm (#1205). The watch has no equivalent
background wakeup, so it follows the "derived from data already on hand" model instead: the
dashboard response's `planned_task` is the soonest such task, and once its `start_time` is
within ten minutes (mirroring the backend's own `REMINDER_LEAD_MINUTES`), the watch buzzes once
(`Vibes.doublePulse()`) and replaces the bottom line with `Starting soon: <text> HH:MM` until
the task starts. This is re-evaluated every second the app is open (the same tick that drives
the running-task elapsed timer) and is display-only — it only fires while the watchapp happens
to be in the foreground, not as a scheduled wakeup.

## Building and installing

Requires the [Alloy-enabled Pebble SDK/CLI](https://developer.repebble.com/sdk/).
The repo does not vendor it; Pebble CI installs it with `uv`, builds the `.pbw`,
boots Emery, and checks a screenshot:

```bash
cd pebble
pebble build
pebble install --emulator emery   # or: pebble install --phone <phone-ip>
```

The checks that also run without the SDK are:

```bash
cd pebble
node scripts/validate.mjs         # package contract
npm test                         # watch-app logic against stubbed Alloy globals
```

Without a watch, [`EMULATOR.md`](EMULATOR.md) covers the Emery QEMU emulator — what it can
and cannot prove, how to drive the app, and the mock backend in
[`scripts/mock-server.py`](scripts/mock-server.py).

## Configuration

1. On the phone, open the Worktime app's settings from the Pebble mobile app.
2. Sign in to Worktime in the configuration webview.
3. Worktime rotates a credential containing only `pebble:read` and
   `pebble:write`, closes the webview, and relays it to the watch.

`CONFIG_URL` in `src/pkjs/index.js` defaults to
`https://worktime.tjor.im/pebble-pair`. If self-hosting elsewhere, change it to
your deployment's URL before building.

## Offline behavior

The watch caches the **last successful dashboard read** (`lastDashboard` in the watch's
`localStorage`: the shift line, the running task's label and start time, the soonest planned
task, and the time of the read). While the phone link is down — or a request fails — the app
keeps showing that glance, with the bottom line replaced by the reason and the time it was
read, for example `Phone offline · 08:12`. The elapsed timer keeps counting from the cached
start time, so it is an estimate rather than a confirmed value. Snapshots older than 12 hours —
or stamped in the future after the watch clock moves back — are discarded. The planned-task
reminder still evaluates against the cached snapshot while offline — see "Planned-task
reminder" above — but the offline reason line takes the bottom line back once the reminder
window has passed.

A new credential or server URL clears the snapshot because it may select a
different account or deployment. A read still in flight for the previous
identity is discarded when it lands rather than being cached or rendered, and
the refresh owed to the new identity runs once the in-flight request finishes,
so state cannot mix across accounts or deployments.

The cache is **display-only** — clocking in and out remains online-only, and there is no
offline queue:

- SELECT while the phone is disconnected shows the cached glance and does nothing else.
- If the rendered state came from the cache (or from a failed read), SELECT re-reads
  `/api/pebble/dashboard` first and acts only on that fresh result, so a stale task can
  never decide between clock-in and clock-out.
- After a mutation, the cached state is marked non-authoritative until the follow-up read
  lands, so a reconnect never replays a request that already succeeded.
- A `409` from either action means the server moved on (clocked in or out elsewhere); the
  watch re-reads the dashboard rather than retrying the mutation.

All watch → server work is serialized by a single in-flight guard, so repeated SELECT
presses are dropped while a clock mutation is running rather than queued behind it.

## Validation status

Three layers, none of which substitutes for the next:

| Layer | Covers | Where |
|-------|--------|-------|
| CI logic | Package contract; the app's request, caching, and replay logic against stubbed Alloy globals, including four tests driving it over real HTTP against the mock backend | `scripts/validate.mjs`, `tests/` |
| CI emulator | SDK build, startup, Piu layout/fonts, and a rendered-screen check. **Not** anything needing HTTP — watch-side `fetch()` never completes under QEMU | `.github/workflows/pebble.yml`, [`EMULATOR.md`](EMULATOR.md) |
| Hardware | Everything at once, and the only place the phone proxy runs for real | — |

The CI workflow now performs the build/emulator portion automatically, but a
Pebble Time 2 run is still open (tracked in
[#1025](https://github.com/tjorim/worktime/issues/1025)). Record any additional
SDK or hardware compatibility changes here as they are found.

Doable in the emulator ([`EMULATOR.md`](EMULATOR.md) has the commands):

- [ ] `pebble build` succeeds against the current SDK.
- [ ] The watchapp launches and stays running on Emery.
- [ ] Shift, status, timer, and hint labels render and fit; the `Gothic` styles resolve.
- [ ] `pebble send-app-message` configuration is stored and survives a restart.
- [ ] Disconnecting Bluetooth shows the `Phone offline` path (seed a cached snapshot first
      to see the stale glance — `fetch()` never populates one under QEMU).

Hardware only:

- [ ] App installs and starts on a Pebble Time 2.
- [ ] Configuration opens from the stock Pebble phone app, and the paired credential reaches
      the watch.
- [ ] `GET /api/pebble/dashboard` loads through the phone proxy with a `pebble:read` token.
- [ ] The elapsed timer counts from the task's `start_time` (a `Date` parse failure on the
      backend's `+00:00` offsets would show up here).
- [ ] UP refreshes; SELECT clocks in and out.
- [ ] Repeated SELECT presses do not submit overlapping mutations — point the watch at
      `scripts/mock-server.py --latency 3 --host <lan-ip>` and check `requests.log` shows one
      `POST clock-in`.
- [ ] 401/403 shows `Sign-in needed`; 429/5xx shows `Try again later (<status>)` and stays
      retryable (`--fail-with 503`).
- [ ] Airplane mode shows the cached glance with its timestamp, and SELECT is a no-op until
      the phone reconnects.
- [ ] A planned task starting within ten minutes buzzes once and shows `Starting soon: … HH:MM`;
      it does not buzz again on later refreshes of the same task, and the line clears once the
      task's start time passes (`scripts/mock-server.py --planned-in <minutes>`).

## Known limitations

- Layout is a simple centered stack (`left: 4, right: 4`); it isn't tuned separately for the round
  Gabbro (Pebble Round 2) display.
- Clock actions use server time and the fixed task label "Working". Configure
  labels or edit task details later in the web or Android app.
- No offline queue: see "Offline behavior" above.
- The planned-task reminder only fires while the watchapp is open and ticking — unlike the
  webapp/Android push (#1204) and Android's local alarm (#1205), there is no background wakeup,
  so a planned task starting while the watchapp isn't running gets no reminder on the watch.
