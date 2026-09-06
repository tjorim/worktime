/**
 * Windows system tray icon for the .hday helper (#1291).
 *
 * Replaces the always-open console window with a status-colored tray icon
 * (green = share reachable, gray = starting up, red = share unreachable) and
 * a context menu for the actions that otherwise need a terminal window open:
 * open status, settings, logs, restart, quit.
 *
 * This is the one part of the helper with no CI coverage — there's no
 * Windows GUI runner to verify a real `Shell_NotifyIconW`/`WndProc` round
 * trip against, only whatever this file's own logic tests can check without
 * actually calling into `user32.dll`/`shell32.dll`. See the "Tray icon
 * (Windows) — manual QA" section in `hday-helper/README.md` before shipping
 * a change here.
 *
 * Design choices worth calling out (see also `win32/structs.ts`'s header):
 * - A blocking `GetMessageW` loop would freeze this process's single-threaded
 *   Bun event loop — meaning the HTTP server — for as long as no window
 *   message arrives, which for a tray icon that mostly sits idle could be
 *   indefinitely. Non-blocking `PeekMessageW`, drained on a `setInterval`,
 *   trades a little click-to-menu latency (bounded by `PUMP_INTERVAL_MS`)
 *   for a guarantee that the HTTP server never stalls behind the Win32
 *   message loop.
 * - The tray window is an ordinary hidden top-level window (no `WS_VISIBLE`,
 *   0x0, no parent) rather than a `HWND_MESSAGE`-parented message-only
 *   window — functionally equivalent for receiving the tray callback and
 *   menu commands, and avoids needing to pass the `HWND_MESSAGE` sentinel
 *   pointer value (-3) through FFI.
 * - Icons are pre-rendered PNGs (`hday-helper/assets/tray-icon-*.png`, see
 *   `scripts/generate-tray-icons.ts`) turned into `HICON`s at startup via
 *   `CreateIconFromResourceEx` with a raw PNG resource (supported since
 *   Vista, MSDN's `dwVersion = 0x00030000` case) — this needs neither a
 *   hand-rolled `.ico` container format nor writing the embedded asset out
 *   to a real temp file, since `CreateIconFromResourceEx` takes the image
 *   bytes directly.
 */

import { readFileSync } from "fs";
import { ptr } from "bun:ffi";
import okPngPath from "../assets/tray-icon-ok.png" with { type: "file" };
import startingPngPath from "../assets/tray-icon-starting.png" with { type: "file" };
import errorPngPath from "../assets/tray-icon-error.png" with { type: "file" };
import {
  ICON_RESOURCE_VERSION_PNG,
  LR_DEFAULTCOLOR,
  MF_SEPARATOR,
  MF_STRING,
  NIF_ICON,
  NIF_MESSAGE,
  NIF_TIP,
  NIM_ADD,
  NIM_DELETE,
  NIM_MODIFY,
  PM_REMOVE,
  SIZEOF_MSG,
  SW_HIDE,
  TPM_NONOTIFY,
  TPM_RETURNCMD,
  TPM_RIGHTBUTTON,
  WM_DESTROY,
  WM_LBUTTONUP,
  WM_NULL,
  WM_RBUTTONUP,
  WM_TRAYICON,
} from "./win32/constants";
import { loadWin32, type Win32 } from "./win32/ffi";
import { packNotifyIconData, packNotifyIconDataForDelete, packWndClassExW, toFixedUtf16LE } from "./win32/structs";

export type TrayStatus = "starting" | "ok" | "error";

export interface TrayCallbacks {
  getStatus: () => TrayStatus;
  getTooltip: () => string;
  onOpenStatus: () => void;
  onSettings: () => void;
  onLogs: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export interface TrayHandle {
  updateStatus(status: TrayStatus): void;
  destroy(): void;
}

const TRAY_ICON_ID = 1;
const WINDOW_CLASS_NAME = "WorktimeHdayHelperTrayWndClass";
const WINDOW_TITLE = "Worktime .hday Helper";
// How often the (non-blocking) Win32 message queue is drained. Bounds the
// worst-case latency between a tray click and the context menu appearing.
const PUMP_INTERVAL_MS = 50;
// How often `callbacks.getStatus()` is re-checked to decide the icon color.
const STATUS_POLL_INTERVAL_MS = 5_000;

const MENU_ID_OPEN_STATUS = 1;
const MENU_ID_SETTINGS = 2;
const MENU_ID_LOGS = 3;
const MENU_ID_RESTART = 4;
const MENU_ID_QUIT = 5;

/** Pure so it's testable without touching any Win32 API — see `tests/tray.test.ts`. */
export function menuCommandForId(
  id: number,
): "openStatus" | "settings" | "logs" | "restart" | "quit" | null {
  switch (id) {
    case MENU_ID_OPEN_STATUS:
      return "openStatus";
    case MENU_ID_SETTINGS:
      return "settings";
    case MENU_ID_LOGS:
      return "logs";
    case MENU_ID_RESTART:
      return "restart";
    case MENU_ID_QUIT:
      return "quit";
    default:
      return null;
  }
}

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

const STATUS_ICON_PATHS: Record<TrayStatus, string> = {
  ok: okPngPath,
  starting: startingPngPath,
  error: errorPngPath,
};

function loadStatusIcons(win32: Win32): Record<TrayStatus, number> {
  const icons = {} as Record<TrayStatus, number>;
  for (const status of Object.keys(STATUS_ICON_PATHS) as TrayStatus[]) {
    const pngBytes = readFileSync(STATUS_ICON_PATHS[status]);
    const hIcon = win32.user32.CreateIconFromResourceEx(
      pngBytes,
      pngBytes.length,
      1, // fIcon: TRUE
      ICON_RESOURCE_VERSION_PNG,
      16,
      16,
      LR_DEFAULTCOLOR,
    );
    if (!hIcon) throw new Error(`CreateIconFromResourceEx failed for status "${status}"`);
    icons[status] = hIcon;
  }
  return icons;
}

/**
 * Initializes the tray icon and its message loop. Returns `null` (after
 * logging why) rather than throwing on any failure — a tray that can't be
 * created must never take the HTTP server down with it.
 */
export function initTray(callbacks: TrayCallbacks): TrayHandle | null {
  if (!isTraySupported()) return null;

  // Everything created below is torn down here if any later step throws,
  // so a partial failure doesn't leak window classes/icons/windows.
  const cleanupSteps: Array<() => void> = [];
  const runCleanup = () => {
    for (const step of cleanupSteps.reverse()) {
      try {
        step();
      } catch {
        // best-effort; a failed cleanup step must not block the others
      }
    }
  };

  try {
    const win32 = loadWin32();

    const icons = loadStatusIcons(win32);
    cleanupSteps.push(() => {
      for (const hIcon of Object.values(icons)) win32.user32.DestroyIcon(hIcon);
    });

    const classNameBuf = toFixedUtf16LE(WINDOW_CLASS_NAME, WINDOW_CLASS_NAME.length + 1);
    const windowTitleBuf = toFixedUtf16LE(WINDOW_TITLE, WINDOW_TITLE.length + 1);
    const hInstance = win32.kernel32.GetModuleHandleW(null);

    let currentStatus: TrayStatus = "starting";
    let hwnd = 0;

    const wndProc = (hwndArg: number, msg: number, wParam: bigint, lParam: bigint): bigint => {
      if (msg === WM_TRAYICON) {
        const mouseMsg = Number(lParam);
        if (mouseMsg === WM_LBUTTONUP || mouseMsg === WM_RBUTTONUP) {
          showContextMenu();
        }
        return 0n;
      }
      if (msg === WM_DESTROY) {
        return 0n;
      }
      return win32.user32.DefWindowProcW(hwndArg, msg, wParam, lParam);
    };
    const wndProcCallback = win32.makeWndProcCallback(wndProc);
    cleanupSteps.push(() => wndProcCallback.close());

    const wndClassBuf = packWndClassExW({
      style: 0,
      wndProc: wndProcCallback.ptr!,
      hInstance,
      className: ptr(classNameBuf),
    });
    const atom = win32.user32.RegisterClassExW(ptr(wndClassBuf));
    if (!atom) throw new Error("RegisterClassExW failed");
    cleanupSteps.push(() => win32.user32.UnregisterClassW(ptr(classNameBuf), hInstance));

    hwnd = win32.user32.CreateWindowExW(
      0,
      ptr(classNameBuf),
      ptr(windowTitleBuf),
      0, // no WS_VISIBLE — this window is never shown
      0,
      0,
      0,
      0,
      null,
      null,
      hInstance,
      null,
    );
    if (!hwnd) throw new Error("CreateWindowExW failed");
    cleanupSteps.push(() => win32.user32.DestroyWindow(hwnd));

    function buildNotifyIconData(status: TrayStatus) {
      return packNotifyIconData({
        hwnd,
        id: TRAY_ICON_ID,
        flags: NIF_MESSAGE | NIF_ICON | NIF_TIP,
        callbackMessage: WM_TRAYICON,
        icon: icons[status],
        tip: callbacks.getTooltip(),
      });
    }

    const added = win32.shell32.Shell_NotifyIconW(NIM_ADD, ptr(buildNotifyIconData(currentStatus)));
    if (!added) throw new Error("Shell_NotifyIconW(NIM_ADD) failed");
    cleanupSteps.push(() => {
      win32.shell32.Shell_NotifyIconW(NIM_DELETE, ptr(packNotifyIconDataForDelete(hwnd, TRAY_ICON_ID)));
    });

    function showContextMenu(): void {
      const hMenu = win32.user32.CreatePopupMenu();
      if (!hMenu) return;
      // Kept alive for the duration of this function — AppendMenuW only
      // reads each label at call time, but nothing guarantees the buffer
      // survives past that call if it weren't referenced until we're done
      // using the menu.
      const labels = [
        toFixedUtf16LE("Open helper status", 64),
        toFixedUtf16LE("Settings", 64),
        toFixedUtf16LE("View logs", 64),
        toFixedUtf16LE("Restart", 64),
        toFixedUtf16LE("Quit", 64),
      ];
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_OPEN_STATUS, ptr(labels[0]!));
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_SETTINGS, ptr(labels[1]!));
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_LOGS, ptr(labels[2]!));
      win32.user32.AppendMenuW(hMenu, MF_SEPARATOR, 0, null);
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_RESTART, ptr(labels[3]!));
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_QUIT, ptr(labels[4]!));

      const pointBuf = new Uint8Array(8); // POINT { LONG x; LONG y; }
      win32.user32.GetCursorPos(ptr(pointBuf));
      const pointView = new DataView(pointBuf.buffer);
      const x = pointView.getInt32(0, true);
      const y = pointView.getInt32(4, true);

      // Standard MSDN pattern for a tray context menu: SetForegroundWindow
      // before TrackPopupMenu, then post a benign message afterwards —
      // without both, the menu can fail to close when the user clicks
      // elsewhere instead of choosing an item.
      win32.user32.SetForegroundWindow(hwnd);
      const cmd = win32.user32.TrackPopupMenu(
        hMenu,
        TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY,
        x,
        y,
        0,
        hwnd,
        null,
      );
      win32.user32.PostMessageW(hwnd, WM_NULL, 0n, 0n);
      win32.user32.DestroyMenu(hMenu);

      switch (menuCommandForId(cmd)) {
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
        case null:
          break; // menu dismissed without a selection
      }
    }

    const msgBuf = new Uint8Array(SIZEOF_MSG);
    const msgPtr = ptr(msgBuf);
    const pumpTimer = setInterval(() => {
      // Drain every currently-queued message per tick rather than one at a
      // time — a tray icon's queue is tiny, so this never runs long enough
      // to meaningfully delay the next HTTP request.
      while (win32.user32.PeekMessageW(msgPtr, null, 0, 0, PM_REMOVE)) {
        win32.user32.TranslateMessage(msgPtr);
        win32.user32.DispatchMessageW(msgPtr);
      }
    }, PUMP_INTERVAL_MS);
    cleanupSteps.push(() => clearInterval(pumpTimer));

    const statusTimer = setInterval(() => {
      updateStatus(callbacks.getStatus());
    }, STATUS_POLL_INTERVAL_MS);
    cleanupSteps.push(() => clearInterval(statusTimer));

    function updateStatus(status: TrayStatus): void {
      if (status === currentStatus) return;
      currentStatus = status;
      win32.shell32.Shell_NotifyIconW(NIM_MODIFY, ptr(buildNotifyIconData(status)));
    }

    let destroyed = false;
    return {
      updateStatus,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        runCleanup();
      },
    };
  } catch (err) {
    console.error("Failed to initialize the tray icon; continuing without it:", err);
    runCleanup();
    return null;
  }
}
