#!/usr/bin/env tsx
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildRosterFixture, ROSTER_FIXTURE_RELATIVE_PATH } from "./rosterFixtureBuilder.ts";

const root = process.cwd();
const outputPath = resolve(root, ROSTER_FIXTURE_RELATIVE_PATH);

const fixture = buildRosterFixture();
writeFileSync(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");

process.stdout.write(
  `✅ Wrote roster golden fixture to ${outputPath} ` +
    `(${Object.keys(fixture.schedules).length} schedules, ${fixture.shiftCodes.length} shift-code samples).\n`,
);
