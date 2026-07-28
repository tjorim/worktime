// Worktime companion watch app: active-task glance and clock in/out.
// API calls use Alloy's watch-side fetch(), proxied through PebbleKit JS.
import {} from "piu/MC";
import Button from "pebble/button";
import Message from "pebble/message";

const DEFAULT_API_BASE_URL = "https://worktime.tjor.im";

function formatElapsed(totalSeconds) {
  const pad = (value) => (value < 10 ? `0${value}` : String(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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
      left: 4,
      right: 4,
      bottom: 12,
      height: 20,
      style: new Style({ font: "16px Gothic", color: "gray" }),
      string: "SELECT: clock in/out",
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
      refreshStatus();
    }

    showTask(task) {
      this.runningTask = task && !task.stop_time ? task : null;
      this.data.STATUS.string = this.runningTask
        ? this.runningTask.text || "Working"
        : "Not clocked in";
      if (!this.runningTask) {
        this.data.TIMER.string = "";
        this.lastTick = -1;
      }
    }

    showShift(dashboard) {
      const current = dashboard?.current_status?.current_shift;
      const next = dashboard?.next_shifts?.items?.[0];
      if (current?.shift) {
        this.data.SHIFT.string = `Today: ${current.shift.name || current.shift.code}`;
      } else if (next?.shift) {
        this.data.SHIFT.string = `Next: ${next.shift.name || next.shift.code} ${next.date}`;
      } else {
        this.data.SHIFT.string = "No shift configured";
      }
    }

    showShiftError() {
      this.data.SHIFT.string = "Shift unavailable";
    }

    showError(message) {
      this.runningTask = null;
      this.data.STATUS.string = message;
      this.data.TIMER.string = "";
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
let pending = false;

function authorizationHeaders() {
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
}

async function apiRequest(method, path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: authorizationHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Sign-in needed");
  }
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`Try again later (${response.status})`);
  }
  if (!response.ok) throw new Error(`Error ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function refreshStatus() {
  if (!authToken) {
    application.behavior.showError("Not configured");
    return;
  }
  if (!watch.connected.pebblekit) {
    application.behavior.showError("Phone offline");
    return;
  }
  try {
    const task = await apiRequest("GET", "/api/time-tracking/tasks/running");
    application.behavior.showTask(task);
  } catch (error) {
    application.behavior.showError(String(error.message || error));
  }
  try {
    const dashboard = await apiRequest("GET", "/api/read-models/dashboard");
    application.behavior.showShift(dashboard);
  } catch (error) {
    console.log(`Worktime shift refresh failed: ${error}`);
    application.behavior.showShiftError();
  }
}

async function toggleClock() {
  if (pending || !authToken) return;
  pending = true;
  const runningTask = application.behavior.runningTask;
  application.behavior.data.STATUS.string = runningTask
    ? "Clocking out…"
    : "Clocking in…";
  try {
    if (runningTask) {
      await apiRequest("PUT", `/api/time-tracking/tasks/${runningTask.id}`, {
        stop_time: new Date().toISOString(),
      });
    } else {
      await apiRequest("POST", "/api/time-tracking/tasks", {
        text: "Working",
        start_time: new Date().toISOString(),
      });
    }
    await refreshStatus();
  } catch (error) {
    application.behavior.showError(String(error.message || error));
  } finally {
    pending = false;
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
    if (token) {
      authToken = token;
      localStorage.setItem("authToken", authToken);
    }
    refreshStatus();
  },
});

watch.addEventListener("connected", refreshStatus);

new Button({
  types: ["up", "select"],
  onPush(down, type) {
    if (!down) return;
    if (type === "up") refreshStatus();
    else if (type === "select") toggleClock();
  },
});
