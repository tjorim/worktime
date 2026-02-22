import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainTabs } from "../../src/components/MainTabs";
import { DeveloperOptionsProvider } from "../../src/contexts/DeveloperOptionsContext";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { dayjs } from "../../src/utils/dateTimeUtils";

vi.mock("../../src/hooks/useIsMobile", () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock("../../src/components/ScheduleTabView", () => ({
  ScheduleTabView: ({ myTeam }: { myTeam: number | null }) => (
    <div data-testid="schedule-tab-view">ScheduleTabView - Team {myTeam}</div>
  ),
}));

const defaultProps = {
  myTeam: 1,
  currentDate: dayjs("2025-01-15"),
  setCurrentDate: vi.fn(),
  activeTab: "schedule" as const,
  onTabChange: vi.fn(),
  onOpenSettings: vi.fn(),
  onChangeTeam: vi.fn(),
  onChangeSchedule: vi.fn(),
};

function renderWithProviders(ui: React.ReactElement) {
  window.localStorage.setItem(
    "worktime_user_state",
    JSON.stringify({
      hasCompletedOnboarding: true,
      myTeam: 1,
      scheduleType: "5-shift",
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
        enableTimeOff: true,
        enableTimeTracking: true,
      },
      lastUsed: {
        activeTab: "calendar",
        scheduleView: "today",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
      },
    }),
  );

  return render(
    <ToastProvider>
      <DeveloperOptionsProvider>
        <SettingsProvider>
          <EventStoreProvider>{ui}</EventStoreProvider>
        </SettingsProvider>
      </DeveloperOptionsProvider>
    </ToastProvider>,
  );
}

describe("MainTabs", () => {
  beforeEach(async () => {
    const { useIsMobile } = await import("../../src/hooks/useIsMobile");
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it("renders schedule tab content by default", () => {
    renderWithProviders(<MainTabs {...defaultProps} />);
    expect(screen.getByTestId("schedule-tab-view")).toBeInTheDocument();
  });

  it("switches to Time Off tab when clicked", async () => {
    const user = userEvent.setup();
    const mockOnTabChange = vi.fn();
    renderWithProviders(<MainTabs {...defaultProps} onTabChange={mockOnTabChange} />);

    await user.click(screen.getByRole("tab", { name: "Time Off" }));
    expect(mockOnTabChange).toHaveBeenCalledWith("timeoff");
  });

  it("shows mobile FAB menu and triggers contextual actions", async () => {
    const user = userEvent.setup();
    const { useIsMobile } = await import("../../src/hooks/useIsMobile");
    vi.mocked(useIsMobile).mockReturnValue(true);

    const onOpenSettings = vi.fn();
    const onChangeTeam = vi.fn();
    renderWithProviders(
      <MainTabs {...defaultProps} onOpenSettings={onOpenSettings} onChangeTeam={onChangeTeam} />,
    );

    await user.click(screen.getByRole("button", { name: /Open quick actions/i }));
    expect(screen.getByRole("menu", { name: "Quick actions" })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Open Settings/i }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Quick actions" })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Open quick actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /Switch Team/i }));
    expect(onChangeTeam).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Quick actions" })).not.toBeInTheDocument();
    });
  });

  it("closes menu with Escape key regardless of focused element", async () => {
    const user = userEvent.setup();
    const { useIsMobile } = await import("../../src/hooks/useIsMobile");
    vi.mocked(useIsMobile).mockReturnValue(true);

    renderWithProviders(<MainTabs {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /Open quick actions/i }));
    expect(screen.getByRole("menu", { name: "Quick actions" })).toBeInTheDocument();

    // Focus is on the first menu item, not the FAB button
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Quick actions" })).not.toBeInTheDocument();
    });
  });

  it("supports arrow key navigation between menu items", async () => {
    const user = userEvent.setup();
    const { useIsMobile } = await import("../../src/hooks/useIsMobile");
    vi.mocked(useIsMobile).mockReturnValue(true);

    renderWithProviders(<MainTabs {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /Open quick actions/i }));
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(items[2]).toHaveFocus();

    // Wraps from last to first
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();

    // ArrowUp wraps from first to last
    await user.keyboard("{ArrowUp}");
    expect(items[items.length - 1]).toHaveFocus();
  });
});
