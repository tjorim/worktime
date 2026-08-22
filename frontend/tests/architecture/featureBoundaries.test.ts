import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const FEATURES_DIR = resolve(process.cwd(), "src/features");

function walkSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("feature boundaries", () => {
  it("does not import one feature from another", () => {
    const offenders: string[] = [];

    for (const file of walkSourceFiles(FEATURES_DIR)) {
      const relativePath = relative(FEATURES_DIR, file);
      const [ownFeature] = relativePath.split(sep);
      const source = readFileSync(file, "utf8");
      const importedFeatures = source.matchAll(
        /(?:from\s*|import\s*\()\s*["']@\/features\/([^/"']+)/g,
      );

      for (const match of importedFeatures) {
        if (match[1] !== ownFeature) {
          offenders.push(`${relativePath.replaceAll(sep, "/")} -> ${match[1]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
