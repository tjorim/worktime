// Worktime companion watch app: active-task glance and clock in/out.
// API calls use Alloy's watch-side fetch(), proxied through PebbleKit JS.
import {} from "piu/MC";
import Button from "pebble/button";
import Message from "pebble/message";
import Vibes from "pebble/vibes";

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
// Mirrors the backend's REMINDER_LEAD_MINUTES (planned_task_reminder_scheduler.py),
// so the watch buzzes around the same time as the webapp/Android push.
const REMINDER_LEAD_SECONDS = 10 * 60;

const pad = (value) => (value < 10 ? `0${value}` : String(value));
// Alloy's font lookup only matches the Pebble system font table exactly:
// Gothic-Bold exists at 18px only, while Gothic-Regular exists at
// 9/14/18/24/28/36px. Unsupported combinations throw during Style
// construction and crash the app before it paints a frame.
const shiftStyle = new Style({ font: "18px Gothic", color: "gray" });
const statusStyle = new Style({ font: "bold 18px Gothic", color: "black" });
const timerStyle = new Style({ font: "28px Gothic", color: "black" });
const hintStyle = new Style({ font: "14px Gothic", color: "gray" });

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

function plannedTaskOf(dashboard) {
  const task = dashboard?.planned_task;
  if (!task) return null;
  return { text: task.text || "Working", start_time: task.start_time };
}

// The reminder text once `plannedTask.start_time` is within REMINDER_LEAD_SECONDS of
// `nowSeconds`, null before or after that window (including once the task has started).
// Deriving this fresh from the dashboard/snapshot data already on hand each tick -- rather
// than a scheduled wakeup -- is what keeps this within the "no new push/wake mechanism"
// scope: it only fires while the watch app happens to be open.
function reminderNoticeFor(plannedTask, nowSeconds) {
  if (!plannedTask) return null;
  const startSeconds = Math.floor(new Date(plannedTask.start_time).getTime() / 1000);
  const remaining = startSeconds - nowSeconds;
  if (remaining <= 0 || remaining > REMINDER_LEAD_SECONDS) return null;
  return `Starting soon: ${plannedTask.text} ${formatClock(startSeconds)}`;
}

function snapshotOf(dashboard) {
  return {
    version: SNAPSHOT_VERSION,
    fetchedAt: Math.floor(Date.now() / 1000),
    shift: shiftLine(dashboard),
    task: runningTaskOf(dashboard),
    plannedTask: plannedTaskOf(dashboard),
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
  const age = Math.floor(Date.now() / 1000) - snapshot.fetchedAt;
  // A negative age means the watch clock moved back since the read; that
  // snapshot is as untrustworthy as an expired one, and its "as of" time would
  // be in the future.
  if (age < 0 || age > SNAPSHOT_MAX_AGE_SECONDS) {
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
      style: shiftStyle,
      string: "Shift: loading…",
    }),
    Label($, {
      anchor: "STATUS",
      left: 4,
      right: 4,
      top: 40,
      height: 40,
      style: statusStyle,
      string: "Loading…",
    }),
    Label($, {
      anchor: "TIMER",
      left: 4,
      right: 4,
      top: 90,
      height: 36,
      style: timerStyle,
      string: "",
    }),
    Label($, {
      anchor: "HINT",
      left: 4,
      right: 4,
      bottom: 12,
      height: 20,
      style: hintStyle,
      string: CLOCK_HINT,
    }),
  ],
  Behavior: class extends Behavior {
    onCreate(application, data) {
      this.data = data;
      this.runningTask = null;
      this.plannedTask = null;
      // The reminder text currently shown (see reminderNoticeFor), or null. Tracked
      // separately from baseHint so a reminder can overlay whatever the hint line
      // would otherwise say, and so re-deriving it each tick vibrates at most once
      // per distinct notice instead of on every tick spent inside the lead window.
      this.reminderNotice = null;
      this.baseHint = CLOCK_HINT;
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
      this.baseHint = hint;
      this.renderHint();
    }

    renderHint() {
      this.data.HINT.string = this.reminderNotice || this.baseHint;
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
      this.plannedTask = snapshot.plannedTask || null;
      this.showTask(snapshot.task);
      this.setHint(
        staleReason ? `${staleReason} · ${formatClock(snapshot.fetchedAt)}` : CLOCK_HINT,
      );
      this.updateReminder(Math.floor(Date.now() / 1000));
    }

    showError(message) {
      this.runningTask = null;
      this.plannedTask = null;
      this.reminderNotice = null;
      this.data.SHIFT.string = "Shift unavailable";
      this.data.STATUS.string = message;
      this.data.TIMER.string = "";
      this.lastTick = -1;
      this.setHint(CLOCK_HINT);
    }

    onTimeChanged() {
      const now = Math.floor(Date.now() / 1000);
      this.updateReminder(now);
      if (!this.runningTask) return;
      if (now === this.lastTick) return;
      this.lastTick = now;
      const startedAt = Math.floor(new Date(this.runningTask.start_time).getTime() / 1000);
      this.data.TIMER.string = formatElapsed(Math.max(0, now - startedAt));
    }

    // Buzzes the watch once when the planned task's reminder text first appears (or
    // changes), then re-renders the hint line to show or clear it. Comparing against
    // the previously-shown notice text -- not just "has a planned task" -- is what
    // keeps this a single pulse for the whole lead window instead of buzzing on every
    // tick, while still re-arming for a different or rescheduled task.
    updateReminder(nowSeconds) {
      const notice = reminderNoticeFor(this.plannedTask, nowSeconds);
      if (notice === this.reminderNotice) return;
      this.reminderNotice = notice;
      if (notice) Vibes.doublePulse();
      this.renderHint();
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
// Bumped whenever the paired credential changes. A response authorized with
// the previous token must not be displayed, cached, or used to pick a mutation
// once it lands, since it describes a different account.
let credentialGeneration = 0;
// Set when a lifecycle refresh (reconnect, new credential) arrives while the
// watch is busy. Dropping a button press is intended; dropping one of these
// would leave the watch on state it knows is out of date.
let refreshOwed = false;

// Serializes every watch → server interaction: a second SELECT press while a
// clock mutation is in flight is dropped instead of queued, so repeated
// presses cannot submit overlapping mutations.
async function runExclusive(action) {
  if (busy) return;
  busy = true;
  try {
    await action();
    while (refreshOwed) {
      refreshOwed = false;
      await refreshStatus();
    }
  } finally {
    busy = false;
  }
}

// A refresh that must happen even if it cannot happen now.
function requestRefresh() {
  if (busy) refreshOwed = true;
  else runExclusive(refreshStatus);
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
  const generation = credentialGeneration;
  try {
    const dashboard = await apiRequest("GET", "/api/pebble/dashboard");
    // Paired to a different account while this was in flight: this response
    // belongs to the previous one. Discard it; a refresh is already owed.
    if (generation !== credentialGeneration) return false;
    const snapshot = snapshotOf(dashboard);
    saveSnapshot(snapshot);
    dashboardIsLive = true;
    application.behavior.showSnapshot(snapshot, null);
    return true;
  } catch (error) {
    if (generation !== credentialGeneration) return false;
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
  const generation = credentialGeneration;
  try {
    // Cached state is display-only: re-read the dashboard before deciding
    // between clock-in and clock-out so a stale task can never be replayed
    // into a mutation. The read also fails closed while offline.
    if (!dashboardIsLive) {
      application.behavior.setHint("Checking…");
      if (!(await refreshStatus())) return;
    }
    // Never send a mutation authorized with a new credential but decided from
    // the previously paired account's state.
    if (generation !== credentialGeneration) return;
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
    if (generation !== credentialGeneration) return;
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
    const nextBaseUrl = baseUrl ? baseUrl.replace(/\/$/, "") : apiBaseUrl;
    const identityChanged =
      nextBaseUrl !== apiBaseUrl || (token && token !== authToken);
    if (identityChanged) {
      // Either value can select a different account or deployment.
      credentialGeneration += 1;
      clearSnapshot();
      dashboardIsLive = false;
    }
    if (baseUrl) {
      apiBaseUrl = nextBaseUrl;
      localStorage.setItem("apiBaseUrl", apiBaseUrl);
    }
    if (token && token !== authToken) {
      authToken = token;
      localStorage.setItem("authToken", authToken);
    }
    requestRefresh();
  },
});

watch.addEventListener("connected", requestRefresh);

new Button({
  types: ["up", "select"],
  onPush(down, type) {
    if (!down) return;
    if (type === "up") runExclusive(refreshStatus);
    else if (type === "select") runExclusive(toggleClock);
  },
});
