// GENERATED FILE — do not edit by hand.
// Regenerate with: bun run hday-helper/scripts/bundle-tray-worker.ts
// Source: hday-helper/src/tray-worker-entry.ts
// @bun
// hday-helper/src/tray-worker-entry.ts
import { ptr } from "bun:ffi";

// hday-helper/src/win32/constants.ts
var WM_NULL = 0;
var WM_DESTROY = 2;
var WM_LBUTTONUP = 514;
var WM_RBUTTONUP = 517;
var WM_TRAYICON = 32768 + 1;
var NIM_ADD = 0;
var NIM_MODIFY = 1;
var NIM_DELETE = 2;
var NIF_MESSAGE = 1;
var NIF_ICON = 2;
var NIF_TIP = 4;
var LR_DEFAULTCOLOR = 0;
var ICON_RESOURCE_VERSION_PNG = 196608;
var PM_REMOVE = 1;
var TPM_RIGHTBUTTON = 2;
var TPM_NONOTIFY = 128;
var TPM_RETURNCMD = 256;
var MF_STRING = 0;
var MF_SEPARATOR = 2048;
var SIZEOF_WNDCLASSEXW = 80;
var SIZEOF_NOTIFYICONDATAW = 168;
var SIZEOF_MSG = 48;

// hday-helper/src/win32/ffi.ts
import { dlopen, FFIType, JSCallback } from "bun:ffi";
var cached = null;
function loadWin32() {
  if (cached)
    return cached;
  const user32 = dlopen("user32.dll", {
    RegisterClassExW: { args: [FFIType.ptr], returns: FFIType.u16 },
    UnregisterClassW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    CreateWindowExW: {
      args: [
        FFIType.u32,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.u32,
        FFIType.i32,
        FFIType.i32,
        FFIType.i32,
        FFIType.i32,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr
      ],
      returns: FFIType.ptr
    },
    DestroyWindow: { args: [FFIType.ptr], returns: FFIType.i32 },
    DefWindowProcW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.u64], returns: FFIType.i64 },
    PeekMessageW: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32],
      returns: FFIType.i32
    },
    TranslateMessage: { args: [FFIType.ptr], returns: FFIType.i32 },
    DispatchMessageW: { args: [FFIType.ptr], returns: FFIType.i64 },
    PostMessageW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.u64], returns: FFIType.i32 },
    SetForegroundWindow: { args: [FFIType.ptr], returns: FFIType.i32 },
    GetCursorPos: { args: [FFIType.ptr], returns: FFIType.i32 },
    CreatePopupMenu: { args: [], returns: FFIType.ptr },
    DestroyMenu: { args: [FFIType.ptr], returns: FFIType.i32 },
    AppendMenuW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
    TrackPopupMenu: {
      args: [FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32
    },
    ShowWindow: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
    CreateIconFromResourceEx: {
      args: [FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
      returns: FFIType.ptr
    },
    DestroyIcon: { args: [FFIType.ptr], returns: FFIType.i32 }
  }).symbols;
  const shell32 = dlopen("shell32.dll", {
    Shell_NotifyIconW: { args: [FFIType.u32, FFIType.ptr], returns: FFIType.i32 }
  }).symbols;
  const kernel32 = dlopen("kernel32.dll", {
    GetModuleHandleW: { args: [FFIType.ptr], returns: FFIType.ptr },
    GetConsoleWindow: { args: [], returns: FFIType.ptr }
  }).symbols;
  cached = {
    user32,
    shell32,
    kernel32,
    makeWndProcCallback(fn) {
      return new JSCallback(fn, {
        args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.u64],
        returns: FFIType.i64
      });
    }
  };
  return cached;
}

// hday-helper/src/win32/structs.ts
function toBigIntPtr(v) {
  if (v === null || v === undefined)
    return 0n;
  return typeof v === "bigint" ? v : BigInt(v);
}
function toFixedUtf16LE(str, maxChars) {
  const buf = new Uint8Array(maxChars * 2);
  const truncated = str.slice(0, maxChars - 1);
  for (let i = 0;i < truncated.length; i++) {
    const code = truncated.charCodeAt(i);
    buf[i * 2] = code & 255;
    buf[i * 2 + 1] = code >> 8 & 255;
  }
  return buf;
}
function packWndClassExW(fields) {
  const buf = new Uint8Array(SIZEOF_WNDCLASSEXW);
  const view = new DataView(buf.buffer);
  view.setUint32(0, SIZEOF_WNDCLASSEXW, true);
  view.setUint32(4, fields.style, true);
  view.setBigUint64(8, toBigIntPtr(fields.wndProc), true);
  view.setBigUint64(24, toBigIntPtr(fields.hInstance), true);
  view.setBigUint64(64, toBigIntPtr(fields.className), true);
  return buf;
}
function packNotifyIconData(fields) {
  const buf = new Uint8Array(SIZEOF_NOTIFYICONDATAW);
  const view = new DataView(buf.buffer);
  view.setUint32(0, SIZEOF_NOTIFYICONDATAW, true);
  view.setBigUint64(8, toBigIntPtr(fields.hwnd), true);
  view.setUint32(16, fields.id, true);
  view.setUint32(20, fields.flags, true);
  view.setUint32(24, fields.callbackMessage, true);
  view.setBigUint64(32, toBigIntPtr(fields.icon), true);
  buf.set(toFixedUtf16LE(fields.tip, 64), 40);
  return buf;
}
function packNotifyIconDataForDelete(hwnd, id) {
  const buf = new Uint8Array(SIZEOF_NOTIFYICONDATAW);
  const view = new DataView(buf.buffer);
  view.setUint32(0, SIZEOF_NOTIFYICONDATAW, true);
  view.setBigUint64(8, toBigIntPtr(hwnd), true);
  view.setUint32(16, id, true);
  return buf;
}

// hday-helper/src/tray-worker-entry.ts
var TRAY_ICON_ID = 1;
var WINDOW_CLASS_NAME = "WorktimeHdayHelperTrayWndClass";
var WINDOW_TITLE = "Worktime .hday Helper";
var PUMP_INTERVAL_MS = 50;
var MENU_ID_OPEN_STATUS = 1;
var MENU_ID_SETTINGS = 2;
var MENU_ID_LOGS = 3;
var MENU_ID_RESTART = 4;
var MENU_ID_QUIT = 5;
function menuCommandForId(id) {
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
function loadStatusIcons(win32, icons) {
  const hIcons = {};
  for (const status of Object.keys(icons)) {
    const pngBytes = icons[status];
    const hIcon = win32.user32.CreateIconFromResourceEx(pngBytes, pngBytes.length, 1, ICON_RESOURCE_VERSION_PNG, 16, 16, LR_DEFAULTCOLOR);
    if (!hIcon)
      throw new Error(`CreateIconFromResourceEx failed for status "${status}"`);
    hIcons[status] = hIcon;
  }
  return hIcons;
}
var currentStatus = "starting";
var updateStatus = null;
var shutdown = null;
function handleInit(msg) {
  const cleanupSteps = [];
  const runCleanup = () => {
    for (const step of cleanupSteps.reverse()) {
      try {
        step();
      } catch {}
    }
  };
  try {
    let buildNotifyIconData = function(status) {
      return packNotifyIconData({
        hwnd,
        id: TRAY_ICON_ID,
        flags: NIF_MESSAGE | NIF_ICON | NIF_TIP,
        callbackMessage: WM_TRAYICON,
        icon: icons[status],
        tip: msg.tooltip
      });
    }, showContextMenu = function() {
      const hMenu = win32.user32.CreatePopupMenu();
      if (!hMenu)
        return;
      const labels = [
        toFixedUtf16LE("Open helper status", 64),
        toFixedUtf16LE("Settings", 64),
        toFixedUtf16LE("View logs", 64),
        toFixedUtf16LE("Restart", 64),
        toFixedUtf16LE("Quit", 64)
      ];
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_OPEN_STATUS, ptr(labels[0]));
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_SETTINGS, ptr(labels[1]));
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_LOGS, ptr(labels[2]));
      win32.user32.AppendMenuW(hMenu, MF_SEPARATOR, 0, null);
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_RESTART, ptr(labels[3]));
      win32.user32.AppendMenuW(hMenu, MF_STRING, MENU_ID_QUIT, ptr(labels[4]));
      const pointBuf = new Uint8Array(8);
      win32.user32.GetCursorPos(ptr(pointBuf));
      const pointView = new DataView(pointBuf.buffer);
      const x = pointView.getInt32(0, true);
      const y = pointView.getInt32(4, true);
      win32.user32.SetForegroundWindow(hwnd);
      const cmd = win32.user32.TrackPopupMenu(hMenu, TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY, x, y, 0, hwnd, null);
      win32.user32.PostMessageW(hwnd, WM_NULL, 0n, 0n);
      win32.user32.DestroyMenu(hMenu);
      const command = menuCommandForId(cmd);
      if (command)
        postMessage({ type: "command", command });
    };
    const win32 = loadWin32();
    const icons = loadStatusIcons(win32, msg.icons);
    cleanupSteps.push(() => {
      for (const hIcon of Object.values(icons))
        win32.user32.DestroyIcon(hIcon);
    });
    const classNameBuf = toFixedUtf16LE(WINDOW_CLASS_NAME, WINDOW_CLASS_NAME.length + 1);
    const windowTitleBuf = toFixedUtf16LE(WINDOW_TITLE, WINDOW_TITLE.length + 1);
    const hInstance = win32.kernel32.GetModuleHandleW(null);
    let hwnd = 0;
    const wndProc = (hwndArg, wmsg, wParam, lParam) => {
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
      wndProc: wndProcCallback.ptr,
      hInstance,
      className: ptr(classNameBuf)
    });
    const atom = win32.user32.RegisterClassExW(ptr(wndClassBuf));
    if (!atom)
      throw new Error("RegisterClassExW failed");
    cleanupSteps.push(() => win32.user32.UnregisterClassW(ptr(classNameBuf), hInstance));
    hwnd = win32.user32.CreateWindowExW(0, ptr(classNameBuf), ptr(windowTitleBuf), 0, 0, 0, 0, 0, null, null, hInstance, null);
    if (!hwnd)
      throw new Error("CreateWindowExW failed");
    cleanupSteps.push(() => win32.user32.DestroyWindow(hwnd));
    const added = win32.shell32.Shell_NotifyIconW(NIM_ADD, ptr(buildNotifyIconData(currentStatus)));
    if (!added)
      throw new Error("Shell_NotifyIconW(NIM_ADD) failed");
    cleanupSteps.push(() => {
      win32.shell32.Shell_NotifyIconW(NIM_DELETE, ptr(packNotifyIconDataForDelete(hwnd, TRAY_ICON_ID)));
    });
    const msgBuf = new Uint8Array(SIZEOF_MSG);
    const msgPtr = ptr(msgBuf);
    const pumpTimer = setInterval(() => {
      while (win32.user32.PeekMessageW(msgPtr, null, 0, 0, PM_REMOVE)) {
        win32.user32.TranslateMessage(msgPtr);
        win32.user32.DispatchMessageW(msgPtr);
      }
    }, PUMP_INTERVAL_MS);
    cleanupSteps.push(() => clearInterval(pumpTimer));
    updateStatus = (status) => {
      if (status === currentStatus)
        return;
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
self.onmessage = (event) => {
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
export {
  menuCommandForId
};
