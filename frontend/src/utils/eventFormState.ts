import type { EventFlag } from "@/lib/hday/types";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { isTimeOffDateEntry, isTimeOffRangeEntry, isTimeOffWeeklyEntry } from "@/lib/timeOff/types";
import { getEntryFlagsForDisplay } from "@/lib/timeOff/codecs";

export type EventFormState = {
  type: "range" | "weekly";
  weekday: number;
  start: string;
  end: string;
  title: string;
  flags: ReadonlyArray<EventFlag>;
};

export function buildEventFormState(
  type: "range" | "weekly",
  weekday: number,
  start: string,
  end: string,
  title: string,
  flags: ReadonlyArray<EventFlag>,
): EventFormState {
  return {
    type,
    weekday,
    start,
    end,
    title,
    flags,
  };
}

export function serializeEventFormState(state: EventFormState): string {
  return JSON.stringify({
    ...state,
    flags: [...state.flags].sort(),
  });
}

export function serializeEventFormStateFromEntry(
  entry: TimeOffEntry,
  defaultWeekday: number,
): string {
  return serializeEventFormState({
    type: isTimeOffWeeklyEntry(entry) ? "weekly" : "range",
    weekday: isTimeOffWeeklyEntry(entry) ? entry.weekday : defaultWeekday,
    start: isTimeOffDateEntry(entry)
      ? entry.date.replace(/-/g, "/")
      : isTimeOffRangeEntry(entry)
        ? entry.start.replace(/-/g, "/")
        : "",
    end: isTimeOffDateEntry(entry)
      ? entry.date.replace(/-/g, "/")
      : isTimeOffRangeEntry(entry)
        ? entry.end.replace(/-/g, "/")
        : "",
    title: entry.note || "",
    flags: getEntryFlagsForDisplay(entry),
  });
}

export function isEventFormDirty(currentState: EventFormState, initialState: string): boolean {
  return serializeEventFormState(currentState) !== initialState;
}
