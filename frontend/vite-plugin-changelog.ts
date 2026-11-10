import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:changelog";
const root = resolve(import.meta.dirname, "..");

/**
 * Serves the repository's CHANGELOG.md to the app as the `virtual:changelog` module.
 *
 * CHANGELOG.md is the hand-edited source of truth; `scripts/release.mjs export` turns it into the
 * JSON the "What's New" dialog renders, leaving out `### Internal` entries and entries scoped to
 * other clients. Running the script at load time keeps one parser for the app, CI and releases.
 */
export function changelogPlugin(): Plugin {
  return {
    name: "worktime-changelog",
    resolveId(id) {
      return id === VIRTUAL_ID ? `\0${VIRTUAL_ID}` : undefined;
    },
    load(id) {
      if (id !== `\0${VIRTUAL_ID}`) return undefined;
      this.addWatchFile(resolve(root, "CHANGELOG.md"));
      const json = execFileSync(
        process.execPath,
        [resolve(root, "scripts/release.mjs"), "export", "--audience", "app", "--platform", "web"],
        { cwd: root, encoding: "utf8", env: { ...process.env, RELEASE_ROOT: root } },
      );
      return `export default ${json};`;
    },
  };
}
