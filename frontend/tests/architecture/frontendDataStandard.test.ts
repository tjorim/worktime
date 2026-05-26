import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(process.cwd(), "src");
const ALLOWED_PLAIN_USE_QUERY = new Set([
  "hooks/useLongWeekend.ts",
  "hooks/useOpenHolidays.ts",
  "hooks/usePaydates.ts",
]);

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    const extension = extname(entry.name);
    if (extension === ".ts" || extension === ".tsx") {
      files.push(fullPath);
    }
  }
  return files;
}

describe("frontend data standard guardrails", () => {
  it("allows plain useQuery only in approved read-only hooks", () => {
    const files = walkFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!/\buseQuery\s*(<[^>]+>)?\s*\(/.test(source)) continue;
      const rel = relative(SRC_DIR, file).replaceAll("\\", "/");
      if (!ALLOWED_PLAIN_USE_QUERY.has(rel)) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });

  it("forbids standalone useQuery with sync query keys", () => {
    const files = walkFiles(SRC_DIR);
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!/\buseQuery\s*(<[^>]+>)?\s*\(/.test(source)) continue;
      if (!/queryKey\s*:\s*\[\s*["']sync["']/.test(source)) continue;
      offenders.push(relative(SRC_DIR, file).replaceAll("\\", "/"));
    }

    expect(offenders).toEqual([]);
  });
});
