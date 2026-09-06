/**
 * Tests for the platform-independent pieces of `tray.ts` — everything that
 * doesn't touch `user32.dll`/`shell32.dll` and so can actually run in CI
 * (which has no Windows GUI runner; see `hday-helper/README.md`'s tray
 * section). `startTray()`'s actual Win32 work happens in a separate Worker
 * (`tray-worker-entry.ts`, tested in `tray-worker-entry.test.ts`) — here it's
 * exercised only via `isTraySupported()` returning false on this
 * (non-Windows) platform, which makes it resolve to `null` without ever
 * spawning that worker.
 */

import { describe, expect, test } from "bun:test";
import { hideConsoleWindow, isTraySupported, startTray } from "../src/tray";

describe("isTraySupported", () => {
  test("is false on this (non-Windows) platform regardless of the escape hatch", () => {
    // This suite only ever runs on Linux/macOS CI, so process.platform is
    // never "win32" here — this just documents the guard exists and is the
    // reason startTray()/hideConsoleWindow() are safe to call unconditionally
    // below without ever touching bun:ffi's dlopen or spawning a Worker.
    expect(process.platform).not.toBe("win32");
    expect(isTraySupported()).toBe(false);
  });
});

describe("startTray / hideConsoleWindow on a non-Windows platform", () => {
  test("startTray resolves to null without throwing or spawning a worker", async () => {
    await expect(
      startTray("tooltip", {
        onOpenStatus: () => {},
        onSettings: () => {},
        onLogs: () => {},
        onRestart: () => {},
        onQuit: () => {},
      }),
    ).resolves.toBeNull();
  });

  test("hideConsoleWindow is a no-op", () => {
    expect(() => hideConsoleWindow()).not.toThrow();
  });
});
