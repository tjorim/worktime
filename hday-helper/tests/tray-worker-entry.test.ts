/**
 * Tests for the platform-independent pieces of `tray-worker-entry.ts` — the
 * Win32 tray worker's source (bundled to `tray-worker.generated.js`, see
 * that file's header for why). Everything else in that module touches
 * `user32.dll`/`shell32.dll` directly and can't run outside a Windows GUI
 * session — see `hday-helper/README.md`'s tray section.
 */

import { describe, expect, test } from "bun:test";
import { menuCommandForId } from "../src/tray-worker-entry";

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
