import { render } from "@testing-library/react";
import type { CalendarConfig } from "@schedule-x/calendar";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "temporal-polyfill";
import { CalendarView } from "@/features/calendar/CalendarView";
import { USER_STATE_STORAGE_KEY } from "@/constants/storageKeys";
import { setLocale } from "@/paraglide/runtime.js";
import { TestProviders } from "@tests/utils/testProviders";

const { captureConfig } = vi.hoisted(() => ({ captureConfig: vi.fn() }));
vi.mock("@schedule-x/react", () => ({
  useCalendarApp: (config: CalendarConfig) => {
    captureConfig(config);
    return null;
  },
  ScheduleXCalendar: () => null,
}));

afterEach(async () => {
  vi.restoreAllMocks();
  captureConfig.mockClear();
  await setLocale("en", { reload: false });
});

describe("unified calendar configuration", () => {
  it.each([
    ["en", "en-GB", "24h", false],
    ["nl", "nl-NL", "12h", true],
  ] as const)(
    "uses the browser zone, %s locale and %s clock preference",
    async (appLocale, calendarLocale, timeFormat, hour12) => {
      await setLocale(appLocale, { reload: false });
      vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("Europe/Brussels");
      localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ settings: { timeFormat } }));
      render(
        <TestProviders>
          <CalendarView />
        </TestProviders>,
      );
      expect(captureConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({
          timezone: "Europe/Brussels",
          locale: calendarLocale,
          weekOptions: { timeAxisFormatOptions: { hour: "numeric", minute: "2-digit", hour12 } },
        }),
      );
    },
  );
});
