/**
 * Measures the production bundle in `dist/` and fails when the initial load
 * grows past the budgets below.
 *
 * "Initial" means the static import closure of the entry script in
 * `dist/index.html`: the chunks the browser must fetch, parse and execute
 * before the first render. Chunks only reachable through `import()` (route
 * and tab chunks, optional vendors) are excluded. They are still precached by
 * Workbox, so offline use is unaffected; this budget guards startup parsing and
 * execution, not background transfer. `totalJsRawKb` guards the latter.
 *
 * Run after `pnpm build`:  pnpm run check-bundle-budget
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = resolve(import.meta.dirname, "..", "dist");

// Budgets sit ~5% above the numbers measured for apps#247 (initial 1293 kB raw /
// 392 kB gzip, total 2391 kB raw; #1569 measured 1477 / 441 / 2375). Lower them
// when the numbers improve; raise them only with a reason.
const BUDGETS = {
  initialRawKb: 1_360,
  initialGzipKb: 412,
  totalJsRawKb: 2_510,
} as const;

function listJs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listJs(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

// Static `import ... from "./x.js"` and bare `import"./x.js"`; dynamic
// `import("./x.js")` has a parenthesis and is deliberately not matched.
const STATIC_IMPORT = /(?:from|import)\s*["'](\.{1,2}\/[^"']+\.js)["']/g;

function staticDeps(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(STATIC_IMPORT)].map((match) => resolve(dirname(file), match[1]));
}

function entryScript(): string {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const match = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
  if (!match) throw new Error("No module entry script found in dist/index.html");
  return join(DIST, match[1]);
}

const out = (line: string) => process.stdout.write(`${line}\n`);
const kb = (bytes: number) => bytes / 1024;
const gzipBytes = (file: string) => gzipSync(readFileSync(file)).length;

const initial = new Set<string>();
const queue = [entryScript()];
while (queue.length > 0) {
  const file = queue.pop()!;
  if (initial.has(file)) continue;
  initial.add(file);
  queue.push(...staticDeps(file));
}

const allJs = listJs(join(DIST, "assets"));
const initialRaw = [...initial].reduce((sum, file) => sum + statSync(file).size, 0);
const initialGzip = [...initial].reduce((sum, file) => sum + gzipBytes(file), 0);
const totalRaw = allJs.reduce((sum, file) => sum + statSync(file).size, 0);

out("Initial static closure:");
for (const file of [...initial].sort()) {
  out(`  ${relative(DIST, file).padEnd(52)} ${kb(statSync(file).size).toFixed(1).padStart(8)} kB`);
}
out(
  `Initial JS: ${kb(initialRaw).toFixed(1)} kB raw, ${kb(initialGzip).toFixed(1)} kB gzip ` +
    `(${initial.size} chunks)`,
);
out(`Total shipped JS: ${kb(totalRaw).toFixed(1)} kB raw (${allJs.length} chunks)`);

const checks: Array<[label: string, actual: number, budget: number]> = [
  ["initial raw", kb(initialRaw), BUDGETS.initialRawKb],
  ["initial gzip", kb(initialGzip), BUDGETS.initialGzipKb],
  ["total JS raw", kb(totalRaw), BUDGETS.totalJsRawKb],
];
const failures = checks
  .filter(([, actual, budget]) => actual > budget)
  .map(([label, actual, budget]) => `${label}: ${actual.toFixed(1)} kB > budget ${budget} kB`);

if (failures.length > 0) {
  process.stderr.write(`\nBundle budget exceeded:\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
