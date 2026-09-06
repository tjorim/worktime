/**
 * `bun:ffi` bindings for the Win32 APIs `tray.ts` needs.
 *
 * `dlopen` only happens inside `loadWin32()`, never at module load — importing
 * this file (e.g. transitively, from `main.ts`) must stay safe on every
 * platform, including in `bun test` on Linux CI, where `user32.dll` etc.
 * don't exist. Only call `loadWin32()` after checking `process.platform ===
 * "win32"`.
 */

import { dlopen, FFIType, JSCallback } from "bun:ffi";

export type WndProcFn = (hwnd: number, msg: number, wParam: bigint, lParam: bigint) => bigint;

let cached: Win32 | null = null;

export function loadWin32() {
  if (cached) return cached;

  const user32 = dlopen("user32.dll", {
    RegisterClassExW: { args: [FFIType.ptr], returns: FFIType.u16 },
    UnregisterClassW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    CreateWindowExW: {
      args: [
        FFIType.u32, // dwExStyle
        FFIType.ptr, // lpClassName
        FFIType.ptr, // lpWindowName
        FFIType.u32, // dwStyle
        FFIType.i32, // x
        FFIType.i32, // y
        FFIType.i32, // nWidth
        FFIType.i32, // nHeight
        FFIType.ptr, // hWndParent
        FFIType.ptr, // hMenu
        FFIType.ptr, // hInstance
        FFIType.ptr, // lpParam
      ],
      returns: FFIType.ptr,
    },
    DestroyWindow: { args: [FFIType.ptr], returns: FFIType.i32 },
    DefWindowProcW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.u64], returns: FFIType.i64 },
    PeekMessageW: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.u32],
      returns: FFIType.i32,
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
      returns: FFIType.i32,
    },
    ShowWindow: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
    CreateIconFromResourceEx: {
      args: [FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
      returns: FFIType.ptr,
    },
    DestroyIcon: { args: [FFIType.ptr], returns: FFIType.i32 },
  }).symbols;

  const shell32 = dlopen("shell32.dll", {
    Shell_NotifyIconW: { args: [FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
  }).symbols;

  const kernel32 = dlopen("kernel32.dll", {
    GetModuleHandleW: { args: [FFIType.ptr], returns: FFIType.ptr },
    GetConsoleWindow: { args: [], returns: FFIType.ptr },
  }).symbols;

  cached = {
    user32,
    shell32,
    kernel32,
    makeWndProcCallback(fn: WndProcFn): JSCallback {
      return new JSCallback(fn, {
        args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.u64],
        returns: FFIType.i64,
      });
    },
  };
  return cached;
}

export type Win32 = ReturnType<typeof loadWin32>;
