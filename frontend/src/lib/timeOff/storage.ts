import { TIME_OFF_ENTRIES_STORAGE_KEY } from "@/constants/storageKeys";
import type { TimeOffEntry, TimeOffEntryFlag } from "./types";
import {
  getTimeOffEntryIdentityKey,
  getTimeOffEntrySortKey,
  isValidEntryType,
  isValidFlag,
} from "./types";

function isValidDateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
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

    const flagRaw = candidate.entryFlag;
    const flag: TimeOffEntryFlag = isValidFlag(flagRaw) ? flagRaw : "full_day";

    const note =
      typeof candidate.note === "string" && candidate.note.trim().length > 0
        ? candidate.note.trim()
        : null;

    if (candidate.entryKind === "weekly") {
      if (typeof candidate.weekday !== "number" || candidate.weekday < 1 || candidate.weekday > 7) {
        continue;
      }
      entries.push({
        id: candidate.id,
        entryKind: "weekly",
        weekday: candidate.weekday,
        entryType: candidate.entryType,
        entryFlag: flag,
        note,
      });
      continue;
    }

    if (candidate.entryKind === "range") {
      if (!isValidDateKey(candidate.start) || !isValidDateKey(candidate.end)) continue;
      entries.push({
        id: candidate.id,
        entryKind: "range",
        start: candidate.start,
        end: candidate.end,
        entryType: candidate.entryType,
        entryFlag: flag,
        note,
      });
      continue;
    }

    if (!isValidDateKey(candidate.date)) continue;
    entries.push({
      id: candidate.id,
      entryKind: "date",
      date: candidate.date,
      entryType: candidate.entryType,
      entryFlag: flag,
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
    if (!raw) return [];
    return normalizeTimeOffEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveTimeOffEntries(entries: TimeOffEntry[]): void {
  if (typeof window === "undefined") return;

  if (entries.length === 0) {
    localStorage.removeItem(TIME_OFF_ENTRIES_STORAGE_KEY);
    return;
  }

  localStorage.setItem(TIME_OFF_ENTRIES_STORAGE_KEY, JSON.stringify(entries));
}
