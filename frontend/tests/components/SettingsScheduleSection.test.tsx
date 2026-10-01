import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsScheduleSection } from "@/components/settings/SettingsScheduleSection";
import { HdayHelperProvider } from "@/contexts/HdayHelperContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import type { ScheduleOption } from "@/data/rosters";
import * as m from "@/paraglide/messages.js";

// Every shipped schedule is available today, so add an unavailable one to cover that state.
vi.mock("@/data/rosters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/rosters")>();
  const [first] = actual.SCHEDULE_OPTIONS;
  return {
    ...actual,
    SCHEDULE_OPTIONS: [
      ...actual.SCHEDULE_OPTIONS,
      { ...first!, value: "coming-soon", title: "Soon shift", isAvailable: false },
    ],
  };
});

function renderSection(onScheduleChange = vi.fn()) {
  render(
    <SettingsProvider>
      <HdayHelperProvider>
        <SettingsScheduleSection
          scheduleType="9-5"
          myTeam={null}
          onScheduleChange={onScheduleChange}
          onTeamChange={vi.fn()}
        />
      </HdayHelperProvider>
    </SettingsProvider>,
  );
  return onScheduleChange;
}

describe("SettingsScheduleSection", () => {
  it("disables unavailable schedules, badges them and never selects them", async () => {
    const user = userEvent.setup();
    const onScheduleChange = renderSection();

    const unavailable = screen.getByRole("button", { name: /^Soon shift/ });
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveAttribute("aria-pressed", "false");
    expect(unavailable).toHaveTextContent(m.wizard_coming_soon_badge());

    await user.click(unavailable);
    expect(onScheduleChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^2-shift/ }));
    expect(onScheduleChange).toHaveBeenCalledWith("2-shift" as ScheduleOption);
  });
});
