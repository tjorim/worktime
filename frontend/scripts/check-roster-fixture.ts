import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildRosterFixture, ROSTER_FIXTURE_RELATIVE_PATH } from "./rosterFixtureBuilder.ts";

const root = process.cwd();
const fixturePath = resolve(root, ROSTER_FIXTURE_RELATIVE_PATH);

const expected = `${JSON.stringify(buildRosterFixture(), null, 2)}\n`;

let actual: string;
try {
  actual = readFileSync(fixturePath, "utf8");
} catch {
  process.stderr.write(
    `❌ ${ROSTER_FIXTURE_RELATIVE_PATH} does not exist. Run "pnpm run generate-roster-fixture" and commit the result.\n`,
  );
  process.exit(1);
}

if (actual !== expected) {
  process.stderr.write(
    `❌ ${ROSTER_FIXTURE_RELATIVE_PATH} is out of date with frontend/src/data/rosters.ts and shiftCalculations.ts.\n` +
      'Run "pnpm run generate-roster-fixture" and commit the result.\n',
  );
  process.exit(1);
}

process.stdout.write("✅ Roster golden fixture is up to date.\n");
