/**
 * Regenerates hday-helper/src/tray-worker.generated.js from
 * tray-worker-entry.ts. Run manually after editing that file or any of
 * win32/{constants,ffi,structs}.ts:
 *
 *   bun run hday-helper/scripts/bundle-tray-worker.ts
 *
 * Why this is a committed, pre-built artifact rather than something built on
 * the fly: `new Worker(path)` inside a `bun build --compile` standalone
 * executable does not run the TypeScript transpiler on a dynamically loaded
 * worker file — see tray-worker-entry.ts's header comment for the full
 * story and why the worker needs to be a separate thread at all.
 */

import { writeFileSync } from "fs";
import { join } from "path";

const ENTRY = join(import.meta.dir, "..", "src", "tray-worker-entry.ts");
const OUT = join(import.meta.dir, "..", "src", "tray-worker.generated.js");

const result = await Bun.build({ entrypoints: [ENTRY], target: "bun" });
if (!result.success) {
  for (const message of result.logs) console.error(message);
  throw new Error("Bundling tray-worker-entry.ts failed");
}
if (result.outputs.length !== 1) {
  throw new Error(`Expected exactly one build output, got ${result.outputs.length}`);
}

const header = `// GENERATED FILE — do not edit by hand.
// Regenerate with: bun run hday-helper/scripts/bundle-tray-worker.ts
// Source: hday-helper/src/tray-worker-entry.ts
`;
const code = await result.outputs[0]!.text();
writeFileSync(OUT, header + code);
console.log(`Wrote ${OUT} (${code.length} bytes)`);
