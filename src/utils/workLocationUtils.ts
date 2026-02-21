import type { Dayjs } from "dayjs";

import { dayjs } from "./dateTimeUtils";
import type { WorkLocation, WorkLocationMap } from "../types/workLocation";

/**
 * Counts the number of days per location type in the ISO week containing the given date.
 *
 * Only considers days present in workLocationMap with an explicit entry.
 * Days without an explicit entry are not counted.
 *
 * @param date - Any date within the target ISO week
 * @param workLocationMap - Map of explicitly set work locations keyed by YYYY-MM-DD
 * @returns Record of counts per WorkLocation type
 *
 * @example
 * // Returns { home: 2, office: 3, other: 1 }
 * getLocationCountsInWeek(dayjs("2026-02-18"), workLocationMap);
 */
export function getLocationCountsInWeek(
  date: Dayjs,
  workLocationMap: WorkLocationMap,
): Record<WorkLocation, number> {
  const monday = dayjs(date).isoWeekday(1);
  const counts: Record<WorkLocation, number> = { home: 0, office: 0, other: 0 };
  for (let i = 0; i < 7; i++) {
    const info = workLocationMap.get(monday.add(i, "day").format("YYYY-MM-DD"));
    if (info) {
      counts[info.location]++;
    }
  }
  return counts;
}

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
