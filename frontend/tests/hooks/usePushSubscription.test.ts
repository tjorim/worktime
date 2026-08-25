import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings, defaultSettings } from "@/contexts/SettingsContext";
import type { AuthContextType } from "@/contexts/AuthContext";
import type { UserSettings } from "@/contexts/SettingsContext";

vi.mock("@/hooks/useApiClient");
vi.mock("@/contexts/AuthContext");
vi.mock("@/contexts/SettingsContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/SettingsContext")>();
  return { ...actual, useSettings: vi.fn() };
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function mockAuth(userId: string | null): void {
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: userId !== null,
    isValidating: false,
    userId,
    displayName: null,
    getAccessToken: () => null,
    triggerLogin: vi.fn(),
    triggerSignup: vi.fn(),
    logout: vi.fn(),
    renewSession: vi.fn(),
  } satisfies AuthContextType);
}

function mockSettings(overrides: Partial<UserSettings> = {}): void {
  vi.mocked(useSettings).mockReturnValue({
    settings: { ...defaultSettings, ...overrides },
    updateTimeFormat: vi.fn(),
    updateTheme: vi.fn(),
    updateNotifications: vi.fn(),
    updateTimeOffEnabled: vi.fn(),
    updateTimeTrackingEnabled: vi.fn(),
    updateGanttEnabled: vi.fn(),
    updateCrossBorderTrackingEnabled: vi.fn(),
    updateUnifiedCalendarEnabled: vi.fn(),
    updateHomeCountry: vi.fn(),
    updateOfficeCountry: vi.fn(),
    resetSettings: vi.fn(),
    myTeam: null,
    setMyTeam: vi.fn(),
    scheduleType: null,
    setScheduleType: vi.fn(),
    hasCompletedOnboarding: true,
    setHasCompletedOnboarding: vi.fn(),
    accountSyncAnnouncementSeen: true,
    setAccountSyncAnnouncementSeen: vi.fn(),
    ganttAnnouncementSeen: true,
    setGanttAnnouncementSeen: vi.fn(),
    crossBorderAnnouncementSeen: true,
    setCrossBorderAnnouncementSeen: vi.fn(),
    completeOnboardingWithTeam: vi.fn(),
    completeOnboardingWithSchedule: vi.fn(),
  } as ReturnType<typeof useSettings>);
}

describe("usePushSubscription", () => {
  const mockSubscription = {
    endpoint: "https://push.example.com/ep1",
    toJSON: () => ({
      endpoint: "https://push.example.com/ep1",
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
    }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };

  const getSubscription = vi.fn();
  const subscribe = vi.fn();
  const registration = { pushManager: { getSubscription, subscribe } };

  beforeEach(() => {
    getSubscription.mockReset().mockResolvedValue(null);
    subscribe.mockReset().mockResolvedValue(mockSubscription);
    mockSubscription.unsubscribe.mockClear();
    mockAuth("user-1");
    // Notifications default to "off" so the reconciliation effect doesn't fire its own
    // requests and interfere with tests that drive subscribeToPush/unsubscribeFromPush
    // directly - tests exercising reconciliation itself opt into "on" explicitly.
    mockSettings({ notifications: "off" });

    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { ready: Promise.resolve(registration) },
    });
    vi.stubGlobal("PushManager", class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(useApiClient).mockReset();
  });

  it("reports supported when serviceWorker and PushManager are both available", () => {
    vi.mocked(useApiClient).mockReturnValue(vi.fn());
    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.isSupported).toBe(true);
  });

  it("reports unsupported and no-ops when PushManager is unavailable", async () => {
    // vi.stubGlobal always defines the key (even to `undefined`), which
    // `"PushManager" in window` would still see - delete it outright instead.
    Reflect.deleteProperty(window, "PushManager");
    const apiFetch = vi.fn();
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    expect(result.current.isSupported).toBe(false);

    const outcome = await result.current.subscribeToPush();
    expect(outcome).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("subscribes and registers with the backend", async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ publicKey: "test-vapid-key" }))
      .mockResolvedValueOnce(jsonResponse({ id: "sub-1" }, { status: 201 }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());

    const outcome = await result.current.subscribeToPush();

    expect(outcome).toBe(true);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(apiFetch).toHaveBeenCalledTimes(2);
    const [subscribeUrl, subscribeInit] = apiFetch.mock.calls[1]!;
    expect(subscribeUrl).toBe("/api/push/subscribe");
    const body = JSON.parse((subscribeInit as RequestInit).body as string);
    expect(body).toMatchObject({
      endpoint: "https://push.example.com/ep1",
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
    });
    await waitFor(() => expect(result.current.hasActiveSubscription).toBe(true));
  });

  it("reuses an existing subscription instead of creating a new one", async () => {
    getSubscription.mockResolvedValue(mockSubscription);
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ publicKey: "test-vapid-key" }))
      .mockResolvedValueOnce(jsonResponse({ id: "sub-1" }, { status: 201 }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    const outcome = await result.current.subscribeToPush();

    expect(outcome).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("returns false when the server doesn't have push configured (null key)", async () => {
    const apiFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ publicKey: null }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    const outcome = await result.current.subscribeToPush();

    expect(outcome).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("returns false and rolls back a freshly created subscription when the backend rejects it", async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ publicKey: "test-vapid-key" }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    const outcome = await result.current.subscribeToPush();

    expect(outcome).toBe(false);
    // Without this, a browser-side subscription with no backend record would make
    // getActiveSubscription() report "active" while nothing can ever be delivered.
    expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("leaves a pre-existing subscription alone when a settings update is rejected", async () => {
    getSubscription.mockResolvedValue(mockSubscription);
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ publicKey: "test-vapid-key" }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    const outcome = await result.current.subscribeToPush();

    expect(outcome).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
    // The backend most likely already has this subscription registered from a prior
    // successful call - a failed update shouldn't tear down a working subscription.
    expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes locally and server-side when a subscription exists", async () => {
    getSubscription.mockResolvedValue(mockSubscription);
    const apiFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    await result.current.unsubscribeFromPush();

    expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = apiFetch.mock.calls[0]!;
    expect(url).toBe(
      `/api/push/subscribe?endpoint=${encodeURIComponent("https://push.example.com/ep1")}`,
    );
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("is a no-op when there is no subscription to remove", async () => {
    getSubscription.mockResolvedValue(null);
    const apiFetch = vi.fn();
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    await result.current.unsubscribeFromPush();

    expect(apiFetch).not.toHaveBeenCalled();
  });

  describe("account-boundary reconciliation", () => {
    // A push subscription is a browser/device-level object, not scoped to whichever
    // app account is signed in. These tests cover the fix for a shared-device gap:
    // a subscription left behind by one account must be reassigned (or reported
    // inactive) rather than silently treated as belonging to whoever's signed in now.
    it("re-registers an existing subscription for the signed-in account on mount", async () => {
      getSubscription.mockResolvedValue(mockSubscription);
      mockSettings({ notifications: "on" });
      const apiFetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ publicKey: "test-vapid-key" }))
        .mockResolvedValueOnce(jsonResponse({ id: "sub-1" }, { status: 201 }));
      vi.mocked(useApiClient).mockReturnValue(apiFetch);

      const { result } = renderHook(() => usePushSubscription());

      await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
      const [, subscribeInit] = apiFetch.mock.calls[1]!;
      const body = JSON.parse((subscribeInit as RequestInit).body as string);
      expect(body).toMatchObject({ endpoint: "https://push.example.com/ep1" });
      await waitFor(() => expect(result.current.hasActiveSubscription).toBe(true));
      // This is what actually reassigns ownership server-side when the subscription
      // belonged to a *different* account: PushSubscriptionCreate.upsert_subscription
      // reassigns by endpoint regardless of who owned it before.
      expect(subscribe).not.toHaveBeenCalled(); // reuses the existing browser subscription
    });

    it("does not touch an existing subscription when notifications are off", async () => {
      getSubscription.mockResolvedValue(mockSubscription);
      mockSettings({ notifications: "off" });
      const apiFetch = vi.fn();
      vi.mocked(useApiClient).mockReturnValue(apiFetch);

      const { result } = renderHook(() => usePushSubscription());

      await waitFor(() => expect(result.current.hasActiveSubscription).toBe(true));
      expect(apiFetch).not.toHaveBeenCalled();
    });

    it("does not create a subscription when none exists, even with notifications on", async () => {
      getSubscription.mockResolvedValue(null);
      mockSettings({ notifications: "on" });
      const apiFetch = vi.fn();
      vi.mocked(useApiClient).mockReturnValue(apiFetch);

      renderHook(() => usePushSubscription());

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(apiFetch).not.toHaveBeenCalled();
      expect(subscribe).not.toHaveBeenCalled();
    });

    it("re-reconciles when the signed-in account changes", async () => {
      getSubscription.mockResolvedValue(mockSubscription);
      mockSettings({ notifications: "on" });
      const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ publicKey: "test-vapid-key" }));
      vi.mocked(useApiClient).mockReturnValue(apiFetch);

      const { rerender } = renderHook(() => usePushSubscription());
      await waitFor(() => expect(apiFetch).toHaveBeenCalled());
      const callsAfterFirstAccount = apiFetch.mock.calls.length;

      mockAuth("user-2");
      rerender();

      await waitFor(() => expect(apiFetch.mock.calls.length).toBeGreaterThan(callsAfterFirstAccount));
    });
  });
});
