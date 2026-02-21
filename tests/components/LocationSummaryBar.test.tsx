import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationSummaryBar } from "../../src/components/calendar/LocationSummaryBar";
import type { WorkLocationMap } from "../../src/types/workLocation";

const HOME = { location: "home" as const, countryCode: "NL" };
const OFFICE = { location: "office" as const, countryCode: "BE" };
const OTHER = { location: "other" as const, countryCode: "DE" };

// System time is pinned to 2026-02-18 (Wednesday, ISO week 8).
// All test dates must fall in ISO week 8 (Mon Feb 16 – Sun Feb 22)
// for the component's internal dayjs() call to pick them up.
const WEEK = {
  mon: "2026/02/16",
  tue: "2026/02/17",
  wed: "2026/02/18",
  thu: "2026/02/19",
  fri: "2026/02/20",
};

describe("LocationSummaryBar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-18T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows "No locations recorded this week" when map is empty', () => {
    const map: WorkLocationMap = new Map();
    render(<LocationSummaryBar workLocationMap={map} />);
    expect(screen.getByText("No locations recorded this week")).toBeInTheDocument();
  });

  it("shows home count when only home entries exist", () => {
    const map: WorkLocationMap = new Map([
      [WEEK.mon, HOME],
      [WEEK.tue, HOME],
    ]);
    render(<LocationSummaryBar workLocationMap={map} />);
    // The count "2" must appear alongside the home icon container
    expect(screen.getByTitle("Work from home days")).toHaveTextContent("2");
  });

  it("shows office count when only office entries exist", () => {
    const map: WorkLocationMap = new Map([[WEEK.mon, OFFICE]]);
    render(<LocationSummaryBar workLocationMap={map} />);
    expect(screen.getByTitle("Office days")).toHaveTextContent("1");
  });

  it("shows other count when other entries exist", () => {
    const map: WorkLocationMap = new Map([[WEEK.mon, OTHER]]);
    render(<LocationSummaryBar workLocationMap={map} />);
    expect(screen.getByTitle("Other location days")).toHaveTextContent("1");
  });

  it("shows all three location types when all are present", () => {
    const map: WorkLocationMap = new Map([
      [WEEK.mon, HOME],
      [WEEK.tue, OFFICE],
      [WEEK.wed, OTHER],
    ]);
    render(<LocationSummaryBar workLocationMap={map} />);
    expect(screen.getByTitle("Work from home days")).toHaveTextContent("1");
    expect(screen.getByTitle("Office days")).toHaveTextContent("1");
    expect(screen.getByTitle("Other location days")).toHaveTextContent("1");
  });

  it("hides zero-count location types", () => {
    const map: WorkLocationMap = new Map([[WEEK.mon, HOME]]);
    render(<LocationSummaryBar workLocationMap={map} />);
    expect(screen.queryByTitle("Office days")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Other location days")).not.toBeInTheDocument();
  });

  it("has an accessible aria-label on the container when locations are recorded", () => {
    const map: WorkLocationMap = new Map([[WEEK.mon, HOME]]);
    render(<LocationSummaryBar workLocationMap={map} />);
    expect(
      document.querySelector('[aria-label="Work locations this week"]'),
    ).toBeInTheDocument();
  });

  it("does not show 'No locations' message when at least one entry exists", () => {
    const map: WorkLocationMap = new Map([[WEEK.mon, OFFICE]]);
    render(<LocationSummaryBar workLocationMap={map} />);
    expect(screen.queryByText("No locations recorded this week")).not.toBeInTheDocument();
  });
});
