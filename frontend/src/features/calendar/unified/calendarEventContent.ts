import type { CalendarEvent } from "@schedule-x/calendar";
import { Temporal } from "temporal-polyfill";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

/** Use Schedule-X's content extension so its event colors and interactions stay intact. */
export function withCalendarEventContent(
  event: CalendarEvent,
  locale: string,
  timeFormat: "12h" | "24h",
): CalendarEvent {
  if (!(event.start instanceof Temporal.ZonedDateTime)) return event;
  const formatTime = (value: Temporal.ZonedDateTime) =>
    value.toLocaleString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: timeFormat === "12h",
    });
  const start = escapeHtml(formatTime(event.start));
  const end = event.end instanceof Temporal.ZonedDateTime ? escapeHtml(formatTime(event.end)) : "";
  const title = escapeHtml(event.title ?? "");
  return {
    ...event,
    _customContent: {
      ...event._customContent,
      monthGrid: `<span>${start} ${title}</span>`,
      timeGrid: `<div>${title}</div><div>${start}–${end}</div>`,
      monthAgenda: `<div>${title}</div><div>${start}–${end}</div>`,
    },
  };
}
