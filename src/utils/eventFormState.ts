import type { EventFlag, HdayEvent } from "../lib/hday/types";

export type EventFormState = {
  type: "range" | "weekly";
  weekday: number;
  start: string;
  end: string;
  title: string;
  flags: ReadonlyArray<EventFlag>;
};

export function toEventFormStateFromEvent(
  event: HdayEvent,
  defaultWeekday: number,
): EventFormState {
  return {
    type: event.type === "weekly" ? "weekly" : "range",
    weekday: event.weekday || defaultWeekday,
    start: event.start || "",
    end: event.end || "",
    title: event.title || "",
    flags: event.flags || [],
  };
}

export function serializeEventFormState(state: EventFormState): string {
  return JSON.stringify({
    ...state,
    flags: [...state.flags].sort(),
  });
}

export function serializeEventFormStateFromEvent(event: HdayEvent, defaultWeekday: number): string {
  return serializeEventFormState(toEventFormStateFromEvent(event, defaultWeekday));
}

export function isEventFormDirty(currentState: EventFormState, initialState: string): boolean {
  return serializeEventFormState(currentState) !== initialState;
}
