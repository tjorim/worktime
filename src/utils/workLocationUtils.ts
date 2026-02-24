import type { WorkLocation, WorkLocationMap } from "../types/workLocation";

/**
 * Aggregates all stored entries in workLocationMap into a grouped summary
 * keyed by (location, countryCode, label) for use in annual tax reporting.
 * Returns entries sorted by count descending.
 *
 * @param workLocationMap - Map of explicitly set work locations keyed by YYYY-MM-DD
 * @returns Array of grouped entries with day counts, sorted by days descending
 */
export function aggregateLocationCounts(
  workLocationMap: WorkLocationMap,
): Array<{ location: WorkLocation; countryCode: string; label?: string; days: number }> {
  const buildKey = (location: WorkLocation, countryCode: string, label: string): string =>
    `${location.length}:${location}|${countryCode.length}:${countryCode}|${label.length}:${label}`;

  const counts = new Map<
    string,
    { location: WorkLocation; countryCode: string; label?: string; days: number }
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
    const label = info.label ?? "";
    const key = buildKey(info.location, info.countryCode, label);
    const existing = counts.get(key);
    if (existing) {
      existing.days++;
      continue;
    }

    counts.set(key, {
      location: info.location,
      countryCode: info.countryCode,
      ...(info.label ? { label: info.label } : {}),
      days: 1,
    });
  }

  return Array.from(counts.values()).sort((a, b) => b.days - a.days);
}
