/**
 * Byte-layout tests for the Win32 structs `tray.ts` packs by hand (see
 * `src/win32/structs.ts`'s header for why they're hand-rolled). These can't
 * verify the layouts are correct against real `user32.dll`/`shell32.dll`
 * (no Windows GUI runner in CI — see `hday-helper/README.md`'s tray
 * section), but they do pin down that the packing code actually produces
 * the byte offsets its own doc comments claim, catching a transcription bug
 * even though they can't catch a wrong-per-MSDN offset.
 */

import { describe, expect, test } from "bun:test";
import {
  SIZEOF_NOTIFYICONDATAW,
  SIZEOF_WNDCLASSEXW,
} from "../src/win32/constants";
import {
  packNotifyIconData,
  packNotifyIconDataForDelete,
  packWndClassExW,
  toFixedUtf16LE,
} from "../src/win32/structs";

describe("toFixedUtf16LE", () => {
  test("encodes ASCII as UTF-16LE with a null terminator", () => {
    const buf = toFixedUtf16LE("AB", 4);
    expect(buf.length).toBe(8);
    expect(Array.from(buf)).toEqual([0x41, 0x00, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00]);
  });

  test("truncates strings longer than maxChars - 1, always leaving room for the null terminator", () => {
    const buf = toFixedUtf16LE("ABCDE", 4);
    expect(buf.length).toBe(8);
    // Only "ABC" fits (3 chars) + null terminator, in a 4-WCHAR buffer.
    expect(Array.from(buf)).toEqual([0x41, 0x00, 0x42, 0x00, 0x43, 0x00, 0x00, 0x00]);
  });

  test("empty string is all zero bytes", () => {
    const buf = toFixedUtf16LE("", 3);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("packWndClassExW", () => {
  test("writes cbSize, style, lpfnWndProc, hInstance, and lpszClassName at their documented offsets", () => {
    const buf = packWndClassExW({
      style: 0x1234,
      wndProc: 0xdeadbeefn,
      hInstance: 0x1000,
      className: 0x2000,
    });
    expect(buf.length).toBe(SIZEOF_WNDCLASSEXW);

    const view = new DataView(buf.buffer);
    expect(view.getUint32(0, true)).toBe(SIZEOF_WNDCLASSEXW); // cbSize
    expect(view.getUint32(4, true)).toBe(0x1234); // style
    expect(view.getBigUint64(8, true)).toBe(0xdeadbeefn); // lpfnWndProc
    expect(view.getBigUint64(24, true)).toBe(0x1000n); // hInstance
    expect(view.getBigUint64(64, true)).toBe(0x2000n); // lpszClassName

    // Fields this tray never sets (hIcon, hCursor, hbrBackground,
    // lpszMenuName, hIconSm) must stay null, not garbage.
    expect(view.getBigUint64(32, true)).toBe(0n);
    expect(view.getBigUint64(40, true)).toBe(0n);
    expect(view.getBigUint64(48, true)).toBe(0n);
    expect(view.getBigUint64(56, true)).toBe(0n);
    expect(view.getBigUint64(72, true)).toBe(0n);
  });

  test("accepts a plain number for pointer fields, not just bigint", () => {
    const buf = packWndClassExW({ style: 0, wndProc: 42, hInstance: 43, className: 44 });
    const view = new DataView(buf.buffer);
    expect(view.getBigUint64(8, true)).toBe(42n);
    expect(view.getBigUint64(24, true)).toBe(43n);
    expect(view.getBigUint64(64, true)).toBe(44n);
  });
});

describe("packNotifyIconData", () => {
  test("writes every field at its documented offset", () => {
    const buf = packNotifyIconData({
      hwnd: 0xaaaan,
      id: 7,
      flags: 0b111,
      callbackMessage: 0x8001,
      icon: 0xbbbbn,
      tip: "hi",
    });
    expect(buf.length).toBe(SIZEOF_NOTIFYICONDATAW);

    const view = new DataView(buf.buffer);
    expect(view.getUint32(0, true)).toBe(SIZEOF_NOTIFYICONDATAW); // cbSize
    expect(view.getBigUint64(8, true)).toBe(0xaaaan); // hWnd
    expect(view.getUint32(16, true)).toBe(7); // uID
    expect(view.getUint32(20, true)).toBe(0b111); // uFlags
    expect(view.getUint32(24, true)).toBe(0x8001); // uCallbackMessage
    expect(view.getBigUint64(32, true)).toBe(0xbbbbn); // hIcon
    // szTip[64] starting at offset 40: "hi" + null terminator
    expect(Array.from(buf.subarray(40, 46))).toEqual([0x68, 0x00, 0x69, 0x00, 0x00, 0x00]);
  });

  test("tip longer than 63 chars is truncated to fit szTip[64]", () => {
    const longTip = "x".repeat(100);
    const buf = packNotifyIconData({
      hwnd: 1,
      id: 1,
      flags: 0,
      callbackMessage: 0,
      icon: 0,
      tip: longTip,
    });
    // szTip occupies bytes 40..167 (64 WCHARs); the last one must stay the
    // null terminator regardless of how long the input was.
    expect(buf[166]).toBe(0);
    expect(buf[167]).toBe(0);
  });
});

describe("packNotifyIconDataForDelete", () => {
  test("sets only cbSize, hWnd, and uID — the fields NIM_DELETE reads", () => {
    const buf = packNotifyIconDataForDelete(0x1234n, 9);
    expect(buf.length).toBe(SIZEOF_NOTIFYICONDATAW);

    const view = new DataView(buf.buffer);
    expect(view.getUint32(0, true)).toBe(SIZEOF_NOTIFYICONDATAW);
    expect(view.getBigUint64(8, true)).toBe(0x1234n);
    expect(view.getUint32(16, true)).toBe(9);
    // Everything past uID should be zero.
    expect(view.getUint32(20, true)).toBe(0);
    expect(view.getBigUint64(32, true)).toBe(0n);
  });
});
