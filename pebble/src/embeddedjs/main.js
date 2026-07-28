// Worktime companion watch app: active-task glance and clock in/out.
// API calls use Alloy's watch-side fetch(), proxied through PebbleKit JS.
import {} from "piu/MC";
import Button from "pebble/button";
import Message from "pebble/message";

const DEFAULT_API_BASE_URL = "https://worktime.tjor.im";
// Last successful dashboard, kept so the watch still shows shift and task
// information while the phone is out of range. Display-only: clock actions
// never act on it (see toggleClock).
const SNAPSHOT_KEY = "lastDashboard";
const SNAPSHOT_VERSION = 1;
// Beyond this the cached glance is more misleading than useful (an elapsed
// timer that ran overnight is worse than no timer at all).
const SNAPSHOT_MAX_AGE_SECONDS = 12 * 60 * 60;
const CLOCK_HINT = "SELECT: clock in/out";

const pad = (value) => (value < 10 ? `0${value}` : String(value));

function formatElapsed(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatClock(epochSeconds) {
  const date = new Date(epochSeconds * 1000);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shiftLine(dashboard) {
  const current = dashboard?.current_status?.current_shift;
  const next = dashboard?.next_shifts?.items?.[0];
  if (current?.shift) return `Today: ${current.shift.name || current.shift.code}`;
  if (next?.shift) return `Next: ${next.shift.name || next.shift.code} ${next.date}`;
  return "No shift configured";
}

function runningTaskOf(dashboard) {
  const task = dashboard?.running_task;
  if (!task || task.stop_time) return null;
  return { text: task.text || "Working", start_time: task.start_time };
}

function snapshotOf(dashboard) {
  return {
    version: SNAPSHOT_VERSION,
    fetchedAt: Math.floor(Date.now() / 1000),
    shift: shiftLine(dashboard),
    task: runningTaskOf(dashboard),
  };
}

function saveSnapshot(snapshot) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    // A full or unavailable store only costs the offline glance.
  }
}

function clearSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch (error) {
    // Nothing to do: the stale snapshot is display-only.
  }
}

function loadSnapshot() {
  let stored;
  try {
    stored = localStorage.getItem(SNAPSHOT_KEY);
  } catch (error) {
    return null;
  }
  if (!stored) return null;
  let snapshot;
  try {
    snapshot = JSON.parse(stored);
  } catch (error) {
    clearSnapshot();
    return null;
  }
  if (!snapshot || snapshot.version !== SNAPSHOT_VERSION || !snapshot.fetchedAt) {
    clearSnapshot();
    return null;
  }
  if (Math.floor(Date.now() / 1000) - snapshot.fetchedAt > SNAPSHOT_MAX_AGE_SECONDS) {
    clearSnapshot();
    return null;
  }
  return snapshot;
}

const WorktimeApplication = Application.template(($) => ({
  skin: new Skin({ fill: "white" }),
  contents: [
    Label($, {
      anchor: "SHIFT",
      left: 4,
      right: 4,
      top: 10,
      height: 24,
      style: new Style({ font: "18px Gothic", color: "gray" }),
      string: "Shift: loading…",
    }),
    Label($, {
      anchor: "STATUS",
      left: 4,
      right: 4,
      top: 40,
      height: 40,
      style: new Style({ font: "bold 24px Gothic", color: "black" }),
      string: "Loading…",
    }),
    Label($, {
      anchor: "TIMER",
      left: 4,
      right: 4,
      top: 90,
      height: 36,
      style: new Style({ font: "28px Gothic", color: "black" }),
      string: "",
    }),
    Label($, {
      anchor: "HINT",
      left: 4,
      right: 4,
      bottom: 12,
      height: 20,
      style: new Style({ font: "16px Gothic", color: "gray" }),
      string: CLOCK_HINT,
    }),
  ],
  Behavior: class extends Behavior {
    onCreate(application, data) {
      this.data = data;
      this.runningTask = null;
      this.lastTick = -1;
    }

    onDisplaying(application) {
      application.start();
      // Paint the cached glance first so a cold start out of range shows
      // something better than "Loading…" while the fetch is attempted.
      const snapshot = loadSnapshot();
      if (snapshot) this.showSnapshot(snapshot, "Last known");
      runExclusive(refreshStatus);
    }

    setHint(hint) {
      this.data.HINT.string = hint;
    }

    showTask(task) {
      this.runningTask = task;
      this.data.STATUS.string = task ? task.text || "Working" : "Not clocked in";
      if (!task) {
        this.data.TIMER.string = "";
        this.lastTick = -1;
        return;
      }
      this.lastTick = -1;
      this.onTimeChanged();
    }

    // `staleReason` is null for a live dashboard, otherwise the reason the
    // watch is showing cached values (offline, server error, …).
    showSnapshot(snapshot, staleReason) {
      this.data.SHIFT.string = snapshot.shift || "Shift unavailable";
      this.showTask(snapshot.task);
      this.setHint(
        staleReason ? `${staleReason} · ${formatClock(snapshot.fetchedAt)}` : CLOCK_HINT,
      );
    }

    showError(message) {
      this.runningTask = null;
      this.data.SHIFT.string = "Shift unavailable";
      this.data.STATUS.string = message;
      this.data.TIMER.string = "";
      this.lastTick = -1;
      this.setHint(CLOCK_HINT);
    }

    onTimeChanged() {
      if (!this.runningTask) return;
      const now = Math.floor(Date.now() / 1000);
      if (now === this.lastTick) return;
      this.lastTick = now;
      const startedAt = Math.floor(new Date(this.runningTask.start_time).getTime() / 1000);
      this.data.TIMER.string = formatElapsed(Math.max(0, now - startedAt));
    }
  },
}));

const application = new WorktimeApplication(null, {});
let apiBaseUrl = localStorage.getItem("apiBaseUrl") || DEFAULT_API_BASE_URL;
let authToken = localStorage.getItem("authToken");
// True only while the rendered task state came from a dashboard read that has
// not been superseded by a mutation or a failure.
let dashboardIsLive = false;
let busy = false;

// Serializes every watch → server interaction: a second SELECT press while a
// clock mutation is in flight is dropped instead of queued, so repeated
// presses cannot submit overlapping mutations.
async function runExclusive(action) {
  if (busy) return;
  busy = true;
  try {
    await action();
  } finally {
    busy = false;
  }
}

function authorizationHeaders() {
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
}

function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function apiRequest(method, path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: authorizationHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 || response.status === 403) {
    throw apiError("Sign-in needed", response.status);
  }
  if (response.status === 409) {
    throw apiError("Out of sync", response.status);
  }
  if (response.status === 429 || response.status >= 500) {
    throw apiError(`Try again later (${response.status})`, response.status);
  }
  if (!response.ok) throw apiError(`Error ${response.status}`, response.status);
  return response.status === 204 ? null : response.json();
}

// Renders the cached glance labeled with why it is stale, or the bare reason
// when there is nothing cached. Never marks the dashboard live.
function showStale(reason) {
  dashboardIsLive = false;
  const snapshot = loadSnapshot();
  if (snapshot) application.behavior.showSnapshot(snapshot, reason);
  else application.behavior.showError(reason);
}

// Resolves true when the rendered state came from a fresh server read.
async function refreshStatus() {
  if (!authToken) {
    dashboardIsLive = false;
    application.behavior.showError("Not configured");
    return false;
  }
  if (!watch.connected.pebblekit) {
    showStale("Phone offline");
    return false;
  }
  try {
    const dashboard = await apiRequest("GET", "/api/pebble/dashboard");
    const snapshot = snapshotOf(dashboard);
    saveSnapshot(snapshot);
    dashboardIsLive = true;
    application.behavior.showSnapshot(snapshot, null);
    return true;
  } catch (error) {
    showStale(String(error.message || error));
    return false;
  }
}

async function toggleClock() {
  if (!authToken) {
    application.behavior.showError("Not configured");
    return;
  }
  // Clocking is online-only: without the phone link there is no way to reach
  // the server, and queueing the action would replay it on reconnect.
  if (!watch.connected.pebblekit) {
    showStale("Phone offline");
    return;
  }
  try {
    // Cached state is display-only: re-read the dashboard before deciding
    // between clock-in and clock-out so a stale task can never be replayed
    // into a mutation. The read also fails closed while offline.
    if (!dashboardIsLive) {
      application.behavior.setHint("Checking…");
      if (!(await refreshStatus())) return;
    }
    const runningTask = application.behavior.runningTask;
    application.behavior.data.STATUS.string = runningTask ? "Clocking out…" : "Clocking in…";
    // The server view is about to change; only the follow-up read is authoritative.
    dashboardIsLive = false;
    await apiRequest(
      "POST",
      runningTask ? "/api/pebble/actions/clock-out" : "/api/pebble/actions/clock-in",
    );
    await refreshStatus();
  } catch (error) {
    // 409 means the server state moved under us (clocked in or out elsewhere);
    // re-reading resolves it instead of retrying the mutation.
    if (error.status === 409) {
      await refreshStatus();
      return;
    }
    showStale(String(error.message || error));
  }
}

const message = new Message({
  keys: ["API_BASE_URL", "AUTH_TOKEN"],
  onReadable() {
    const payload = this.read();
    const baseUrl = payload.get("API_BASE_URL");
    const token = payload.get("AUTH_TOKEN");
    if (baseUrl) {
      apiBaseUrl = baseUrl.replace(/\/$/, "");
      localStorage.setItem("apiBaseUrl", apiBaseUrl);
    }
    if (token && token !== authToken) {
      authToken = token;
      localStorage.setItem("authToken", authToken);
      // The credential may belong to a different account than the cached glance.
      clearSnapshot();
      dashboardIsLive = false;
    }
    runExclusive(refreshStatus);
  },
});

watch.addEventListener("connected", () => runExclusive(refreshStatus));

new Button({
  types: ["up", "select"],
  onPush(down, type) {
    if (!down) return;
    if (type === "up") runExclusive(refreshStatus);
    else if (type === "select") runExclusive(toggleClock);
  },
});
