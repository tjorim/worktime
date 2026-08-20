import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuth } from "@/contexts/AuthContext";
import { PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY } from "@/constants/storageKeys";
import type { AuthContextType } from "@/contexts/AuthContext";

vi.mock("@/hooks/useApiClient");
vi.mock("@/contexts/AuthContext");

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
    localStorage.removeItem(PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY);
    mockAuth("user-1");

    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: { ready: Promise.resolve(registration) },
    });
    vi.stubGlobal("PushManager", class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(useApiClient).mockReset();
    localStorage.removeItem(PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY);
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

    const outcome = await result.current.subscribeToPush({
      leadTimeMinutes: 15,
      quietHoursStart: null,
      quietHoursEnd: null,
    });
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

    const outcome = await result.current.subscribeToPush({
      leadTimeMinutes: 60,
      quietHoursStart: 22,
      quietHoursEnd: 6,
    });

    expect(outcome).toBe(true);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(apiFetch).toHaveBeenCalledTimes(2);
    const [subscribeUrl, subscribeInit] = apiFetch.mock.calls[1];
    expect(subscribeUrl).toBe("/api/push/subscribe");
    const body = JSON.parse((subscribeInit as RequestInit).body as string);
    expect(body).toMatchObject({
      endpoint: "https://push.example.com/ep1",
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
      lead_time_minutes: 60,
      quiet_hours_start: 22,
      quiet_hours_end: 6,
    });
    // Records who this device's subscription now belongs to (see the
    // account-reconciliation tests below).
    expect(localStorage.getItem(PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY)).toBe("user-1");
  });

  it("reuses an existing subscription instead of creating a new one", async () => {
    getSubscription.mockResolvedValue(mockSubscription);
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ publicKey: "test-vapid-key" }))
      .mockResolvedValueOnce(jsonResponse({ id: "sub-1" }, { status: 201 }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    const outcome = await result.current.subscribeToPush({
      leadTimeMinutes: 15,
      quietHoursStart: null,
      quietHoursEnd: null,
    });

    expect(outcome).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("returns false when the server doesn't have push configured (null key)", async () => {
    const apiFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ publicKey: null }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    const outcome = await result.current.subscribeToPush({
      leadTimeMinutes: 15,
      quietHoursStart: null,
      quietHoursEnd: null,
    });

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
    const outcome = await result.current.subscribeToPush({
      leadTimeMinutes: 15,
      quietHoursStart: null,
      quietHoursEnd: null,
    });

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
    const outcome = await result.current.subscribeToPush({
      leadTimeMinutes: 60,
      quietHoursStart: null,
      quietHoursEnd: null,
    });

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
    const [url, init] = apiFetch.mock.calls[0];
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

  it("clears the owner marker on unsubscribe", async () => {
    localStorage.setItem(PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY, "user-1");
    getSubscription.mockResolvedValue(mockSubscription);
    const apiFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.mocked(useApiClient).mockReturnValue(apiFetch);

    const { result } = renderHook(() => usePushSubscription());
    await result.current.unsubscribeFromPush();

    expect(localStorage.getItem(PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY)).toBeNull();
  });

  describe("account-boundary reconciliation", () => {
    it("tears down a subscription left behind by a different account", async () => {
      localStorage.setItem(PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY, "user-1");
      getSubscription.mockResolvedValue(mockSubscription);
      const apiFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.mocked(useApiClient).mockReturnValue(apiFetch);
      mockAuth("user-2");

      renderHook(() => usePushSubscription());

      await waitFor(() => expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
      const [url, init] = apiFetch.mock.calls[0];
      expect(url).toBe(
        `/api/push/subscribe?endpoint=${encodeURIComponent("https://push.example.com/ep1")}`,
      );
      expect((init as RequestInit).method).toBe("DELETE");
    });

    it("tears down a subscription left behind after signing out", async () => {
      localStorage.setItem(PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY, "user-1");
      getSubscription.mockResolvedValue(mockSubscription);
      const apiFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.mocked(useApiClient).mockReturnValue(apiFetch);
      mockAuth(null);

      renderHook(() => usePushSubscription());

      await waitFor(() => expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(1));
    });

    it("leaves the subscription alone when the marker matches the signed-in account", async () => {
      localStorage.setItem(PUSH_SUBSCRIPTION_OWNER_STORAGE_KEY, "user-1");
      getSubscription.mockResolvedValue(mockSubscription);
      vi.mocked(useApiClient).mockReturnValue(vi.fn());

      renderHook(() => usePushSubscription());
      await act(async () => {});

      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
    });

    it("leaves the subscription alone when no owner has ever been recorded", async () => {
      getSubscription.mockResolvedValue(mockSubscription);
      vi.mocked(useApiClient).mockReturnValue(vi.fn());

      renderHook(() => usePushSubscription());
      await act(async () => {});

      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
    });
  });
});
