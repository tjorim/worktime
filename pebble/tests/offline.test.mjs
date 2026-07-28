import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLOCK_IN_PATH,
  CLOCK_OUT_PATH,
  DASHBOARD_PATH,
  createHarness,
  dashboardBody,
  snapshot,
} from "./harness.mjs";

const TOKEN = { authToken: "wtpat_test", apiBaseUrl: "https://example.test" };
const RUNNING = { text: "Working", start_time: new Date(Date.now() - 60_000).toISOString() };

function paths(harness) {
  return harness.requests.map((request) => new URL(request.url).pathname);
}

function ok(body) {
  return () => ({ status: 200, body });
}

test("a live dashboard renders shift, task, and the clock hint", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(
    ok(dashboardBody({ task: RUNNING, shift: { name: "Morning", code: "M" } })),
  );

  await harness.display();

  assert.equal(harness.labels.SHIFT.string, "Today: Morning");
  assert.equal(harness.labels.STATUS.string, "Working");
  assert.match(harness.labels.TIMER.string, /^00:0[01]:\d\d$/);
  assert.equal(harness.labels.HINT.string, "SELECT: clock in/out");
});

test("a successful read is persisted for the next cold start", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(
    ok(dashboardBody({ task: RUNNING, shift: { name: "Morning", code: "M" } })),
  );

  await harness.display();

  const cached = JSON.parse(harness.stored.lastDashboard);
  assert.equal(cached.shift, "Today: Morning");
  assert.equal(cached.task.text, "Working");
  assert.equal(cached.task.start_time, RUNNING.start_time);
});

test("an offline cold start shows the cached glance with its timestamp", async () => {
  const harness = createHarness({
    connected: false,
    storage: { ...TOKEN, lastDashboard: snapshot({ task: RUNNING }) },
  });

  await harness.display();

  assert.equal(harness.labels.SHIFT.string, "Today: Morning");
  assert.equal(harness.labels.STATUS.string, "Working");
  assert.match(harness.labels.HINT.string, /^Phone offline · \d\d:\d\d$/);
  assert.deepEqual(paths(harness), []);
});

test("an offline cold start without a cache reports the disconnect", async () => {
  const harness = createHarness({ connected: false, storage: TOKEN });

  await harness.display();

  assert.equal(harness.labels.STATUS.string, "Phone offline");
  assert.equal(harness.labels.TIMER.string, "");
});

test("a cache older than 12 hours is discarded rather than displayed", async () => {
  const harness = createHarness({
    connected: false,
    storage: {
      ...TOKEN,
      lastDashboard: snapshot({ task: RUNNING, ageSeconds: 13 * 60 * 60 }),
    },
  });

  await harness.display();

  assert.equal(harness.labels.STATUS.string, "Phone offline");
  assert.equal(harness.labels.TIMER.string, "");
  assert.equal(harness.stored.lastDashboard, undefined);
});

test("SELECT while offline never reaches the server", async () => {
  const harness = createHarness({
    connected: false,
    storage: { ...TOKEN, lastDashboard: snapshot({ task: RUNNING }) },
  });

  await harness.display();
  await harness.press("select");

  assert.deepEqual(paths(harness), []);
  assert.match(harness.labels.HINT.string, /^Phone offline · /);
});

test("SELECT on cached state re-reads before choosing the mutation", async () => {
  // The cache says a task is running; the server says it already stopped, so
  // the press must clock in rather than replay a clock-out.
  const harness = createHarness({
    connected: false,
    storage: { ...TOKEN, lastDashboard: snapshot({ task: RUNNING }) },
  });
  await harness.display();
  assert.equal(harness.labels.STATUS.string, "Working");

  harness.setConnected(true);
  harness.setResponder((url) =>
    url.endsWith(DASHBOARD_PATH)
      ? { status: 200, body: dashboardBody() }
      : { status: 201, body: {} },
  );
  await harness.press("select");

  assert.deepEqual(paths(harness), [DASHBOARD_PATH, CLOCK_IN_PATH, DASHBOARD_PATH]);
});

test("reconnecting does not replay a clock action", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder((url) =>
    url.endsWith(DASHBOARD_PATH)
      ? { status: 200, body: dashboardBody() }
      : { status: 201, body: {} },
  );
  await harness.display();
  await harness.press("select");
  assert.deepEqual(paths(harness), [DASHBOARD_PATH, CLOCK_IN_PATH, DASHBOARD_PATH]);

  harness.setConnected(false);
  await harness.settle();
  harness.requests.length = 0;
  harness.setResponder(ok(dashboardBody({ task: RUNNING })));
  await harness.reconnect();

  assert.deepEqual(paths(harness), [DASHBOARD_PATH]);
});

test("repeated SELECT presses submit a single mutation", async () => {
  const harness = createHarness({ storage: TOKEN });
  let releaseClockIn;
  harness.setResponder((url) => {
    if (url.endsWith(DASHBOARD_PATH)) return { status: 200, body: dashboardBody() };
    return {
      status: 201,
      body: new Promise((resolvePromise) => {
        releaseClockIn = () => resolvePromise({});
      }),
    };
  });
  await harness.display();

  await harness.press("select");
  await harness.press("select");
  await harness.press("select");

  assert.deepEqual(
    paths(harness).filter((path) => path === CLOCK_IN_PATH),
    [CLOCK_IN_PATH],
  );
  releaseClockIn();
  await harness.settle();
});

test("clocking out uses the running task from the live read", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder((url) =>
    url.endsWith(DASHBOARD_PATH)
      ? { status: 200, body: dashboardBody({ task: RUNNING }) }
      : { status: 200, body: {} },
  );
  await harness.display();

  await harness.press("select");

  assert.deepEqual(paths(harness), [DASHBOARD_PATH, CLOCK_OUT_PATH, DASHBOARD_PATH]);
});

test("a conflicting mutation re-reads instead of retrying", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder((url) =>
    url.endsWith(DASHBOARD_PATH)
      ? { status: 200, body: dashboardBody({ task: RUNNING }) }
      : { status: 409, body: {} },
  );
  await harness.display();

  await harness.press("select");

  assert.deepEqual(paths(harness), [DASHBOARD_PATH, CLOCK_OUT_PATH, DASHBOARD_PATH]);
  assert.equal(harness.labels.STATUS.string, "Working");
});

test("authentication failures prompt reconfiguration", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(() => ({ status: 401, body: {} }));

  await harness.display();

  assert.equal(harness.labels.STATUS.string, "Sign-in needed");
});

test("retryable failures fall back to the cached glance", async () => {
  const harness = createHarness({
    storage: { ...TOKEN, lastDashboard: snapshot({ task: RUNNING }) },
  });
  harness.setResponder(() => ({ status: 503, body: {} }));

  await harness.display();

  assert.equal(harness.labels.STATUS.string, "Working");
  assert.match(harness.labels.HINT.string, /^Try again later \(503\) · \d\d:\d\d$/);
});

test("UP refreshes the dashboard", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(ok(dashboardBody()));
  await harness.display();
  harness.requests.length = 0;

  await harness.press("up");

  assert.deepEqual(paths(harness), [DASHBOARD_PATH]);
});

test("an unconfigured watch asks for pairing", async () => {
  const harness = createHarness();

  await harness.display();
  await harness.press("select");

  assert.equal(harness.labels.STATUS.string, "Not configured");
  assert.deepEqual(paths(harness), []);
});

// A held response leaves the app mid-request: fetch has resolved, so the
// harness stops waiting, but the app is still awaiting the body.
function heldResponder(resolveWith) {
  let release;
  const responder = () => ({
    status: 200,
    body: new Promise((resolve) => {
      release = () => resolve(resolveWith);
    }),
  });
  return [responder, () => release()];
}

test("a snapshot stamped in the future is discarded", async () => {
  const harness = createHarness({
    connected: false,
    // The watch clock moved back after the read.
    storage: { ...TOKEN, lastDashboard: snapshot({ task: RUNNING, ageSeconds: -600 }) },
  });

  await harness.display();

  assert.equal(harness.labels.STATUS.string, "Phone offline");
  assert.equal(harness.stored.lastDashboard, undefined);
});

test("a reconnect during another request is serviced, not dropped", async () => {
  const harness = createHarness({ storage: TOKEN });
  const [held, release] = heldResponder(dashboardBody());
  harness.setResponder(held);

  await harness.display(); // the read's body is still held, so the app is busy
  harness.emit("connected"); // dropped by the in-flight guard…
  release();
  await harness.settle();

  // …and made good once the first request finishes.
  assert.deepEqual(paths(harness), [DASHBOARD_PATH, DASHBOARD_PATH]);
});

test("a credential change mid-read does not adopt the old account's state", async () => {
  const harness = createHarness({ storage: TOKEN });
  const [held, release] = heldResponder(
    dashboardBody({ task: RUNNING, shift: { name: "Morning", code: "M" } }),
  );
  harness.setResponder(held);
  await harness.display(); // read in flight, authorized with the old token

  await harness.configure({ AUTH_TOKEN: "wtpat_other" });
  // The newly paired account has no running task.
  harness.setResponder(ok(dashboardBody()));
  release(); // the old account's response lands after the swap
  await harness.settle();

  assert.equal(harness.labels.STATUS.string, "Not clocked in");
  assert.equal(JSON.parse(harness.stored.lastDashboard).task, null);
  assert.equal(harness.requests.at(-1).headers.Authorization, "Bearer wtpat_other");
});

test("an old account's response is never cached under a new credential", async () => {
  const harness = createHarness({ storage: TOKEN });
  const [held, release] = heldResponder(
    dashboardBody({ task: RUNNING, shift: { name: "Morning", code: "M" } }),
  );
  harness.setResponder(held);
  await harness.display();

  await harness.configure({ AUTH_TOKEN: "wtpat_other" });
  // The refresh owed to the new credential fails, so anything the old-token
  // response managed to cache would be rendered in its place.
  harness.setResponder(() => ({ status: 503, body: {} }));
  release();
  await harness.settle();

  assert.equal(harness.labels.STATUS.string, "Try again later (503)");
  assert.equal(harness.stored.lastDashboard, undefined);
});

test("a mutation after a credential change uses the new account's state", async () => {
  const harness = createHarness({ storage: TOKEN });
  const [held, release] = heldResponder(
    dashboardBody({ task: RUNNING, shift: { name: "Morning", code: "M" } }),
  );
  harness.setResponder(held);
  await harness.display();

  await harness.configure({ AUTH_TOKEN: "wtpat_other" });
  harness.setResponder((url) =>
    url.endsWith(DASHBOARD_PATH)
      ? { status: 200, body: dashboardBody() }
      : { status: 201, body: {} },
  );
  release();
  await harness.settle();
  harness.requests.length = 0;

  await harness.press("select");

  // The old account was clocked in; the new one is not, so this must clock in.
  assert.deepEqual(paths(harness), [CLOCK_IN_PATH, DASHBOARD_PATH]);
});

test("a new pairing credential clears the cached glance", async () => {
  const harness = createHarness({
    storage: { ...TOKEN, lastDashboard: snapshot({ task: RUNNING }) },
  });
  harness.setResponder(ok(dashboardBody()));

  await harness.configure({
    API_BASE_URL: "https://other.test/",
    AUTH_TOKEN: "wtpat_other",
  });

  assert.equal(harness.stored.authToken, "wtpat_other");
  assert.equal(harness.stored.apiBaseUrl, "https://other.test");
  assert.equal(harness.labels.STATUS.string, "Not clocked in");
  assert.equal(harness.requests[0].url, "https://other.test/api/pebble/dashboard");
  assert.equal(harness.requests[0].headers.Authorization, "Bearer wtpat_other");
});

test("a changed server clears a snapshot from the previous deployment", async () => {
  const harness = createHarness({
    connected: false,
    storage: {
      ...TOKEN,
      lastDashboard: snapshot({ task: RUNNING }),
    },
  });
  await harness.display();

  await harness.configure({ API_BASE_URL: "https://other.test/" });

  assert.equal(harness.stored.lastDashboard, undefined);
  assert.equal(harness.labels.STATUS.string, "Phone offline");
});
