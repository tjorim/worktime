import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WfhStatsBar } from "../../src/components/calendar/WfhStatsBar";
import type { WorkLocationMap } from "../../src/types/workLocation";

const HOME = { location: "home" as const, countryCode: "NL" as const };
const OFFICE = { location: "office" as const, countryCode: "BE" as const };

// System time is pinned to 2026-02-18 (Wednesday, ISO week 8).
// All WFH test dates must fall in ISO week 8 (Mon Feb 16 – Sun Feb 22)
// for the component's internal dayjs() call to pick them up.
const WEEK = {
  mon: "2026/02/16",
  tue: "2026/02/17",
  wed: "2026/02/18",
  thu: "2026/02/19",
  fri: "2026/02/20",
};

describe("WfhStatsBar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-18T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 0/N when no WFH days are set", () => {
    const map: WorkLocationMap = new Map();
    render(<WfhStatsBar workLocationMap={map} wfhWeeklyLimit={3} />);
    expect(screen.getByText("0/3")).toBeInTheDocument();
  });

  it("counts WFH entries in the current ISO week", () => {
    const map: WorkLocationMap = new Map([
      [WEEK.mon, HOME],
      [WEEK.tue, HOME],
    ]);
    render(<WfhStatsBar workLocationMap={map} wfhWeeklyLimit={3} />);
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("ignores office entries in the displayed count", () => {
    const map: WorkLocationMap = new Map([
      [WEEK.mon, OFFICE],
      [WEEK.tue, HOME],
    ]);
    render(<WfhStatsBar workLocationMap={map} wfhWeeklyLimit={3} />);
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("does not show the warning badge when limit is not exceeded", () => {
    const map: WorkLocationMap = new Map([[WEEK.mon, HOME]]);
    render(<WfhStatsBar workLocationMap={map} wfhWeeklyLimit={3} />);
    expect(screen.queryByText(/Limit exceeded/)).not.toBeInTheDocument();
  });

  it("shows the warning badge when WFH count exceeds the limit", () => {
    const map: WorkLocationMap = new Map([
      [WEEK.mon, HOME],
      [WEEK.tue, HOME],
      [WEEK.wed, HOME],
    ]);
    render(<WfhStatsBar workLocationMap={map} wfhWeeklyLimit={2} />);
    expect(screen.getByText(/Limit exceeded/)).toBeInTheDocument();
  });

  it("has an accessible aria-label on the progress bar wrapper", () => {
    const map: WorkLocationMap = new Map([[WEEK.mon, HOME]]);
    render(<WfhStatsBar workLocationMap={map} wfhWeeklyLimit={4} />);
    // React Bootstrap renders aria-label on the outer .progress wrapper div,
    // not on the inner role="progressbar" element — query it directly.
    expect(
      document.querySelector('[aria-label="WFH days this week: 1 of 4"]'),
    ).toBeInTheDocument();
  });

  it("shows 0/0 with no badge when map is empty and limit is 0", () => {
    const map: WorkLocationMap = new Map();
    render(<WfhStatsBar workLocationMap={map} wfhWeeklyLimit={0} />);
    expect(screen.getByText("0/0")).toBeInTheDocument();
    expect(screen.queryByText(/Limit exceeded/)).not.toBeInTheDocument();
  });
});
