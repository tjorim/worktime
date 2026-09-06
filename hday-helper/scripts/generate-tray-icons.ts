/**
 * Regenerates the tinted tray-icon PNGs under `hday-helper/assets/` from the
 * Worktime logo. Run manually after the source logo changes:
 *
 *   bun run hday-helper/scripts/generate-tray-icons.ts
 *
 * `frontend/public/assets/icons/icon-16.png` is a generated asset itself (per
 * AGENTS.md, not hand-edited) but is fine as a *source* to derive these from.
 * 16px is the only size tray.ts needs — it's a system tray icon, not
 * anything shown at taskbar/Alt+Tab size — so `icon-32.png` isn't used here.
 *
 * These are committed, not generated at compile time: `bun build --compile`
 * has no way to run an arbitrary build step, only to embed static imports.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { decodePng, encodePng, tintPixels, type RgbColor } from "../src/win32/png";

const SOURCE_ICON = join(import.meta.dir, "..", "..", "frontend", "public", "assets", "icons", "icon-16.png");
const OUTPUT_DIR = join(import.meta.dir, "..", "assets");

// Matches the status colors tray.ts maps from share-reachability (see
// `hday-helper/src/tray.ts`'s `TrayStatus` type): ok/starting/error.
const TINTS: Record<string, RgbColor> = {
  ok: { r: 46, g: 160, b: 67 }, // green — share reachable
  starting: { r: 130, g: 130, b: 130 }, // gray — starting up
  error: { r: 209, g: 36, b: 47 }, // red — share unreachable / error
};

async function main(): Promise<void> {
  const sourceBytes = new Uint8Array(await Bun.file(SOURCE_ICON).arrayBuffer());
  const decoded = decodePng(sourceBytes);

  for (const [status, tint] of Object.entries(TINTS)) {
    const tinted = tintPixels(decoded.pixels, tint);
    const png = encodePng(decoded.width, decoded.height, tinted);
    const outPath = join(OUTPUT_DIR, `tray-icon-${status}.png`);
    writeFileSync(outPath, png);
    console.log(`Wrote ${outPath} (${png.length} bytes)`);
  }
}

await main();
