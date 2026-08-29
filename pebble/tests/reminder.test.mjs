// Covers the planned-task-starting-soon reminder: a single vibration plus a
// "Starting soon" hint line, derived entirely from the dashboard/snapshot data
// the watch already has -- no scheduled wakeup, so this only fires while the
// app happens to be open and ticking (see AGENTS.md / issue #1206).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHarness, dashboardBody, snapshot } from "./harness.mjs";

const TOKEN = { authToken: "wtpat_test", apiBaseUrl: "https://example.test" };

function ok(body) {
  return () => ({ status: 200, body });
}

function plannedTask(minutesFromNow, text = "Team sync") {
  return { text, start_time: new Date(Date.now() + minutesFromNow * 60_000).toISOString() };
}

test("a planned task inside the lead window buzzes once and shows a hint", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(ok(dashboardBody({ plannedTask: plannedTask(5) })));

  await harness.display();

  assert.deepEqual(harness.pulses, ["double"]);
  assert.match(harness.labels.HINT.string, /^Starting soon: Team sync \d\d:\d\d$/);

  // Re-checking on later ticks must not buzz again for the same task.
  harness.tick();
  harness.tick();
  assert.deepEqual(harness.pulses, ["double"]);
});

test("a planned task outside the lead window does not buzz", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(ok(dashboardBody({ plannedTask: plannedTask(30) })));

  await harness.display();
  harness.tick();

  assert.deepEqual(harness.pulses, []);
  assert.equal(harness.labels.HINT.string, "SELECT: clock in/out");
});

test("no planned task never buzzes", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(ok(dashboardBody()));

  await harness.display();
  harness.tick();

  assert.deepEqual(harness.pulses, []);
  assert.equal(harness.labels.HINT.string, "SELECT: clock in/out");
});

test("the hint clears once the planned task's start time has passed", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(ok(dashboardBody({ plannedTask: plannedTask(-1) })));

  await harness.display();

  assert.deepEqual(harness.pulses, []);
  assert.equal(harness.labels.HINT.string, "SELECT: clock in/out");
});

test("the offline cached glance still carries and buzzes the reminder", async () => {
  const harness = createHarness({
    connected: false,
    storage: { ...TOKEN, lastDashboard: snapshot({ plannedTask: plannedTask(5) }) },
  });

  await harness.display();

  assert.deepEqual(harness.pulses, ["double"]);
  assert.match(harness.labels.HINT.string, /^Starting soon: Team sync \d\d:\d\d$/);
});

test("a rescheduled planned task re-arms the reminder", async () => {
  const harness = createHarness({ storage: TOKEN });
  harness.setResponder(ok(dashboardBody({ plannedTask: plannedTask(5) })));
  await harness.display();
  assert.deepEqual(harness.pulses, ["double"]);

  // Same task pushed further out, then back inside the window under a new time.
  harness.setResponder(ok(dashboardBody({ plannedTask: plannedTask(9, "Team sync (moved)") })));
  await harness.press("up");

  assert.deepEqual(harness.pulses, ["double", "double"]);
  assert.match(harness.labels.HINT.string, /^Starting soon: Team sync \(moved\) \d\d:\d\d$/);
});
