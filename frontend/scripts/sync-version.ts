#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const versionFilePath = resolve(root, "../VERSION");
const packageJsonPath = resolve(root, "package.json");

const version = readFileSync(versionFilePath, "utf8").trim();
const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonRaw) as { version: string };

if (packageJson.version === version) {
  process.stdout.write(`✅ package.json already matches VERSION (${version}).\n`);
  process.exit(0);
}

const previousVersion = packageJson.version;
packageJson.version = version;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
process.stdout.write(`✅ Synced package.json version to ${version} (was ${previousVersion}).\n`);
