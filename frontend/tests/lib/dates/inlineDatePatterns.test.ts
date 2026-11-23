import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const serializationPatterns = new Set(["YYYY-MM-DD", "YYYY-MM-DDTHH:mm"]);

it("uses shared formatters for dates displayed by components", () => {
  const src = join(process.cwd(), "src/");
  const violations: string[] = [];
  for (const folder of ["app", "components", "features"]) {
    for (const entry of readdirSync(join(src, folder), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".tsx")) continue;
      const path = join(entry.parentPath, entry.name);
      const source = readFileSync(path, "utf8");
      for (const [, pattern] of source.matchAll(/\.format\s*\(\s*["'`]([^"'\x60\n]+)["'`]/g)) {
        if (
          /\b(?:Y{2,4}|M{1,4}|D{1,4}|d{2,4}|L{1,4}|l{1,4})\b/.test(pattern!) &&
          !serializationPatterns.has(pattern!)
        ) {
          violations.push(`${path.slice(src.length)}: ${pattern}`);
        }
      }
    }
  }
  expect(violations).toEqual([]);
});
