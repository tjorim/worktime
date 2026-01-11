import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

export type UserStateOverrides = Partial<{
  hasCompletedOnboarding: boolean;
  myTeam: number | null;
  scheduleType: string | null;
  settings: Record<string, unknown>;
}>;

type RenderOptions = {
  scheduleType?: "5-shift" | "9-5";
  withEventStore?: boolean;
  withToast?: boolean;
  userStateOverrides?: UserStateOverrides;
};

function seedUserState(
  scheduleType: "5-shift" | "9-5",
  userStateOverrides: UserStateOverrides = {},
) {
  window.localStorage.setItem(
    "worktime_user_state",
    JSON.stringify({
      hasCompletedOnboarding: true,
      myTeam: null,
      scheduleType,
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: {
          amount: 0,
          unit: "days",
          hoursPerDay: 8,
        },
      },
      ...userStateOverrides,
    }),
  );
}

export function renderWithSettings(
  ui: ReactElement,
  {
    scheduleType = "5-shift",
    userStateOverrides,
  }: Pick<RenderOptions, "scheduleType" | "userStateOverrides"> = {},
) {
  seedUserState(scheduleType, userStateOverrides);
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

export function renderWithProviders(
  ui: ReactElement,
  {
    scheduleType = "5-shift",
    withEventStore = false,
    withToast = false,
    userStateOverrides,
  }: RenderOptions = {},
) {
  seedUserState(scheduleType, userStateOverrides);

  let content = ui;
  if (withEventStore) {
    content = <EventStoreProvider>{content}</EventStoreProvider>;
  }
  content = <SettingsProvider>{content}</SettingsProvider>;
  if (withToast) {
    content = <ToastProvider>{content}</ToastProvider>;
  }

  return render(content);
}
