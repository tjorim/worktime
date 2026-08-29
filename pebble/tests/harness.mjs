// Runs src/embeddedjs/main.js against stubbed Alloy globals.
//
// This exercises the watch app's *logic* — caching, staleness, and the
// serialization of clock actions — not the Alloy APIs themselves, which still
// need a device or emulator (see pebble/README.md).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";

const MAIN_PATH = resolve(import.meta.dirname, "../src/embeddedjs/main.js");

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

// The watch bundle imports Alloy modules by bare specifier; the stubs below
// stand in for them, so the import statements are dropped before evaluation.
function stripImports(source) {
  return source.replace(/^import .*?;$/gm, "");
}

export function createHarness({ connected = true, storage = {} } = {}) {
  const store = new Map(Object.entries(storage));
  const requests = [];
  const inFlight = new Set();
  const listeners = new Map();
  const hooks = {};
  const pulses = [];
  let respond = () => ({ status: 200, body: {} });

  class Behavior {}

  function Label(data, dict) {
    const label = { string: dict.string ?? "" };
    if (dict.anchor) data[dict.anchor] = label;
    return label;
  }

  const Application = {
    template(build) {
      return class FakeApplication {
        constructor(_parent, data) {
          this.data = data;
          const spec = build(data);
          this.behavior = new spec.Behavior();
          this.behavior.onCreate(this, data);
          hooks.application = this;
        }
        start() {}
      };
    },
  };

  const context = createContext({
    Application,
    Behavior,
    Label,
    Skin: class Skin {},
    Style: class Style {},
    console,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    watch: {
      connected: { pebblekit: connected },
      addEventListener: (type, handler) => listeners.set(type, handler),
    },
    fetch: (url, options = {}) => {
      requests.push({ url, method: options.method, headers: options.headers });
      const work = (async () => {
        // Awaited so a responder can proxy to a real server (see live.test.mjs).
        const { status, body } = await respond(url, options);
        return {
          status,
          ok: status >= 200 && status < 300,
          json: async () => body,
        };
      })();
      inFlight.add(work);
      const forget = () => inFlight.delete(work);
      work.then(forget, forget);
      return work;
    },
    Button: class Button {
      constructor(dict) {
        hooks.onPush = dict.onPush.bind(this);
      }
    },
    // Alloy calls onReadable with the Message as `this`; the payload arrives
    // through its read().
    Message: class Message {
      constructor(dict) {
        this.onReadable = dict.onReadable;
        hooks.message = this;
      }
    },
    Vibes: {
      shortPulse: () => pulses.push("short"),
      longPulse: () => pulses.push("long"),
      doublePulse: () => pulses.push("double"),
      pattern: (durations) => pulses.push(["pattern", durations]),
      cancel: () => pulses.push("cancel"),
    },
  });

  runInContext(stripImports(readFileSync(MAIN_PATH, "utf8")), context, {
    filename: "main.js",
  });

  // Alloy resolves and dispatches on its own event loop. Wait for the app to
  // go quiet: no request outstanding, and nothing new started after a full
  // turn. The deadline only guards a responder that never answers.
  const settle = async (timeoutMs = 2000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (inFlight.size) {
        await Promise.race([Promise.allSettled([...inFlight]), pause(5)]);
      }
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
      if (!inFlight.size) {
        await pause(0);
        if (!inFlight.size) return;
      }
      if (Date.now() > deadline) return;
    }
  };

  return {
    requests,
    get labels() {
      return hooks.application.data;
    },
    get stored() {
      return Object.fromEntries(store);
    },
    get pulses() {
      return pulses.slice();
    },
    // Fires the same per-second hook Piu drives the elapsed timer and the
    // planned-task reminder from, without waiting for a real second to pass.
    tick() {
      hooks.application.behavior.onTimeChanged();
    },
    setConnected(value) {
      context.watch.connected.pebblekit = value;
    },
    // respond(url, options) -> { status, body }
    setResponder(handler) {
      respond = handler;
    },
    async display() {
      hooks.application.behavior.onDisplaying(hooks.application);
      await settle();
    },
    async press(type) {
      hooks.onPush(true, type);
      await settle();
    },
    async configure(payload) {
      const map = new Map(Object.entries(payload));
      hooks.message.read = () => map;
      hooks.message.onReadable();
      await settle();
    },
    async reconnect() {
      context.watch.connected.pebblekit = true;
      listeners.get("connected")?.();
      await settle();
    },
    // Fires a watch event without waiting for the app to go quiet, so a test
    // can deliver it while an earlier request is still in flight.
    emit(type) {
      listeners.get(type)?.();
    },
    async settle() {
      await settle();
    },
  };
}

export const DASHBOARD_PATH = "/api/pebble/dashboard";
export const CLOCK_IN_PATH = "/api/pebble/actions/clock-in";
export const CLOCK_OUT_PATH = "/api/pebble/actions/clock-out";

export function dashboardBody({ task = null, plannedTask = null, shift = null } = {}) {
  return {
    running_task: task,
    planned_task: plannedTask,
    current_status: shift ? { current_shift: { shift } } : { current_shift: null },
    next_shifts: { items: [] },
  };
}

export function snapshot({
  task = null,
  plannedTask = null,
  shift = "Today: Morning",
  ageSeconds = 0,
} = {}) {
  return JSON.stringify({
    version: 1,
    fetchedAt: Math.floor(Date.now() / 1000) - ageSeconds,
    shift,
    task,
    plannedTask,
  });
}
