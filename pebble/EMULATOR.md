# Testing the Pebble app without a watch

A runbook for the Emery QEMU emulator.

**Provenance:** the toolchain findings here come from the sibling Daynest Pebble
companion's emulator work — same SDK, same Alloy runtime, same emulator — and
transfer directly. Pebble CI now performs the build, install, screenshot, and
rendered-screen check on every relevant change; the commands below are also
useful for local diagnosis.

## What the emulator can and cannot prove

It can prove: the package builds; the watchapp launches and stays running; Piu
renders what you expect at the real screen size; fonts and glyphs resolve;
`localStorage` works; and configuration sent from the phone side arrives and is
read back correctly.

It cannot prove anything requiring a live HTTP round-trip — so for Worktime that
rules out the dashboard load, clock in/out, the offline cache (which is only
written after a successful read), and the mutation-replay guards. Watch-side
`fetch()` never completes under QEMU. See [The `fetch()` dead
end](#the-fetch-dead-end) for why, and don't spend a day rediscovering it.

That gap is why [`tests/`](tests) exists: `npm test` runs
`src/embeddedjs/main.js` against stubbed Alloy globals — including four tests
that drive it over real HTTP against [`scripts/mock-server.py`](scripts/mock-server.py) —
and covers exactly the request, caching, and replay logic the emulator cannot
reach. The two are complements: the emulator covers rendering and the SDK, the
node tests cover the network path, and only hardware covers both at once.

## One-time setup

```sh
sudo apt install nodejs npm libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g
uv tool install pebble-tool     # Python 3.10+; https://docs.astral.sh/uv/
pebble sdk install latest       # SDK 4.17 + ARM and Moddable toolchains
```

Two environment notes that cost time:

- `qemu-pebble` is not on `PATH`. It lives in the SDK toolchain, at
  `~/.local/share/pebble-sdk/SDKs/4.17/toolchain/bin/qemu-pebble`. You only
  need it directly if you are booting the emulator by hand.
- **If the host has no IPv6**, pypkjs cannot start. It binds its websocket with
  `pywsgi.WSGIServer(("", port), ...)`, which resolves to `AF_INET6` and fails
  with `OSError: [Errno 97] Address family not supported by protocol`; the
  `pebble` CLI reports this only as a bare `[Errno 111] Connection refused`.
  Patch the installed copy to bind IPv4:

  ```sh
  # ~/.local/share/uv/tools/pebble-tool/lib/python3.11/site-packages/pypkjs/runner/websocket.py
  -  self.server = pywsgi.WSGIServer(("", self.port), ...)
  +  self.server = pywsgi.WSGIServer(("127.0.0.1", self.port), ...)
  ```

## Running the app

```sh
cd pebble
export SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy   # headless hosts only
pebble build
pebble install --emulator emery                      # boots the emulator if needed
pebble logs --emulator emery
pebble screenshot --emulator emery --no-open shot.png
```

`pebble install` launches the app as a side effect, so reinstalling is the
normal way to restart it.

## Debugging when there is nothing in the logs

**Watch-side `console.log` does not reach `pebble logs` in a release build.**
Only PKJS output does. A watchapp that throws during startup therefore shows a
blank screen and produces no diagnostic whatsoever — on Daynest that is exactly
how a bad font specifier presented, so if Worktime's `18px Gothic` /
`bold 24px Gothic` / `28px Gothic` styles are not valid on Emery, expect a blank
screen rather than an error.

The technique that worked is to treat the screen as the console: render
diagnostics into a Piu `Text` and take a screenshot.

```js
import {} from "piu/MC";
const application = new Application(null, { skin: new Skin({ fill: "black" }) });
// ...then set application.content("status").string = <whatever you want to see>
```

From there, bisect. A minimal Piu app with a black fill renders, so Piu works;
add a `Style` with the app's font and it dies, so the font is the problem. It is
also worth swapping in the stock `pebble new-project --alloy` watchface as a
control — if that renders inside your package, the toolchain and your
`package.json` are fine and the fault is in your own `main.js`.

The alternative is `pebble build --debug` plus an xsbug session, which gives
real exceptions but needs a debugger attached.

## Driving the app

**Configuration.** You do not need the pairing webview. Message keys are
assigned numerically by the build — read them from `build/*.pbw`'s
`appinfo.json`. Daynest's package declares two keys and got 10000 and 10001
(clear of the proxy's 15000+ range); this package declares `API_BASE_URL` and
`AUTH_TOKEN` in that order in `package.json`, so expect the same, but check
rather than assume:

```sh
pebble send-app-message --emulator emery \
  --string 10000=http://127.0.0.1:8899 10001=wtpat_test
```

`--string KEY=VALUE` requires the numeric key; passing the symbolic name is
rejected. This exercises the real path — `Message`'s `onReadable`, the
`payload.get("API_BASE_URL")` lookup, the `localStorage` write, and the cache
clear that fires when the token changes.

**Buttons.** Worktime binds UP (refresh) and SELECT (clock in/out):

```sh
pebble emu-button --emulator emery click up      # or select, down, back
```

**Other state.** `pebble emu-bt-connection --connected no|yes` toggles the
Bluetooth connection, which is what drives `watch.connected.pebblekit` and the
`Phone offline` path, and `pebble emu-set-time` moves the clock.

**Seeing the offline states at all.** Because `fetch()` never completes here,
the app never writes a `lastDashboard` snapshot, so disconnecting Bluetooth only
ever shows the empty `Phone offline` screen. To screenshot the cached glance and
its `Phone offline · HH:MM` line, temporarily seed the snapshot at the top of
`main.js` (and remove it before committing):

```js
localStorage.setItem("lastDashboard", JSON.stringify({
  version: 1,
  fetchedAt: Math.floor(Date.now() / 1000),
  shift: "Today: Morning",
  task: { text: "Working", start_time: new Date(Date.now() - 3600e3).toISOString() },
}));
```

## The mock backend

[`scripts/mock-server.py`](scripts/mock-server.py) implements the three routes
from `backend/app/routers/pebble.py` — dashboard, clock-in, clock-out — with the
same bearer-token check, the same status codes (201 on clock-in, 409 on a double
clock-in or a clock-out with nothing running), and payloads that validate
against the real `PebbleDashboardRead` and `TaskRead` models. It logs every
request with a timestamp to `requests.log`, which is the point: the
mutation-replay acceptance criteria are about what the server received, not
about what the watch displayed. Three rapid SELECT presses should produce
exactly one `POST clock-in` line.

```sh
python3 pebble/scripts/mock-server.py 8899
python3 pebble/scripts/mock-server.py 8899 --latency 3     # time to press SELECT repeatedly
python3 pebble/scripts/mock-server.py 8899 --fail-with 503 # check the state stays retryable
python3 pebble/scripts/mock-server.py 8899 --clocked-in    # start mid-task, to clock out first
```

Requests are served on threads, so genuinely overlapping mutations would appear
as interleaved log lines rather than being serialized by the server.

It is equally useful for the hardware run — point `API_BASE_URL` at a laptop on
the same network (`--host <lan-ip>`) instead of at a real Worktime server, and
you get an exact record of what the watch actually submitted, without touching
real time-tracking data.

## The `fetch()` dead end

Watch-side `fetch()` never completes under QEMU + pypkjs. The promise never
settles, and no request reaches the server.

What happens: `httpclient-pebble.js` opens its own AppMessage channel and only
writes a queued request when that channel reports writable. In
`pebble-appmessage.c`, writability is granted by `updateActive()`, which is
driven by a PebbleOS comm-session event gated on
`sys_app_pp_get_comm_session()` — a *system* session that pypkjs never
establishes. So the request sits in the queue forever.

Things that look like the cause but are not: `watch.connected.pebblekit` is
`true` throughout, and the proxy handshake completes (enable
`moddableProxy.log = true` in `src/pkjs/index.js` and you will see
`readyReceived` and the watch's `15025` probe). Toggling
`emu-bt-connection` to force a session event does not help either.

A fetch-only app containing no Worktime code stalls identically, so this is an
emulator limitation, not an app bug. Confirm that first if you ever suspect
otherwise.

One consequence worth recognising: each stalled fetch is retained, so repeatedly
pressing UP eventually aborts the app with `fxAbort memory full` in the log.
That is a symptom of the stall, not an independent memory bug.

## Gotchas

- **`pkill -f mock-server.py` (or `qemu-pebble`) can kill the shell running
  it.** If the pattern appears in the enclosing `bash -c` command line, `pkill
  -f` matches that process too and the script dies silently with a nonzero exit
  and no output. Confirmed here while writing the tests. Use `pkill -x`, or put
  the commands in a script file.
- **A wedged emulator reports `libpebble2.exceptions.TimeoutError` or
  `Connection refused`**, and `pebble install` may log `QEMU is already
  running` while nothing responds. `pebble kill` and start again; this happens
  after an `fxAbort` or a Bluetooth toggle.
- **The emulator persists app storage across installs**, under
  `~/.local/share/pebble-sdk/4.17/emery`. Worktime keeps `apiBaseUrl`,
  `authToken`, and `lastDashboard` in `localStorage`, and all three survive a
  reinstall — so a token from an earlier run will make the app skip its "Not
  configured" screen. Use `pebble wipe` for a genuinely clean device.
- **Screenshots need `SDL_VIDEODRIVER=dummy`** on a headless host, or QEMU fails
  to start with an SDL error.
