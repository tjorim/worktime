import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { WeeklyHoursChart } from "@/features/timeTracking/WeeklyHoursChart";

const chartProps: ComponentProps<(typeof import("@tanstack/charts/react/core"))["Chart"]>[] = [];

vi.mock("@tanstack/charts/react/core", () => ({
  Chart: (props: (typeof chartProps)[number]) => {
    chartProps.push(props);
    return <div data-testid="chart" />;
  },
}));

const weekDays = [
  { iso: "2025-01-06", label: "Monday" },
  { iso: "2025-01-07", label: "Tuesday" },
];

describe("WeeklyHoursChart", () => {
  const baseProps = {
    weekDays,
    dailyHourTotals: [8, 6],
    todayIso: "2025-01-06",
    targetDaily: 8,
  };

  it("keeps the chart definition when re-rendered with the same data", () => {
    chartProps.length = 0;
    const { rerender } = render(<WeeklyHoursChart {...baseProps} />);
    rerender(<WeeklyHoursChart {...baseProps} />);

    expect(chartProps).toHaveLength(2);
    expect(chartProps[1]?.definition).toBe(chartProps[0]?.definition);
  });

  it("rebuilds the chart definition when the data changes", () => {
    chartProps.length = 0;
    const { rerender } = render(<WeeklyHoursChart {...baseProps} />);
    rerender(<WeeklyHoursChart {...baseProps} dailyHourTotals={[8, 7]} />);

    expect(chartProps[1]?.definition).not.toBe(chartProps[0]?.definition);
  });

  it("names and describes the chart for assistive technology", () => {
    chartProps.length = 0;
    render(<WeeklyHoursChart {...baseProps} />);

    expect(chartProps[0]?.ariaLabel).toBeTruthy();
    expect(chartProps[0]?.ariaDescription).toBeTruthy();
  });
});
