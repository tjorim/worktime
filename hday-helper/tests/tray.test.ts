/**
 * Tests for the platform-independent pieces of `tray.ts` — everything that
 * doesn't touch `user32.dll`/`shell32.dll` and so can actually run in CI
 * (which has no Windows GUI runner; see `hday-helper/README.md`'s tray
 * section). `initTray()` itself is exercised only indirectly, via
 * `isTraySupported()` returning false on this (non-Windows) platform.
 */

import { describe, expect, test } from "bun:test";
import { hideConsoleWindow, initTray, isTraySupported, menuCommandForId } from "../src/tray";

describe("menuCommandForId", () => {
  test("maps each known menu id to its command", () => {
    expect(menuCommandForId(1)).toBe("openStatus");
    expect(menuCommandForId(2)).toBe("settings");
    expect(menuCommandForId(3)).toBe("logs");
    expect(menuCommandForId(4)).toBe("restart");
    expect(menuCommandForId(5)).toBe("quit");
  });

  test("returns null for an unknown or cancelled (0) id", () => {
    expect(menuCommandForId(0)).toBeNull();
    expect(menuCommandForId(999)).toBeNull();
  });
});

describe("isTraySupported", () => {
  test("is false on this (non-Windows) platform regardless of the escape hatch", () => {
    // This suite only ever runs on Linux/macOS CI, so process.platform is
    // never "win32" here — this just documents the guard exists and is the
    // reason initTray()/hideConsoleWindow() are safe to call unconditionally
    // below without ever touching bun:ffi's dlopen.
    expect(process.platform).not.toBe("win32");
    expect(isTraySupported()).toBe(false);
  });
});

describe("initTray / hideConsoleWindow on a non-Windows platform", () => {
  test("initTray returns null without throwing", () => {
    expect(
      initTray({
        getStatus: () => "ok",
        getTooltip: () => "tooltip",
        onOpenStatus: () => {},
        onSettings: () => {},
        onLogs: () => {},
        onRestart: () => {},
        onQuit: () => {},
      }),
    ).toBeNull();
  });

  test("hideConsoleWindow is a no-op", () => {
    expect(() => hideConsoleWindow()).not.toThrow();
  });
});
