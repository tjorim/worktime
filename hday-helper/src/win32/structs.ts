/**
 * Byte-layout packing for the handful of Win32 structs `tray.ts` needs.
 *
 * Hand-rolled rather than using a generic struct DSL: there are only three
 * structs, each used in exactly one place, and an explicit byte-offset
 * comment next to each `set*` call is easier to audit against the Windows
 * SDK headers than a layer of struct-description metadata would be — this
 * code has no way to be verified by CI (no Windows GUI runner; see
 * `hday-helper/README.md`'s tray section), so auditability matters more than
 * avoiding a little repetition.
 *
 * All layouts below are the x64 (LLP64) ABI, since `bun-windows-x64` is the
 * only target this repo compiles the helper for. WCHAR is UTF-16LE, matching
 * the "W" (wide) variant of every Win32 API this codebase calls.
 */

import { SIZEOF_NOTIFYICONDATAW, SIZEOF_WNDCLASSEXW } from "./constants";

/** A Win32 pointer/handle value as returned by bun:ffi — always representable as a number for the addresses this process deals with, but widened to bigint here since that's what DataView's 64-bit setters require. */
export type Win32Pointer = number | bigint;

function toBigIntPtr(v: Win32Pointer | null | undefined): bigint {
  if (v === null || v === undefined) return 0n;
  return typeof v === "bigint" ? v : BigInt(v);
}

/** Encodes a JS string as UTF-16LE into a fixed-size, null-terminated buffer (in WCHAR units), truncating if necessary. Used for window-class names and the tray tooltip. */
export function toFixedUtf16LE(str: string, maxChars: number): Uint8Array {
  const buf = new Uint8Array(maxChars * 2);
  const truncated = str.slice(0, maxChars - 1); // leave room for the null terminator
  for (let i = 0; i < truncated.length; i++) {
    const code = truncated.charCodeAt(i);
    buf[i * 2] = code & 0xff;
    buf[i * 2 + 1] = (code >> 8) & 0xff;
  }
  // Remaining bytes are already zero (the null terminator, and padding).
  return buf;
}

export interface WndClassExWFields {
  style: number;
  /** Native function pointer from a `JSCallback`'s `.ptr`. */
  wndProc: Win32Pointer;
  hInstance: Win32Pointer;
  /** Pointer to a null-terminated UTF-16LE class name buffer that outlives `RegisterClassExW` — the caller keeps the source buffer alive, this just writes its address. */
  className: Win32Pointer;
}

/**
 * WNDCLASSEXW, x64 layout (winuser.h):
 * ```
 * UINT      cbSize;         //  0
 * UINT      style;          //  4
 * WNDPROC   lpfnWndProc;    //  8  (8-byte aligned; no padding needed here)
 * int       cbClsExtra;     // 16
 * int       cbWndExtra;     // 20
 * HINSTANCE hInstance;      // 24
 * HICON     hIcon;          // 32
 * HCURSOR   hCursor;        // 40
 * HBRUSH    hbrBackground;  // 48
 * LPCWSTR   lpszMenuName;   // 56
 * LPCWSTR   lpszClassName;  // 64
 * HICON     hIconSm;        // 72
 * ```                       // total 80
 */
export function packWndClassExW(fields: WndClassExWFields): Uint8Array {
  const buf = new Uint8Array(SIZEOF_WNDCLASSEXW);
  const view = new DataView(buf.buffer);
  view.setUint32(0, SIZEOF_WNDCLASSEXW, true); // cbSize
  view.setUint32(4, fields.style, true); // style
  view.setBigUint64(8, toBigIntPtr(fields.wndProc), true); // lpfnWndProc
  // cbClsExtra (16), cbWndExtra (20) left zero
  view.setBigUint64(24, toBigIntPtr(fields.hInstance), true); // hInstance
  // hIcon (32), hCursor (40), hbrBackground (48), lpszMenuName (56) left zero/null
  view.setBigUint64(64, toBigIntPtr(fields.className), true); // lpszClassName
  // hIconSm (72) left zero
  return buf;
}

export interface NotifyIconDataFields {
  hwnd: Win32Pointer;
  id: number;
  flags: number;
  callbackMessage: number;
  icon: Win32Pointer;
  tip: string;
}

/**
 * NOTIFYICONDATAW, "V1" layout — the fields present since Windows 2000, which
 * is all this tray needs (no balloon tips, no GUID identity). `cbSize` is set
 * to exactly this struct's size so the shell treats it as this version, not a
 * newer one with additional trailing fields we haven't populated:
 * ```
 * DWORD cbSize;             //   0
 * HWND  hWnd;               //   8  (8-byte aligned; 4 bytes padding at 4)
 * UINT  uID;                //  16
 * UINT  uFlags;             //  20
 * UINT  uCallbackMessage;   //  24
 * HICON hIcon;              //  32  (4 bytes padding at 28)
 * WCHAR szTip[64];          //  40
 * ```                       // total 168 (40 + 64*2)
 */
export function packNotifyIconData(fields: NotifyIconDataFields): Uint8Array {
  const buf = new Uint8Array(SIZEOF_NOTIFYICONDATAW);
  const view = new DataView(buf.buffer);
  view.setUint32(0, SIZEOF_NOTIFYICONDATAW, true); // cbSize
  view.setBigUint64(8, toBigIntPtr(fields.hwnd), true); // hWnd
  view.setUint32(16, fields.id, true); // uID
  view.setUint32(20, fields.flags, true); // uFlags
  view.setUint32(24, fields.callbackMessage, true); // uCallbackMessage
  view.setBigUint64(32, toBigIntPtr(fields.icon), true); // hIcon
  buf.set(toFixedUtf16LE(fields.tip, 64), 40); // szTip[64]
  return buf;
}

/** A NOTIFYICONDATAW with only the fields NIM_DELETE actually reads (hWnd/uID) — the rest of the struct can be left zeroed. */
export function packNotifyIconDataForDelete(hwnd: Win32Pointer, id: number): Uint8Array {
  const buf = new Uint8Array(SIZEOF_NOTIFYICONDATAW);
  const view = new DataView(buf.buffer);
  view.setUint32(0, SIZEOF_NOTIFYICONDATAW, true); // cbSize
  view.setBigUint64(8, toBigIntPtr(hwnd), true); // hWnd
  view.setUint32(16, id, true); // uID
  return buf;
}
