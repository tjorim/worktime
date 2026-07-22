import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { changelogData, type ChangelogVersion } from "../src/data/changelog.ts";

type ReleaseMetadata = {
  version: string;
  date: string;
};

const root = process.cwd();

function parseVersion(version: string): number[] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return match.slice(1).map(Number);
}

function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;

  return aPatch - bPatch;
}

function getLatestMarkdownRelease(changelogMarkdown: string): ReleaseMetadata {
  const releasePattern = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm;
  const matches = [...changelogMarkdown.matchAll(releasePattern)];

  if (matches.length === 0) {
    throw new Error("No versioned release entries found in CHANGELOG.md.");
  }

  const releases = matches.map((match) => {
    const [version, date] = match.slice(1);
    return { version, date };
  });

  return releases.reduce((latest, current) =>
    compareVersions(current.version, latest.version) > 0 ? current : latest,
  );
}

function getLatestTsRelease(changelog: ChangelogVersion[]): ChangelogVersion {
  const releases = changelog.filter(
    (entry) => entry.status === "released" || entry.status === "current",
  );

  if (releases.length === 0) {
    throw new Error("No released/current entries found in src/data/changelog.ts.");
  }

  return releases.reduce((latest, current) =>
    compareVersions(current.version, latest.version) > 0 ? current : latest,
  );
}

const pkgRaw = readFileSync(resolve(root, "package.json"), "utf8");
const pkg = JSON.parse(pkgRaw) as { version: string };
const changelogMd = readFileSync(resolve(root, "../CHANGELOG.md"), "utf8");
const rootVersion = readFileSync(resolve(root, "../VERSION"), "utf8").trim();

const packageVersion = pkg.version;
const markdownRelease = getLatestMarkdownRelease(changelogMd);
const tsRelease = getLatestTsRelease(changelogData);

const failures: string[] = [];

if (packageVersion !== rootVersion) {
  failures.push(
    `package.json version (${packageVersion}) does not match the repo-root VERSION file (${rootVersion}). Run "pnpm run sync-version" after bumping VERSION.`,
  );
}

if (packageVersion !== markdownRelease.version) {
  failures.push(
    `package.json version (${packageVersion}) does not match latest CHANGELOG.md release (${markdownRelease.version}).`,
  );
}

if (packageVersion !== tsRelease.version) {
  failures.push(
    `package.json version (${packageVersion}) does not match latest src/data/changelog.ts release (${tsRelease.version}).`,
  );
}

if (markdownRelease.version !== tsRelease.version) {
  failures.push(
    `CHANGELOG sources disagree on release version (CHANGELOG.md: ${markdownRelease.version}, src/data/changelog.ts: ${tsRelease.version}).`,
  );
}

if (markdownRelease.date !== tsRelease.date) {
  failures.push(
    `CHANGELOG sources disagree on release date for ${markdownRelease.version}/${tsRelease.version} (CHANGELOG.md: ${markdownRelease.date}, src/data/changelog.ts: ${tsRelease.date}).`,
  );
}

if (failures.length > 0) {
  process.stderr.write("❌ Version consistency check failed:\n\n");
  failures.forEach((failure) => {
    process.stderr.write(`- ${failure}\n`);
  });
  process.exit(1);
}

process.stdout.write(
  `✅ Version consistency check passed (version ${packageVersion}, release date ${markdownRelease.date}).\n`,
);
