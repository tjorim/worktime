# Worktime for Pebble

A companion watch app for [Pebble Time 2 / Pebble Round 2](https://developer.repebble.com/), built with
[Alloy](https://developer.repebble.com/guides/alloy/) (Pebble's JS/TS SDK). Scope for this first version:
clock in/out and a glance at the currently running time-tracking task — see the "Time Tracking" feature in
the main Worktime app.

## How it works

Pebble apps can't reach the internet directly; only the phone-side JS (`pkjs`) can. So:

- **`src/embeddedjs/main.js`** — runs on the watch. Renders status/timer, and sends a small `REQUEST`
  AppMessage (refresh / start / stop) when SELECT is pressed.
- **`src/pkjs/index.js`** — runs on the phone, inside the Pebble mobile app. Owns all HTTP calls to the
  Worktime backend (`GET/POST/PUT /api/time-tracking/tasks...`) and relays the result back to the watch as
  `RUNNING` / `TASK_TEXT` / `START_TIME` (or `ERROR`).
- **`frontend/public/pebble-config.html`** — the configuration webview, opened via `Pebble.openURL()` when
  the user taps the app's settings in the Pebble mobile app. Collects the Worktime server URL and a personal
  access token, and hands them back to `pkjs` by navigating to `pebblejs://close#<data>`.

Authentication uses a **personal access token** (`Settings > Account > API tokens` in the Worktime web app),
not the OIDC session the web app uses — Pebble's constrained JS runtime has no good way to run an OAuth
Authorization Code + PKCE flow, and a static, revocable token is simpler and no less secure. Revoke the
token from the web app at any time to disconnect the watch.

## Building and installing

Requires the [Alloy-enabled Pebble SDK/CLI](https://developer.repebble.com/sdk/). This repo does not vendor
that tooling, so it isn't run in CI:

```bash
cd pebble
pebble build
pebble install --emulator emery   # or: pebble install --phone <phone-ip>
```

## Configuration

1. In the Worktime web app: **Settings > Account > API tokens** > generate a token (e.g. name it "Pebble").
2. On the phone, open the Worktime app's settings from the Pebble mobile app.
3. Enter your Worktime server URL and paste the token, then save.

`CONFIG_URL` in `src/pkjs/index.js` defaults to `https://worktime.tjor.im/pebble-config.html`. If
self-hosting elsewhere, change it to your deployment's URL before building.

## Known limitations

- Not build- or device-tested: this environment has no Pebble SDK/emulator, so the Alloy APIs used here
  (Piu, `pebble/message`, `pebble/button`) are implemented against the published
  [Pebble Developer docs](https://developer.repebble.com/guides/alloy/) but haven't been run on real
  hardware or the emulator. Expect some iteration once tested on-device.
- Layout is a simple centered stack (`left: 0, right: 0`); it isn't tuned separately for the round Gabbro
  (Pebble Round 2) display.
- A personal access token authenticates as the user for the same endpoints their own OIDC session can
  reach (minus account/token management, see `require_oidc_principal` in the backend) — there's no
  reduced-scope "time-tracking only" token type yet.
