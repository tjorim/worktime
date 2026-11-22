import type { PreferencesResponse } from "@/api-types";
import { jsonBody } from "@/mocks/response";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLastUsed } from "@/app/providers/LastUsedContext";
import { SettingsProvider, useSettings } from "@/app/providers/SettingsContext";
import {
  ANONYMOUS_USER_STATE_OWNER,
  DEVICE_PREFERENCES_STORAGE_KEY,
  USER_STATE_OWNER_STORAGE_KEY,
  USER_STATE_STORAGE_KEY,
} from "@/config/storageKeys";

import { reconcilePreferences } from "@/lib/sync/syncClient";
import { withPreferenceLock } from "@/lib/storage/preferenceStorage";

describe("SettingsContext unified user state", () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <SettingsProvider>{children}</SettingsProvider>;
  }

  afterEach(() => {
    window.localStorage.clear();
    document.body.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  function readDeviceState() {
    return JSON.parse(localStorage.getItem(DEVICE_PREFERENCES_STORAGE_KEY) ?? "{}");
  }

  it.each(["account", "device"])(
    "only new account settings create anonymous ownership (%s edit)",
    async (kind) => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        if (kind === "account") result.current.setMyTeam(3);
        else result.current.updateTheme("dark");
      });
      expect(localStorage.getItem(USER_STATE_OWNER_STORAGE_KEY)).toBe(
        kind === "account" ? ANONYMOUS_USER_STATE_OWNER : null,
      );
    },
  );

  it("does not claim legacy preferences as anonymous when editing them", async () => {
    localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ myTeam: 2 }));
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => result.current.setMyTeam(3));
    expect(localStorage.getItem(USER_STATE_OWNER_STORAGE_KEY)).toBeNull();
  });

  it("keeps the atomic account owner through normal edits and a full reset", async () => {
    localStorage.setItem(
      USER_STATE_STORAGE_KEY,
      JSON.stringify({ _accountOwner: "user-b", scheduleType: "3-shift" }),
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {
      result.current.setMyTeam(3);
      result.current.updateTheme("dark");
      result.current.resetSettings();
    });
    expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toHaveProperty(
      "_accountOwner",
      "user-b",
    );
  });

  it.each(["account", "device"])(
    "serializes %s edits with a switch before the old tab receives its storage event",
    async (kind) => {
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({ _accountOwner: "user-a", myTeam: 1 }),
      );
      const { result } = renderHook(() => useSettings(), { wrapper });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await act(async () => {
        const switching = withPreferenceLock(async () => {
          await gate;
          // Another tab commits without this tab receiving its storage event yet.
          localStorage.setItem(
            USER_STATE_STORAGE_KEY,
            JSON.stringify({
              _accountOwner: "user-b",
              myTeam: 2,
              scheduleType: "3-shift",
              _updatedAt: "2026-01-01T00:00:00Z",
              settings: { timeFormat: "12h", theme: "light" },
            }),
          );
        });
        await Promise.resolve();
        if (kind === "account") result.current.setMyTeam(4);
        else result.current.updateTheme("dark");
        expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toEqual({
          _accountOwner: "user-a",
          myTeam: 1,
        });
        release();
        await switching;
        await withPreferenceLock(() => {});
      });
      const saved = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
      expect(saved._accountOwner).toBe("user-b");
      expect(saved.scheduleType).toBe("3-shift");
      expect(saved.settings.timeFormat).toBe("12h");
      expect(saved.myTeam).toBe(kind === "account" ? 4 : 2);
      if (kind === "device") {
        expect(readDeviceState().theme).toBe("dark");
        expect(saved._updatedAt).toBe("2026-01-01T00:00:00Z");
      }
    },
  );

  it.each([false, true])(
    "keeps failed edits across later writes (another tab edits same owner=%s)",
    async (externalEdit) => {
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          _accountOwner: "user-a",
          myTeam: 1,
          settings: { timeFormat: "24h" },
        }),
      );
      const { result } = renderHook(() => ({ settings: useSettings(), last: useLastUsed() }), {
        wrapper,
      });
      const originalSetItem = localStorage.setItem.bind(localStorage);
      let fail = true;
      vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
        if (key === USER_STATE_STORAGE_KEY && fail)
          throw new DOMException("Full", "QuotaExceededError");
        originalSetItem(key, value);
      });
      await act(async () => result.current.settings.setMyTeam(3));
      expect(result.current.settings.myTeam).toBe(3);
      if (externalEdit)
        originalSetItem(
          USER_STATE_STORAGE_KEY,
          JSON.stringify({
            _accountOwner: "user-a",
            myTeam: 1,
            settings: { timeFormat: "12h" },
          }),
        );
      await act(async () => result.current.last.updateLastActiveTab("schedule"));
      expect(result.current.settings.myTeam).toBe(3);
      if (externalEdit) expect(result.current.settings.settings.timeFormat).toBe("12h");
      fail = false;
      await act(async () => result.current.settings.updateTheme("dark"));
      const saved = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
      expect(saved.myTeam).toBe(3);
      expect(saved._accountOwner).toBe("user-a");
      expect(readDeviceState().lastUsed.activeTab).toBe("schedule");
      expect(readDeviceState().theme).toBe("dark");
      if (externalEdit) expect(saved.settings.timeFormat).toBe("12h");
    },
  );

  it("keeps a newer stored timestamp when replaying a failed edit before reconciliation", async () => {
    const failedAt = "2026-01-01T10:00:00.000Z";
    const serverAt = "2026-01-01T10:01:00.000Z";
    const savedAt = "2026-01-01T10:02:00.000Z";
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue(failedAt);
    localStorage.setItem(
      USER_STATE_STORAGE_KEY,
      JSON.stringify({ _accountOwner: "user-a", myTeam: 1 }),
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const failedWrite = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === USER_STATE_STORAGE_KEY) throw new DOMException("Full", "QuotaExceededError");
      originalSetItem(key, value);
    });
    await act(async () => result.current.setMyTeam(3));
    failedWrite.mockRestore();
    originalSetItem(
      USER_STATE_STORAGE_KEY,
      JSON.stringify({
        _accountOwner: "user-a",
        myTeam: 1,
        _updatedAt: savedAt,
        settings: { timeFormat: "12h" },
      }),
    );
    await act(async () => result.current.updateTheme("dark"));
    const saved = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
    expect(saved._updatedAt).toBe(savedAt);
    expect(saved.myTeam).toBe(3);
    expect(saved.settings.timeFormat).toBe("12h");
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        ({
          ok: true,
          json: async () =>
            jsonBody<PreferencesResponse | null>(
              init?.method === "PUT"
                ? null
                : {
                    user_id: 1,
                    created_at: "2026-01-01T00:00:00Z",
                    updated_at: "2026-01-01T00:00:00Z",
                    data: { myTeam: 1, settings: { timeFormat: "24h" } },
                    client_updated_at: serverAt,
                  },
            ),
        }) as Response,
    );
    await act(async () => {
      await reconcilePreferences(fetch, "user-a");
    });
    expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toEqual(saved);
    const upload = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(upload![1]!.body as string)).toMatchObject({
      client_updated_at: savedAt,
      data: { myTeam: 3, settings: { timeFormat: "12h" } },
    });
  });

  it("does not replay failed edits into a different account", async () => {
    localStorage.setItem(
      USER_STATE_STORAGE_KEY,
      JSON.stringify({ _accountOwner: "user-a", myTeam: 1 }),
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const failedWrite = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (key === USER_STATE_STORAGE_KEY) throw new DOMException("Full", "QuotaExceededError");
      originalSetItem(key, value);
    });
    await act(async () => result.current.setMyTeam(3));
    expect(result.current.myTeam).toBe(3);
    failedWrite.mockRestore();
    originalSetItem(USER_STATE_STORAGE_KEY, JSON.stringify({ _accountOwner: "user-b", myTeam: 2 }));
    await act(async () => result.current.updateTheme("dark"));
    const saved = JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!);
    expect(saved._accountOwner).toBe("user-b");
    expect(saved.myTeam).toBe(2);
  });

  it("provides default values and mutators", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings.timeFormat).toBe("24h");
    expect(result.current.settings.theme).toBe("auto");
    expect(result.current.settings.notifications).toBe(false);
    expect(result.current.settings.homeCountry).toBe(null);
    expect(result.current.settings.officeCountry).toBe(null);
    expect(result.current.settings.enableCrossBorderTracking).toBe(false);
    expect(result.current.settings.enableGantt).toBe(false);
    expect(result.current.myTeam).toBe(null);
    expect(result.current.scheduleType).toBe(null);
    expect(result.current.hasCompletedOnboarding).toBe(false);
  });

  it("updates settings and user state", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {
      result.current.updateTimeFormat("12h");
    });
    expect(result.current.settings.timeFormat).toBe("12h");
    await act(async () => {
      result.current.updateTheme("dark");
    });
    expect(result.current.settings.theme).toBe("dark");
    await act(async () => {
      result.current.updateNotifications(true);
    });
    expect(result.current.settings.notifications).toBe(true);
    await act(async () => {
      result.current.setMyTeam(3);
    });
    expect(result.current.myTeam).toBe(3);
    await act(async () => {
      result.current.setHasCompletedOnboarding(true);
    });
    expect(result.current.hasCompletedOnboarding).toBe(true);

    await act(async () => {
      result.current.updateGanttEnabled(true);
    });
    expect(result.current.settings.enableGantt).toBe(true);
    await act(async () => {
      result.current.updateHomeCountry("NL");
    });
    expect(result.current.settings.homeCountry).toBe("NL");
    await act(async () => {
      result.current.updateOfficeCountry("BE");
    });
    expect(result.current.settings.officeCountry).toBe("BE");
    await act(async () => {
      result.current.updateHomeCountry(null);
    });
    expect(result.current.settings.homeCountry).toBe(null);
  });

  it("updates schedule option and persists it", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    await act(async () => {
      result.current.setScheduleType("5-shift");
    });

    expect(result.current.scheduleType).toBe("5-shift");

    const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored || "{}");
    expect(parsed.scheduleType).toBe("5-shift");
  });

  it("resets all user state", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {
      result.current.setMyTeam(2);
      result.current.setHasCompletedOnboarding(true);
      result.current.resetSettings();
    });
    expect(result.current.myTeam).toBe(null);
    expect(result.current.hasCompletedOnboarding).toBe(false);
    expect(result.current.settings.timeFormat).toBe("24h");
    expect(result.current.scheduleType).toBe(null);
  });

  it("validates and falls back to default state if corrupted", () => {
    // Simulate corrupted state in localStorage
    window.localStorage.setItem(USER_STATE_STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.myTeam).toBe(null);
    expect(result.current.hasCompletedOnboarding).toBe(false);
    expect(result.current.settings.timeFormat).toBe("24h");
    expect(result.current.scheduleType).toBe(null);
  });

  it("resetSettings restores account and device defaults", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {
      result.current.setMyTeam(1);
      result.current.setHasCompletedOnboarding(true);
      result.current.updateTimeFormat("12h");
    });
    await act(async () => {
      result.current.resetSettings();
    });

    // Check the unified storage key
    const userStateStored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
    expect(userStateStored).not.toBeNull();
    const parsedState = JSON.parse(userStateStored || "{}");
    expect(parsedState).toEqual({
      _updatedAt: expect.any(String),
      hasCompletedOnboarding: false,
      myTeam: null,
      scheduleType: null,
      settings: {
        timeFormat: "24h",
        enableTimeOff: false,
        enableTimeTracking: false,
        enableGantt: false,
        enableCrossBorderTracking: false,
        enableUnifiedCalendar: false,
        homeCountry: null,
        officeCountry: null,
        hdayUsername: null,
      },
    });
    expect(readDeviceState()).toMatchObject({
      theme: "auto",
      notifications: false,
      lastUsed: {
        activeTab: "calendar",
        scheduleView: "schedule",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
        ganttViewMode: "Day",
        ganttView: "chart",
      },
    });
  });

  it("updates theme setting without DOM side effects", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    // Initially should be 'auto'
    expect(result.current.settings.theme).toBe("auto");

    // Update to dark theme
    await act(async () => {
      result.current.updateTheme("dark");
    });
    expect(result.current.settings.theme).toBe("dark");

    // Update to light theme
    await act(async () => {
      result.current.updateTheme("light");
    });
    expect(result.current.settings.theme).toBe("light");

    // SettingsContext should not apply theme to DOM - that's App.tsx responsibility
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  describe("Device-local settings (not synced across devices)", () => {
    it("migrates existing device preferences without changing the account timestamp or owner", async () => {
      const account = {
        _accountOwner: "user-a",
        _updatedAt: "2026-01-01T00:00:00.000Z",
        settings: { enableTimeOff: true },
      };
      localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          ...account,
          settings: { ...account.settings, theme: "dark", notifications: "on" },
          lastUsed: { activeTab: "timeoff", timeOffView: "team" },
        }),
      );
      localStorage.setItem(
        DEVICE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          appearance: { highContrast: true },
          theme: "light",
        }),
      );
      const { result } = renderHook(() => ({ settings: useSettings(), last: useLastUsed() }), {
        wrapper,
      });
      await act(async () => withPreferenceLock(() => {}));
      expect(result.current.settings.settings.theme).toBe("light");
      expect(result.current.settings.settings.notifications).toBe(true);
      expect(result.current.last.lastUsed.activeTab).toBe("timeoff");
      expect(JSON.parse(localStorage.getItem(USER_STATE_STORAGE_KEY)!)).toEqual(account);
      expect(readDeviceState()).toEqual({
        appearance: { highContrast: true },
        theme: "light",
        notifications: true,
        lastUsed: { activeTab: "timeoff", timeOffView: "team" },
      });
    });

    it("does not stamp _updatedAt when updateTheme changes", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateTheme("dark");
      });
      const stored = JSON.parse(window.localStorage.getItem(USER_STATE_STORAGE_KEY) || "{}");
      expect(stored._updatedAt).toBeUndefined();
      expect(readDeviceState().theme).toBe("dark");
    });

    it("does not stamp _updatedAt when updateNotifications changes", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateNotifications(true);
      });
      const stored = JSON.parse(window.localStorage.getItem(USER_STATE_STORAGE_KEY) || "{}");
      expect(stored._updatedAt).toBeUndefined();
      expect(readDeviceState().notifications).toBe(true);
    });

    it("still stamps _updatedAt for a real synced setting like updateTimeOffEnabled", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateTimeOffEnabled(true);
      });
      const stored = JSON.parse(window.localStorage.getItem(USER_STATE_STORAGE_KEY) || "{}");
      expect(stored._updatedAt).toEqual(expect.any(String));
      expect(stored.settings.enableTimeOff).toBe(true);
    });
  });

  describe("Cross-border tracking settings", () => {
    it("defaults enableCrossBorderTracking to false", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.enableCrossBorderTracking).toBe(false);
    });

    it("toggles enableCrossBorderTracking via updateCrossBorderTrackingEnabled", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      await act(async () => {
        result.current.updateCrossBorderTrackingEnabled(true);
      });
      expect(result.current.settings.enableCrossBorderTracking).toBe(true);

      await act(async () => {
        result.current.updateCrossBorderTrackingEnabled(false);
      });
      expect(result.current.settings.enableCrossBorderTracking).toBe(false);
    });

    it("persists enableCrossBorderTracking to localStorage", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateCrossBorderTrackingEnabled(true);
      });
      const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.enableCrossBorderTracking).toBe(true);
    });
  });

  describe("Unified calendar settings", () => {
    it("defaults enableUnifiedCalendar to false", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.enableUnifiedCalendar).toBe(false);
    });

    it("toggles enableUnifiedCalendar via updateUnifiedCalendarEnabled", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });

      await act(async () => {
        result.current.updateUnifiedCalendarEnabled(true);
      });
      expect(result.current.settings.enableUnifiedCalendar).toBe(true);

      await act(async () => {
        result.current.updateUnifiedCalendarEnabled(false);
      });
      expect(result.current.settings.enableUnifiedCalendar).toBe(false);
    });

    it("persists enableUnifiedCalendar to localStorage", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateUnifiedCalendarEnabled(true);
      });
      const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.enableUnifiedCalendar).toBe(true);
    });
  });

  describe("lastUsed and updaters", () => {
    it("prefers lastUsed over settings when both present", () => {
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          hasCompletedOnboarding: true,
          myTeam: 1,
          scheduleType: "5-shift",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            vacationAllowance: { amount: 0, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            timeTrackingWeeklyTargetHours: 40,
            lastActiveTab: "calendar",
            lastScheduleView: "today",
            lastTimeOffView: "table",
            lastTimeTrackingView: "daily",
          },
          lastUsed: {
            activeTab: "schedule",
            scheduleView: "transfer",
            otherSchedule: "9-5",
            timeOffView: "raw",
            timeTrackingView: "weekly",
            otherTeam: 3,
          },
        }),
      );

      const { result } = renderHook(() => useLastUsed(), { wrapper });

      expect(result.current.lastUsed.activeTab).toBe("schedule");
      expect(result.current.lastUsed.scheduleView).toBe("transfer");
      expect(result.current.lastUsed.otherSchedule).toBe("9-5");
      expect(result.current.lastUsed.timeOffView).toBe("table"); // "raw" was removed, defaults to "table"
      expect(result.current.lastUsed.timeTrackingView).toBe("weekly");
      expect(result.current.lastUsed.otherTeam).toBe(3);
    });

    it("updates lastUsed.activeTab via updateLastActiveTab", async () => {
      const { result } = renderHook(() => useLastUsed(), { wrapper });
      await act(async () => {
        result.current.updateLastActiveTab("schedule");
      });
      expect(result.current.lastUsed.activeTab).toBe("schedule");
    });

    it("does not stamp _updatedAt when only lastUsed changes", async () => {
      const { result } = renderHook(() => useLastUsed(), { wrapper });
      await act(async () => {
        result.current.updateLastActiveTab("schedule");
      });

      const stored = JSON.parse(window.localStorage.getItem(USER_STATE_STORAGE_KEY) || "{}");
      // lastUsed is per-device UI state, not a synced preference — updating it
      // must not bump _updatedAt, or a plain tab switch could make this
      // device's stale settings look "newer" than a real change synced from
      // another device and win last-write-wins reconciliation.
      expect(stored._updatedAt).toBeUndefined();
      expect(readDeviceState().lastUsed.activeTab).toBe("schedule");
    });

    it("updates lastUsed.otherSchedule via updateLastOtherSchedule", async () => {
      const { result } = renderHook(() => useLastUsed(), { wrapper });
      await act(async () => {
        result.current.updateLastOtherSchedule("9-5");
      });
      expect(result.current.lastUsed.otherSchedule).toBe("9-5");

      await act(async () => {
        result.current.updateLastOtherSchedule(null);
      });
      expect(result.current.lastUsed.otherSchedule).toBe(null);
    });

    it("updates lastUsed.otherTeam via updateLastOtherTeam", async () => {
      const { result } = renderHook(() => useLastUsed(), { wrapper });
      await act(async () => {
        result.current.updateLastOtherTeam(3);
      });
      expect(result.current.lastUsed.otherTeam).toBe(3);

      await act(async () => {
        result.current.updateLastOtherTeam(null);
      });
      expect(result.current.lastUsed.otherTeam).toBe(null);
    });

    it("updates lastUsed.ganttViewMode via updateLastGanttViewMode", async () => {
      const { result } = renderHook(() => useLastUsed(), { wrapper });
      await act(async () => {
        result.current.updateLastGanttViewMode("Week");
      });
      expect(result.current.lastUsed.ganttViewMode).toBe("Week");

      await act(async () => {
        result.current.updateLastGanttViewMode("Half Day");
      });
      expect(result.current.lastUsed.ganttViewMode).toBe("Half Day");
    });

    it("updates lastUsed.ganttView via updateLastGanttView", async () => {
      const { result } = renderHook(() => useLastUsed(), { wrapper });
      await act(async () => {
        result.current.updateLastGanttView("table");
      });
      expect(result.current.lastUsed.ganttView).toBe("table");
    });

    it("provides default lastUsed on fresh state", () => {
      const { result } = renderHook(() => useLastUsed(), { wrapper });
      expect(result.current.lastUsed).toEqual({
        activeTab: "calendar",
        scheduleView: "schedule",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
        ganttViewMode: "Day",
        ganttView: "chart",
      });
    });

    it("does not re-render settings-only consumers when lastUsed changes", async () => {
      const renderSpy = vi.fn();

      function SettingsOnlyConsumer() {
        renderSpy();
        const { settings } = useSettings();
        return <span>{settings.timeFormat}</span>;
      }

      function LastUsedUpdater() {
        const { updateLastActiveTab } = useLastUsed();
        return <button onClick={() => updateLastActiveTab("schedule")}>Update last used</button>;
      }

      render(
        <SettingsProvider>
          <SettingsOnlyConsumer />
          <LastUsedUpdater />
        </SettingsProvider>,
      );

      expect(renderSpy).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Update last used" }));
      });
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Country preferences", () => {
    it("defaults homeCountry and officeCountry to null", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.homeCountry).toBe(null);
      expect(result.current.settings.officeCountry).toBe(null);
    });

    it("updates homeCountry with a valid code", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateHomeCountry("DE");
      });
      expect(result.current.settings.homeCountry).toBe("DE");
    });

    it("updates officeCountry with a valid code", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateOfficeCountry("LU");
      });
      expect(result.current.settings.officeCountry).toBe("LU");
    });

    it("allows clearing homeCountry back to null", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateHomeCountry("FR");
      });
      expect(result.current.settings.homeCountry).toBe("FR");
      await act(async () => {
        result.current.updateHomeCountry(null);
      });
      expect(result.current.settings.homeCountry).toBe(null);
    });

    it("rejects invalid homeCountry code and falls back to null", () => {
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          hasCompletedOnboarding: false,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "XX",
            officeCountry: "INVALID",
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
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.homeCountry).toBe(null);
      expect(result.current.settings.officeCountry).toBe(null);
    });

    it("persists country changes to localStorage", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateHomeCountry("GB");
        result.current.updateOfficeCountry("NL");
      });
      const stored = window.localStorage.getItem(USER_STATE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.homeCountry).toBe("GB");
      expect(parsed.settings.officeCountry).toBe("NL");
    });
  });

  describe(".hday username (account-synced, not device-local)", () => {
    it("defaults hdayUsername to null", () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.hdayUsername).toBe(null);
    });

    it("updates and clears hdayUsername", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateHdayUsername("jsmith");
      });
      expect(result.current.settings.hdayUsername).toBe("jsmith");
      await act(async () => {
        result.current.updateHdayUsername(null);
      });
      expect(result.current.settings.hdayUsername).toBe(null);
    });

    it("falls back to null for a blank or non-string stored value", () => {
      window.localStorage.setItem(
        USER_STATE_STORAGE_KEY,
        JSON.stringify({
          hasCompletedOnboarding: false,
          myTeam: null,
          scheduleType: null,
          settings: { timeFormat: "24h", theme: "auto", hdayUsername: "   " },
          lastUsed: {},
        }),
      );
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.hdayUsername).toBe(null);
    });

    it("persists hdayUsername to the shared localStorage state, bumping _updatedAt like other synced settings", async () => {
      const { result } = renderHook(() => useSettings(), { wrapper });
      await act(async () => {
        result.current.updateHdayUsername("jsmith");
      });
      const stored = JSON.parse(window.localStorage.getItem(USER_STATE_STORAGE_KEY)!);
      expect(stored.settings.hdayUsername).toBe("jsmith");
      expect(stored._updatedAt).toBeTruthy();
    });
  });
});
