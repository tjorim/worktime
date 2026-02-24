import type { WorkLocation, WorkLocationMap } from "../types/workLocation";

/**
 * Aggregates all stored entries in workLocationMap into a grouped summary
 * keyed by (location, countryCode) for use in annual tax reporting.
 * Returns entries sorted by countryCode ascending, then days descending.
 *
 * @param workLocationMap - Map of explicitly set work locations keyed by YYYY-MM-DD
 * @returns Array of grouped entries with day counts
 */
export function aggregateLocationCounts(
  workLocationMap: WorkLocationMap,
): Array<{ location: WorkLocation; countryCode: string; days: number }> {
  const buildKey = (location: WorkLocation, countryCode: string): string =>
    `${location.length}:${location}|${countryCode.length}:${countryCode}`;

  const counts = new Map<
    string,
    { location: WorkLocation; countryCode: string; days: number }
  >();

  for (const info of workLocationMap.values()) {
    if (info.location !== "home" && info.location !== "office" && info.location !== "other") {
      console.warn(
        "aggregateLocationCounts: skipping entry with unknown location",
        info.countryCode,
        info.label,
      );
      continue;
    }
    const key = buildKey(info.location, info.countryCode);
    const existing = counts.get(key);
    if (existing) {
      existing.days++;
      continue;
    }

    counts.set(key, {
      location: info.location,
      countryCode: info.countryCode,
      days: 1,
    });
  }

  return Array.from(counts.values()).sort(
    (a, b) => a.countryCode.localeCompare(b.countryCode) || b.days - a.days,
  );
}
