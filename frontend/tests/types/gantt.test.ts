import { describe, expect, it } from "vitest";
import { isValidRawGanttTask } from "../../src/types/gantt";

describe("isValidRawGanttTask", () => {
  it("accepts a valid task", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "My Task",
        start: "2026-03-01",
        end: "2026-03-05",
      }),
    ).toBe(true);
  });

  it("accepts a valid task with optional fields", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "My Task",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: 50,
        dependencies: "other-id",
        notes: "Some notes",
      }),
    ).toBe(true);
  });

  it("accepts progress boundaries of 0 and 100", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: 0,
      }),
    ).toBe(true);

    expect(
      isValidRawGanttTask({
        id: "def",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: 100,
      }),
    ).toBe(true);
  });

  it("rejects negative progress", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: -1,
      }),
    ).toBe(false);
  });

  it("rejects progress above 100", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: 150,
      }),
    ).toBe(false);
  });

  it("rejects non-numeric progress values", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: "50",
      }),
    ).toBe(false);

    expect(
      isValidRawGanttTask({
        id: "def",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: Number.NaN,
      }),
    ).toBe(false);

    expect(
      isValidRawGanttTask({
        id: "ghi",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        progress: null,
      }),
    ).toBe(false);
  });

  it("rejects empty id", () => {
    expect(
      isValidRawGanttTask({ id: "", name: "My Task", start: "2026-03-01", end: "2026-03-05" }),
    ).toBe(false);
  });

  it("rejects whitespace-only id", () => {
    expect(
      isValidRawGanttTask({ id: "   ", name: "My Task", start: "2026-03-01", end: "2026-03-05" }),
    ).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      isValidRawGanttTask({ id: "abc", name: "", start: "2026-03-01", end: "2026-03-05" }),
    ).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    expect(
      isValidRawGanttTask({ id: "abc", name: "  ", start: "2026-03-01", end: "2026-03-05" }),
    ).toBe(false);
  });

  it("rejects end date before start date", () => {
    expect(
      isValidRawGanttTask({ id: "abc", name: "Task", start: "2026-03-05", end: "2026-03-01" }),
    ).toBe(false);
  });

  it("accepts same start and end date", () => {
    expect(
      isValidRawGanttTask({ id: "abc", name: "Task", start: "2026-03-01", end: "2026-03-01" }),
    ).toBe(true);
  });

  it("rejects invalid date format (slashes instead of dashes)", () => {
    expect(
      isValidRawGanttTask({ id: "abc", name: "Task", start: "2026/02/01", end: "2026-03-01" }),
    ).toBe(false);
  });

  it("rejects impossible calendar date (Feb 31)", () => {
    expect(
      isValidRawGanttTask({ id: "abc", name: "Task", start: "2026-02-31", end: "2026-03-01" }),
    ).toBe(false);
  });

  it("accepts dependencies as string", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        dependencies: "other-id, another-id",
      }),
    ).toBe(true);
  });

  it("accepts missing dependencies field", () => {
    expect(
      isValidRawGanttTask({ id: "abc", name: "Task", start: "2026-03-01", end: "2026-03-05" }),
    ).toBe(true);
  });

  it("rejects non-string dependencies", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        dependencies: 123,
      }),
    ).toBe(false);
  });

  it("accepts notes as string", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        notes: "some notes",
      }),
    ).toBe(true);
  });

  it("rejects non-string notes", () => {
    expect(
      isValidRawGanttTask({
        id: "abc",
        name: "Task",
        start: "2026-03-01",
        end: "2026-03-05",
        notes: true,
      }),
    ).toBe(false);
  });
});
