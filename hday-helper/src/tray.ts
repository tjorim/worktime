/**
 * Windows system tray icon for the .hday helper (#1291) — main-thread side.
 *
 * Replaces the always-open console window with a status-colored tray icon
 * (green = share reachable, gray = starting up, red = share unreachable) and
 * a context menu (open status, settings, logs, restart, quit) for actions
 * that previously needed a terminal window open.
 *
 * The actual Win32 window/message-pump/menu logic runs in a separate Worker
 * thread (`tray-worker-entry.ts`, bundled to `tray-worker.generated.js`),
 * not here and not on the thread `main.ts` serves HTTP requests from —
 * `Shell_NotifyIcon`'s context menu (`TrackPopupMenu`) blocks synchronously
 * until the user picks an item or dismisses it, and running that on the
 * HTTP server's own thread would freeze request handling for as long as the
 * tray menu stayed open. See `tray-worker-entry.ts`'s header for the full
 * rationale and the message protocol `startTray()` speaks below.
 *
 * This is the one part of the helper with no CI coverage — there's no
 * Windows GUI runner to verify a real `Shell_NotifyIconW`/`WndProc` round
 * trip against, only whatever this file's own logic tests can check without
 * actually calling into `user32.dll`/`shell32.dll`. See the "Tray icon
 * (Windows) — manual QA" section in `hday-helper/README.md` before shipping
 * a change here.
 */

import { readFileSync } from "fs";
import okPngPath from "../assets/tray-icon-ok.png" with { type: "file" };
import startingPngPath from "../assets/tray-icon-starting.png" with { type: "file" };
import errorPngPath from "../assets/tray-icon-error.png" with { type: "file" };
import trayWorkerBundlePath from "./tray-worker.generated.js" with { type: "file" };
import { loadWin32 } from "./win32/ffi";
import { SW_HIDE } from "./win32/constants";

export type TrayStatus = "starting" | "ok" | "error";

export interface TrayCallbacks {
  onOpenStatus: () => void;
  onSettings: () => void;
  onLogs: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export interface TrayHandle {
  updateStatus(status: TrayStatus): void;
  /** Asks the tray worker to remove the icon and clean up before resolving — bounded by a short grace period so a wedged worker can never hang process shutdown. */
  destroy(): Promise<void>;
}

// How long to wait for the worker to report ready/failed before giving up
// and continuing without a tray icon at all (never hangs startup).
const STARTUP_TIMEOUT_MS = 10_000;
// How long destroy() waits for the worker's cleanup to finish before just
// terminating it — this runs during process shutdown, so it must be short.
const SHUTDOWN_GRACE_MS = 1_000;

/**
 * Whether the tray (and the console-hiding that goes with it) should be
 * attempted at all: Windows only, and only when `HDAY_HELPER_NO_TRAY` isn't
 * set. That escape hatch keeps "run it in a plain terminal" working for
 * anyone who doesn't want the tray — the console-hiding half of this feature
 * would otherwise leave no way to see the process's console output at all.
 */
export function isTraySupported(): boolean {
  return process.platform === "win32" && process.env.HDAY_HELPER_NO_TRAY !== "1";
}

/** Opens a URL in the user's default browser. Windows-only, like everything else in this file. */
export function openUrlInBrowser(url: string): void {
  try {
    // The empty "" argument is `start`'s window-title parameter — required
    // whenever the URL itself might be quoted/contain spaces, otherwise
    // `start` can misinterpret the first quoted argument as the title.
    Bun.spawn(["cmd.exe", "/c", "start", "", url], { stdio: ["ignore", "ignore", "ignore"] }).unref();
  } catch (err) {
    console.error(`Failed to open ${url} in the default browser:`, err);
  }
}

/** Hides this process's console window, if it has one. No-op (and safe to call) when the tray itself isn't supported/enabled. */
export function hideConsoleWindow(): void {
  if (!isTraySupported()) return;
  try {
    const win32 = loadWin32();
    const hwnd = win32.kernel32.GetConsoleWindow();
    if (hwnd) win32.user32.ShowWindow(hwnd, SW_HIDE);
  } catch (err) {
    console.error("Failed to hide the console window:", err);
  }
}

interface WorkerOutgoingMessage {
  type: "ready" | "initFailed" | "command" | "shutdownComplete";
  reason?: string;
  command?: "openStatus" | "settings" | "logs" | "restart" | "quit";
}

/**
 * Starts the tray worker and waits for it to report ready or failed. Returns
 * `null` (after logging why) on any failure — a tray that can't be created
 * must never take the HTTP server down with it, and the caller should NOT
 * hide the console in that case (there'd be no tray to fall back on either).
 */
export async function startTray(tooltip: string, callbacks: TrayCallbacks): Promise<TrayHandle | null> {
  if (!isTraySupported()) return null;

  let icons: Record<TrayStatus, Uint8Array>;
  try {
    icons = {
      ok: readFileSync(okPngPath),
      starting: readFileSync(startingPngPath),
      error: readFileSync(errorPngPath),
    };
  } catch (err) {
    console.error("Failed to read tray icon assets; continuing without a tray icon:", err);
    return null;
  }

  let worker: Worker;
  try {
    worker = new Worker(trayWorkerBundlePath);
  } catch (err) {
    console.error("Failed to start the tray worker; continuing without a tray icon:", err);
    return null;
  }

  return new Promise<TrayHandle | null>((resolve) => {
    let settled = false;

    const failStartup = (reason: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      console.error("Tray initialization failed; continuing without a tray icon:", reason);
      worker.terminate();
      resolve(null);
    };

    const timeout = setTimeout(() => failStartup("worker did not respond within timeout"), STARTUP_TIMEOUT_MS);

    worker.onerror = (err) => failStartup(err.message ?? err);

    worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
      const msg = event.data;
      if (!settled) {
        if (msg.type === "ready") {
          settled = true;
          clearTimeout(timeout);
          resolve(makeHandle(worker));
        } else if (msg.type === "initFailed") {
          failStartup(msg.reason);
        }
        return;
      }
      if (msg.type === "command" && msg.command) {
        switch (msg.command) {
          case "openStatus":
            callbacks.onOpenStatus();
            break;
          case "settings":
            callbacks.onSettings();
            break;
          case "logs":
            callbacks.onLogs();
            break;
          case "restart":
            callbacks.onRestart();
            break;
          case "quit":
            callbacks.onQuit();
            break;
        }
      }
    };

    worker.postMessage({ type: "init", icons, tooltip });
  });
}

function makeHandle(worker: Worker): TrayHandle {
  let destroyed = false;
  return {
    updateStatus(status: TrayStatus) {
      worker.postMessage({ type: "status", status });
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const graceTimer = setTimeout(finish, SHUTDOWN_GRACE_MS);
        worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
          if (event.data?.type === "shutdownComplete") {
            clearTimeout(graceTimer);
            finish();
          }
        };
        worker.onerror = () => {
          clearTimeout(graceTimer);
          finish();
        };
        worker.postMessage({ type: "shutdown" });
      });
      worker.terminate();
    },
  };
}
