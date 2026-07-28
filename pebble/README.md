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

- `GET /api/pebble/dashboard` (`pebble:read`) — current task and shift glance.
- `POST /api/pebble/actions/clock-in` (`pebble:write`) — start a "Working" task.
- `POST /api/pebble/actions/clock-out` (`pebble:write`) — stop the current task.

## Building and installing

Requires the [Alloy-enabled Pebble SDK/CLI](https://developer.repebble.com/sdk/). This repo does not vendor
that tooling, so it isn't run in CI:

```bash
cd pebble
pebble build
pebble install --emulator emery   # or: pebble install --phone <phone-ip>
```

## Configuration

1. On the phone, open the Worktime app's settings from the Pebble mobile app.
2. Sign in to Worktime in the configuration webview.
3. Worktime rotates a credential containing only `pebble:read` and
   `pebble:write`, closes the webview, and relays it to the watch.

`CONFIG_URL` in `src/pkjs/index.js` defaults to
`https://worktime.tjor.im/pebble-pair`. If self-hosting elsewhere, change it to
your deployment's URL before building.

## Known limitations

- Not build- or device-tested: this environment has no Pebble SDK/emulator, so the Alloy APIs used here
  (Piu, `pebble/message`, `pebble/button`, `fetch()`) are implemented against the published
  [Pebble Developer docs](https://developer.repebble.com/guides/alloy/) but haven't been run on real
  hardware or the emulator. Expect some iteration once tested on-device.
- Layout is a simple centered stack (`left: 0, right: 0`); it isn't tuned separately for the round Gabbro
  (Pebble Round 2) display.
- Clock actions use server time and the fixed task label "Working". Configure
  labels or edit task details later in the web or Android app.
