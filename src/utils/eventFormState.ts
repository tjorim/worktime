import type { EventFlag } from "../lib/hday/types";

export type EventFormState = {
  type: "range" | "weekly";
  weekday: number;
  start: string;
  end: string;
  title: string;
  flags: ReadonlyArray<EventFlag>;
};

export function serializeEventFormState(state: EventFormState): string {
  return JSON.stringify({
    ...state,
    flags: [...state.flags].sort(),
  });
}

export function isEventFormDirty(currentState: EventFormState, initialState: string): boolean {
  return serializeEventFormState(currentState) !== initialState;
}
