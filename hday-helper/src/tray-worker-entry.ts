/**
 * Windows tray worker (#1291) — runs in its own Worker thread, separate from
 * the main thread that serves HTTP requests.
 *
 * Bundled to a single plain-JS file at build time
 * (hday-helper/src/tray-worker.generated.js, committed — regenerate with the
 * command in that file's header comment) and loaded via `new Worker(path)`
 * from tray.ts. The split exists because of a real bug found in review:
 * Shell_NotifyIcon's context menu (`TrackPopupMenu`) blocks synchronously
 * until the user picks an item or dismisses it — a genuine Win32 property,
 * not something the non-blocking `PeekMessageW` pump avoids. Running the
 * whole Win32 window/message-pump/menu subsystem on the SAME thread that
 * serves HTTP would freeze request handling for as long as the tray menu
 * stayed open. Isolating it onto its own OS thread means that blocking call
 * only blocks itself — the HTTP server's thread is untouched.
 *
 * bun:ffi's JSCallback needs a plain-JS host, not a bundler-embedded TS
 * module: `new Worker(path)` inside a `bun build --compile` standalone
 * executable does not run the TypeScript transpiler on a dynamically loaded
 * worker file the way normal static imports do (verified directly: loading
 * a raw `.ts` worker entry from an embedded `with {type:"file"}` path throws
 * a SyntaxError on ordinary TS syntax at runtime, inside a compiled binary).
 * Pre-bundling this file to plain JS at build time sidesteps that — the
 * *source* here is still normal, type-checked TypeScript reusing
 * win32/constants.ts, win32/ffi.ts, and win32/structs.ts exactly like the
 * rest of the codebase; only the build output is special-cased.
 *
 * Protocol with the main thread (tray.ts's startTray()):
 * ```
 * -> {type: "init", icons: {ok, starting, error}: Uint8Array bytes, tooltip: string}
 * <- {type: "ready"} | {type: "initFailed", reason: string}
 * -> {type: "status", status: "starting" | "ok" | "error"}
 * <- {type: "command", command: "openStatus" | "settings" | "logs" | "restart" | "quit"}
 * -> {type: "shutdown"}
 * <- {type: "shutdownComplete"}
 * ```
 */

import { ptr } from "bun:ffi";
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

type TrayStatus = "starting" | "ok" | "error";

const TRAY_ICON_ID = 1;
const WINDOW_CLASS_NAME = "WorktimeHdayHelperTrayWndClass";
const WINDOW_TITLE = "Worktime .hday Helper";
// How often the (non-blocking) Win32 message queue is drained. Bounds the
// worst-case latency between a tray click and the context menu appearing.
const PUMP_INTERVAL_MS = 50;

const MENU_ID_OPEN_STATUS = 1;
const MENU_ID_SETTINGS = 2;
const MENU_ID_LOGS = 3;
const MENU_ID_RESTART = 4;
const MENU_ID_QUIT = 5;

/** Pure so it's testable without touching any Win32 API — see `tests/tray-worker-entry.test.ts`. */
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

interface InitMessage {
  type: "init";
  icons: Record<TrayStatus, Uint8Array>;
  tooltip: string;
}

interface StatusMessage {
  type: "status";
  status: TrayStatus;
}

interface ShutdownMessage {
  type: "shutdown";
}

type IncomingMessage = InitMessage | StatusMessage | ShutdownMessage;

function loadStatusIcons(win32: Win32, icons: Record<TrayStatus, Uint8Array>): Record<TrayStatus, number> {
  const hIcons = {} as Record<TrayStatus, number>;
  for (const status of Object.keys(icons) as TrayStatus[]) {
    const pngBytes = icons[status];
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
    hIcons[status] = hIcon;
  }
  return hIcons;
}

let currentStatus: TrayStatus = "starting";
let updateStatus: ((status: TrayStatus) => void) | null = null;
let shutdown: (() => void) | null = null;

function handleInit(msg: InitMessage): void {
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

    const icons = loadStatusIcons(win32, msg.icons);
    cleanupSteps.push(() => {
      for (const hIcon of Object.values(icons)) win32.user32.DestroyIcon(hIcon);
    });

    const classNameBuf = toFixedUtf16LE(WINDOW_CLASS_NAME, WINDOW_CLASS_NAME.length + 1);
    const windowTitleBuf = toFixedUtf16LE(WINDOW_TITLE, WINDOW_TITLE.length + 1);
    const hInstance = win32.kernel32.GetModuleHandleW(null);

    let hwnd = 0;

    const wndProc = (hwndArg: number, wmsg: number, wParam: bigint, lParam: bigint): bigint => {
      if (wmsg === WM_TRAYICON) {
        const mouseMsg = Number(lParam);
        if (mouseMsg === WM_LBUTTONUP || mouseMsg === WM_RBUTTONUP) {
          showContextMenu();
        }
        return 0n;
      }
      if (wmsg === WM_DESTROY) {
        return 0n;
      }
      return win32.user32.DefWindowProcW(hwndArg, wmsg, wParam, lParam);
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
        tip: msg.tooltip,
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
      // Blocks this worker thread until the menu closes (MSDN: TrackPopupMenu
      // runs its own internal message loop) — the entire reason this file is
      // a separate Worker instead of running on the HTTP server's thread.
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

      const command = menuCommandForId(cmd);
      if (command) postMessage({ type: "command", command });
    }

    const msgBuf = new Uint8Array(SIZEOF_MSG);
    const msgPtr = ptr(msgBuf);
    const pumpTimer = setInterval(() => {
      // Drain every currently-queued message per tick rather than one at a
      // time — a tray icon's queue is tiny, so this never runs long enough
      // to meaningfully delay the next tick (the *menu itself*, not this
      // pump, is what can run long — see showContextMenu()).
      while (win32.user32.PeekMessageW(msgPtr, null, 0, 0, PM_REMOVE)) {
        win32.user32.TranslateMessage(msgPtr);
        win32.user32.DispatchMessageW(msgPtr);
      }
    }, PUMP_INTERVAL_MS);
    cleanupSteps.push(() => clearInterval(pumpTimer));

    updateStatus = (status: TrayStatus): void => {
      if (status === currentStatus) return;
      currentStatus = status;
      win32.shell32.Shell_NotifyIconW(NIM_MODIFY, ptr(buildNotifyIconData(status)));
    };

    shutdown = () => {
      runCleanup();
      postMessage({ type: "shutdownComplete" });
    };

    postMessage({ type: "ready" });
  } catch (err) {
    runCleanup();
    postMessage({ type: "initFailed", reason: err instanceof Error ? err.message : String(err) });
  }
}

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init":
      handleInit(msg);
      break;
    case "status":
      updateStatus?.(msg.status);
      break;
    case "shutdown":
      shutdown?.();
      break;
  }
};
