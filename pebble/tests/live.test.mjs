// End-to-end check of the watch app against scripts/mock-server.py over real
// HTTP: the app's own request/parse/render path, the mock's status codes, and
// the payload shapes from backend/app/routers/pebble.py.
//
// Skipped when python3 is unavailable. This still stubs Piu and AppMessage —
// only a device or the emulator covers those (see ../EMULATOR.md).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createHarness } from "./harness.mjs";

const SERVER = resolve(import.meta.dirname, "../scripts/mock-server.py");
const TOKEN = "wtpat_test";
const python = [
  process.env.PYTHON,
  "python3",
  resolve(import.meta.dirname, "../../backend/.venv/Scripts/python.exe"),
  "python",
]
  .filter(Boolean)
  .find((candidate) => spawnSync(candidate, ["--version"]).status === 0);
const hasPython = Boolean(python);

let server;
let port;
let workdir;

// Ask the OS for a free port rather than guessing one, so a busy port on a CI
// runner cannot fail the suite.
function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.on("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port: chosen } = probe.address();
      probe.close(() => done(chosen));
    });
  });
}

// The harness stubs fetch; this responder forwards to the mock server so the
// app's real URLs, headers, and JSON parsing are exercised.
async function proxy(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function harnessFor() {
  const harness = createHarness({
    storage: { authToken: TOKEN, apiBaseUrl: `http://127.0.0.1:${port}` },
  });
  harness.setResponder(proxy);
  return harness;
}

before(async () => {
  if (!hasPython) return;
  workdir = mkdtempSync(join(tmpdir(), "pebble-live-"));
  port = await freePort();
  server = spawn(python, [SERVER, String(port), "--log", join(workdir, "requests.log")], {
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/pebble/dashboard`);
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  throw new Error("mock server did not start");
});

// Leave no running task behind, so each test starts from a known server state.
beforeEach(async () => {
  if (!hasPython) return;
  await fetch(`http://127.0.0.1:${port}/api/pebble/actions/clock-out`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
  }); // 409 when nothing is running, which is the state we want anyway
});

after(() => {
  server?.kill();
  if (workdir) rmSync(workdir, { recursive: true, force: true });
});

test("renders a dashboard served by the mock backend", { skip: !hasPython }, async () => {
  const harness = harnessFor();

  await harness.display();

  assert.equal(harness.labels.SHIFT.string, "Today: Morning");
  assert.equal(harness.labels.STATUS.string, "Not clocked in");
  assert.equal(harness.labels.HINT.string, "SELECT: clock in/out");
});

test("clocks in and out against the mock backend", { skip: !hasPython }, async () => {
  const harness = harnessFor();
  await harness.display();

  await harness.press("select");
  assert.equal(harness.labels.STATUS.string, "Working");
  // start_time is the aware-datetime format FastAPI emits; a parse failure
  // here would show up as an empty or nonsensical timer on a real watch.
  assert.match(harness.labels.TIMER.string, /^00:00:\d\d$/);

  await harness.press("select");
  assert.equal(harness.labels.STATUS.string, "Not clocked in");
  assert.equal(harness.labels.TIMER.string, "");
});

test("a stale cache does not replay a mutation", { skip: !hasPython }, async () => {
  // Clock in on one "watch", then bring up a second one whose cache still says
  // a task is running after the first clocked out.
  const first = harnessFor();
  await first.display();
  await first.press("select");
  assert.equal(first.labels.STATUS.string, "Working");

  const second = createHarness({
    connected: false,
    storage: {
      authToken: TOKEN,
      apiBaseUrl: `http://127.0.0.1:${port}`,
      lastDashboard: JSON.stringify({
        version: 1,
        fetchedAt: Math.floor(Date.now() / 1000),
        shift: "Today: Morning",
        task: { text: "Working", start_time: new Date().toISOString() },
      }),
    },
  });
  second.setResponder(proxy);
  await second.display();
  assert.equal(second.labels.STATUS.string, "Working");

  await first.press("select");
  assert.equal(first.labels.STATUS.string, "Not clocked in");

  // The second watch still shows the cached running task; pressing SELECT must
  // clock in (from the re-read) rather than replay a clock-out.
  second.setConnected(true);
  await second.press("select");
  assert.equal(second.labels.STATUS.string, "Working");
  assert.deepEqual(
    second.requests.map((request) => new URL(request.url).pathname),
    [
      "/api/pebble/dashboard",
      "/api/pebble/actions/clock-in",
      "/api/pebble/dashboard",
    ],
  );
});

test("a real 409 resolves by re-reading, not by retrying", { skip: !hasPython }, async () => {
  // This watch has a live read saying nothing is running…
  const watchApp = harnessFor();
  await watchApp.display();
  assert.equal(watchApp.labels.STATUS.string, "Not clocked in");

  // …but the user clocks in from the web app before pressing SELECT.
  const elsewhere = harnessFor();
  await elsewhere.display();
  await elsewhere.press("select");

  watchApp.requests.length = 0;
  await watchApp.press("select");

  assert.deepEqual(
    watchApp.requests.map((request) => new URL(request.url).pathname),
    ["/api/pebble/actions/clock-in", "/api/pebble/dashboard"],
  );
  assert.equal(watchApp.labels.STATUS.string, "Working");
});
