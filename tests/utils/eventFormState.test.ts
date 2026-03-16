import { describe, expect, it } from "vite-plus/test";
import {
  buildEventFormState,
  isEventFormDirty,
  serializeEventFormState,
  serializeEventFormStateFromEvent,
  toEventFormStateFromEvent,
} from "../../src/utils/eventFormState";

describe("eventFormState", () => {
  it("builds event form state from primitive fields", () => {
    const state = buildEventFormState("weekly", 4, "", "", "Training", ["course"]);

    expect(state).toEqual({
      type: "weekly",
      weekday: 4,
      start: "",
      end: "",
      title: "Training",
      flags: ["course"],
    });
  });
  it("serializes flags in stable sorted order", () => {
    const serialized = serializeEventFormState({
      type: "range",
      weekday: 1,
      start: "2026/01/01",
      end: "2026/01/02",
      title: "Vacation",
      flags: ["onsite", "business"],
    });

    expect(serialized).toContain('"flags":["business","onsite"]');
  });

  it("normalizes unknown event types as range when building state from event", () => {
    const formState = toEventFormStateFromEvent(
      {
        type: "unknown",
        start: "2026/03/01",
        end: "2026/03/02",
        title: "Imported",
        flags: ["onsite"],
      },
      1,
    );

    expect(formState).toEqual({
      type: "range",
      weekday: 1,
      start: "2026/03/01",
      end: "2026/03/02",
      title: "Imported",
      flags: ["onsite"],
    });
  });

  it("serializes existing event state via helper", () => {
    const serialized = serializeEventFormStateFromEvent(
      {
        type: "weekly",
        weekday: 5,
        title: "Office",
        flags: ["business", "onsite"],
      },
      1,
    );

    expect(serialized).toContain('"type":"weekly"');
    expect(serialized).toContain('"weekday":5');
  });
  it("returns false when only flag order changes", () => {
    const initial = serializeEventFormState({
      type: "weekly",
      weekday: 2,
      start: "",
      end: "",
      title: "Onsite day",
      flags: ["onsite", "business"],
    });

    const dirty = isEventFormDirty(
      {
        type: "weekly",
        weekday: 2,
        start: "",
        end: "",
        title: "Onsite day",
        flags: ["business", "onsite"],
      },
      initial,
    );

    expect(dirty).toBe(false);
  });

  it("returns true when form fields change", () => {
    const initial = serializeEventFormState({
      type: "range",
      weekday: 1,
      start: "2026/02/01",
      end: "2026/02/01",
      title: "",
      flags: [],
    });

    const dirty = isEventFormDirty(
      {
        type: "range",
        weekday: 1,
        start: "2026/02/01",
        end: "2026/02/01",
        title: "Doctor",
        flags: [],
      },
      initial,
    );

    expect(dirty).toBe(true);
  });
});
