import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalizedStatusContent } from "@/components/status/PersonalizedStatus";
import { useLiveShiftStatus } from "@/hooks/useLiveShiftStatus";
import { useTodayActualStart } from "@/hooks/useTodayActualStart";
import { useFlexStartOverride } from "@/hooks/useFlexStartOverride";
import { dayjs } from "@/utils/dateTimeUtils";

vi.mock("@/contexts/SettingsContext", () => ({
  useSettings: () => ({ settings: { timeFormat: "24h", enableTimeTracking: false } }),
}));
vi.mock("@/hooks/useLiveShiftStatus");
vi.mock("@/hooks/useTodayActualStart");
vi.mock("@/hooks/useFlexStartOverride");
vi.mock("@/components/status/FlexStartEditor", () => ({ FlexStartEditor: () => null }));

const shift = {
  code: "M" as const,
  displayCode: "M",
  name: "Morning",
  emoji: "🌅",
  start: 7,
  end: 15,
  isWorking: true,
  className: "shift-morning",
};

function show(now: string, start = 7, end = 15, flex = false) {
  vi.mocked(useLiveShiftStatus).mockReturnValue({
    today: dayjs(now),
    shiftDay: dayjs("2026-10-29"),
    currentShift: {
      date: dayjs("2026-10-29"),
      code: "M" as const,
      teamNumber: 1,
      shift: {
        ...shift,
        start,
        end,
        ...(flex ? { flexStartEarliest: 7, flexStartLatest: 9, presenceHours: 8.5 } : {}),
      },
    },
    nextShift: null,
    offDayProgress: null,
  });
  return render(<PersonalizedStatusContent myTeam={1} scheduleType="5-shift" />);
}

describe("personalised shift completion", () => {
  beforeEach(() => {
    vi.mocked(useTodayActualStart).mockReturnValue(null);
    vi.mocked(useFlexStartOverride).mockReturnValue({
      startTime: null,
      setStartTime: vi.fn(),
      clear: vi.fn(),
    });
  });

  it.each([
    ["day before start", "2026-10-29T06:59", 7, 15, false, false],
    ["day during", "2026-10-29T12:00", 7, 15, true, false],
    ["day at end", "2026-10-29T15:00", 7, 15, false, true],
    ["day after end", "2026-10-29T22:17", 7, 15, false, true],
    ["night before start", "2026-10-29T22:59", 23, 7, false, false],
    ["night before midnight", "2026-10-29T23:30", 23, 7, true, false],
    ["night after midnight", "2026-10-30T03:00", 23, 7, true, false],
    ["night at end", "2026-10-30T07:00", 23, 7, false, true],
    ["night after end", "2026-10-30T08:00", 23, 7, false, true],
  ])("handles %s", (_name, now, start, end, progress, ended) => {
    show(now, start, end);
    expect(screen.queryByRole("progressbar") !== null).toBe(progress);
    expect(screen.queryByText(`Shift ended at ${String(end).padStart(2, "0")}:00`) !== null).toBe(
      ended,
    );
    if (progress) {
      const elapsed = dayjs(now).diff(dayjs("2026-10-29").hour(start), "hour");
      expect(screen.getByRole("progressbar")).toHaveAccessibleName(
        `Shift progress: ${elapsed} of 8 hours`,
      );
    }
  });

  it.each(["actual", "manual"])("uses the %s flex start to determine completion", (source) => {
    const startTime = dayjs("2026-10-29T07:00");
    if (source === "actual") vi.mocked(useTodayActualStart).mockReturnValue(startTime);
    else
      vi.mocked(useFlexStartOverride).mockReturnValue({
        startTime,
        setStartTime: vi.fn(),
        clear: vi.fn(),
      });
    const view = show("2026-10-29T15:29", 9, 17.5, true);
    expect(screen.getByRole("progressbar")).toHaveAccessibleName(
      "Shift progress: 8.5 of 8.5 hours",
    );
    view.unmount();
    show("2026-10-29T15:30", 9, 17.5, true);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Shift ended at 15:30")).toBeInTheDocument();
  });
});
