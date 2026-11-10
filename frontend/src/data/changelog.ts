// The changelog is not authored here: CHANGELOG.md (repo root) is the source of truth. The
// `virtual:changelog` module is its parsed form for this app (see vite-plugin-changelog.ts):
// `### Internal` entries and entries scoped to other clients are already left out.
import changelog from "virtual:changelog";
import type { ChangelogCategory } from "virtual:changelog";

export type { ChangelogCategory, ChangelogEntry } from "virtual:changelog";

export interface ChangelogVersion {
  version: string;
  date: string;
  status: "current" | "released";
  categories: ChangelogCategory[];
}

/** Released versions, newest first; the newest is the one running. */
export const changelogData: ChangelogVersion[] = changelog.releases.map((release, index) => ({
  ...release,
  status: index === 0 ? "current" : "released",
}));

/** The `### Planned` bullets under `[Unreleased]`, shown as "Coming soon". */
export const futurePlans: string[] = (changelog.unreleased?.categories ?? [])
  .filter((category) => category.name === "Planned")
  .flatMap((category) => category.entries.map((entry) => entry.text));
