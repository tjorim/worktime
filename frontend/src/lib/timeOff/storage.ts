import { hdayToTimeOffEntries } from "./codecs";
import type { TimeOffEntry, TimeOffEntryFlag, TimeOffEntryType } from "./types";
import {
  getTimeOffEntryIdentityKey,
  getTimeOffEntrySortKey,
  TIME_OFF_ENTRY_TYPES,
} from "./types";

export const TIME_OFF_ENTRIES_STORAGE_KEY = "worktime_time_off_entries";
export const LEGACY_TIME_OFF_STORAGE_KEY = "worktime_hday_raw";

function isValidDateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  );
}

function isValidEntryType(value: unknown): value is TimeOffEntryType {
  return typeof value === "string" && TIME_OFF_ENTRY_TYPES.includes(value as TimeOffEntryType);
}

function isValidFlag(value: unknown): value is TimeOffEntryFlag {
  return (
    value === "half_am" ||
    value === "half_pm" ||
    value === "onsite" ||
    value === "no_fly" ||
    value === "can_fly"
  );
}

export function normalizeTimeOffEntries(input: unknown): TimeOffEntry[] {
  if (!Array.isArray(input)) return [];

  const entries: TimeOffEntry[] = [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) continue;

    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || candidate.id.length === 0) continue;
    if (!isValidEntryType(candidate.entryType)) continue;

    const flags = Array.isArray(candidate.flags)
      ? candidate.flags.filter(isValidFlag)
      : [];

    const note =
      typeof candidate.note === "string" && candidate.note.trim().length > 0
        ? candidate.note.trim()
        : null;

    if (candidate.kind === "weekly") {
      if (typeof candidate.weekday !== "number" || candidate.weekday < 1 || candidate.weekday > 7) {
        continue;
      }
      entries.push({
        id: candidate.id,
        kind: "weekly",
        weekday: candidate.weekday,
        entryType: candidate.entryType,
        flags,
        note,
      });
      continue;
    }

    if (candidate.kind === "range") {
      if (!isValidDateKey(candidate.start) || !isValidDateKey(candidate.end)) continue;
      entries.push({
        id: candidate.id,
        kind: "range",
        start: candidate.start,
        end: candidate.end,
        entryType: candidate.entryType,
        flags,
        note,
      });
      continue;
    }

    if (!isValidDateKey(candidate.date)) continue;
    entries.push({
      id: candidate.id,
      kind: "date",
      date: candidate.date,
      entryType: candidate.entryType,
      flags,
      note,
    });
  }

  return entries.sort((a, b) => {
    const byKey = getTimeOffEntrySortKey(a).localeCompare(getTimeOffEntrySortKey(b));
    if (byKey !== 0) return byKey;
    const byIdentity = getTimeOffEntryIdentityKey(a).localeCompare(getTimeOffEntryIdentityKey(b));
    if (byIdentity !== 0) return byIdentity;
    return a.id.localeCompare(b.id);
  });
}

export function loadTimeOffEntries(): TimeOffEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(TIME_OFF_ENTRIES_STORAGE_KEY);
    if (raw) {
      return normalizeTimeOffEntries(JSON.parse(raw));
    }

    const legacyRaw = localStorage.getItem(LEGACY_TIME_OFF_STORAGE_KEY);
    if (!legacyRaw) return [];
    return hdayToTimeOffEntries(legacyRaw).entries;
  } catch {
    return [];
  }
}

export function saveTimeOffEntries(entries: TimeOffEntry[]): void {
  if (typeof window === "undefined") return;

  if (entries.length === 0) {
    localStorage.removeItem(TIME_OFF_ENTRIES_STORAGE_KEY);
    localStorage.removeItem(LEGACY_TIME_OFF_STORAGE_KEY);
    return;
  }

  localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify(entries));
}
