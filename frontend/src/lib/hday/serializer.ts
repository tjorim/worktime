import { normalizeEventFlags } from "./flags";
import type { EventFlag, HdayEvent, HdayRangeEvent, HdayWeeklyEvent } from "./types";

const FLAG_MAP: Record<EventFlag, string | undefined> = {
  holiday: undefined,
  half_am: "a",
  half_pm: "p",
  business: "b",
  weekend: "e",
  birthday: "h",
  ill: "i",
  in: "k",
  course: "s",
  other: "u",
  onsite: "w",
  no_fly: "n",
  can_fly: "f",
};

const FLAG_ORDER: EventFlag[] = [
  "business",
  "weekend",
  "birthday",
  "ill",
  "course",
  "in",
  "other",
  "half_am",
  "half_pm",
  "onsite",
  "no_fly",
  "can_fly",
  "holiday",
];

function serializeFlags(flags?: ReadonlyArray<EventFlag>): string {
  const normalizedFlags = flags ?? [];
  return FLAG_ORDER.filter((flag) => normalizedFlags.includes(flag))
    .map((flag) => FLAG_MAP[flag])
    .filter((flag): flag is string => typeof flag === "string")
    .join("");
}

function serializeRangeEvent(event: HdayRangeEvent): string {
  const prefix = serializeFlags(event.flags);
  const title = event.title ? ` # ${event.title}` : "";
  return `${prefix}${event.start}-${event.end}${title}`;
}

function serializeWeeklyEvent(event: HdayWeeklyEvent): string {
  const prefix = serializeFlags(event.flags);
  const title = event.title ? ` # ${event.title}` : "";
  return `d${event.weekday}${prefix}${title}`;
}

function validateWeeklyWeekday(weekday: number | undefined): number {
  if (!Number.isInteger(weekday) || weekday === undefined || weekday < 1 || weekday > 7) {
    throw new Error(`Weekly event missing or invalid weekday: ${weekday}. Expected an integer from 1 to 7.`);
  }

  return weekday;
}

export function toLine(event: HdayEvent): string {
  if (event.type === "unknown") {
    if (!event.raw) {
      throw new Error(
        `Cannot serialize unknown event type: missing 'raw' field. Event: type=${event.type}, flags=${JSON.stringify(event.flags ?? [])}`,
      );
    }
    return event.raw;
  }

  if (event.type === "range") {
    return serializeRangeEvent({
      type: "range",
      start: event.start ?? "",
      end: event.end ?? event.start ?? "",
      flags: event.flags,
      title: event.title,
      raw: event.raw,
    });
  }

  return serializeWeeklyEvent({
    type: "weekly",
    weekday: validateWeeklyWeekday(event.weekday),
    flags: event.flags,
    title: event.title,
    raw: event.raw,
  });
}

export function buildPreviewLine(params: {
  eventType: "range" | "weekly";
  start: string;
  end: string;
  weekday: number;
  title: string;
  flags: EventFlag[];
}): string {
  const { eventType, start, end, weekday, title, flags } = params;
  const normalizedFlags = normalizeEventFlags(flags);

  if (eventType === "range") {
    if (!start) {
      return "";
    }

    return serializeRangeEvent({
      type: "range",
      start,
      end: end || start,
      title,
      flags: normalizedFlags,
      raw: "",
    });
  }

  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    return "";
  }

  return serializeWeeklyEvent({
    type: "weekly",
    weekday,
    title,
    flags: normalizedFlags,
    raw: "",
  });
}
