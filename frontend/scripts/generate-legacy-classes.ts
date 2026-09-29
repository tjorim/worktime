import { readFileSync, writeFileSync } from "node:fs";
import { legacyClasses } from "./legacy-styles";

const classes = legacyClasses();
const output = new URL("../legacy-classes.json", import.meta.url);
const contents = JSON.stringify(classes, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== contents) {
    throw new Error("Legacy class list is stale. Run pnpm generate-legacy-classes.");
  }
} else {
  writeFileSync(output, contents);
}
process.stdout.write(`${classes.length} legacy classes\n`);
