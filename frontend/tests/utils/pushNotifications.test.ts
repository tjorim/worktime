import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPushSubscription } from "@/utils/pushNotifications";

afterEach(() => vi.unstubAllGlobals());

describe("clearPushSubscription", () => {
  it("revokes locally without credentials and never starts an authenticated request", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi
              .fn()
              .mockResolvedValue({ endpoint: "https://push.example/one", unsubscribe }),
          },
        }),
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await clearPushSubscription(null);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["success", "offline", "expired"])(
    "revokes locally when server cleanup is %s",
    async (outcome) => {
      const unsubscribe = vi.fn().mockResolvedValue(true);
      vi.stubGlobal("PushManager", class {});
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue({
            pushManager: {
              getSubscription: vi
                .fn()
                .mockResolvedValue({ endpoint: "https://push.example/one", unsubscribe }),
            },
          }),
        },
      });
      const fetchMock = vi.fn();
      if (outcome === "offline") fetchMock.mockRejectedValue(new Error("offline"));
      else
        fetchMock.mockResolvedValue(
          new Response(null, { status: outcome === "expired" ? 401 : 204 }),
        );
      vi.stubGlobal("fetch", fetchMock);
      await clearPushSubscription("account-a-token");
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/push/subscribe?endpoint="),
        expect.objectContaining({
          method: "DELETE",
          headers: { Authorization: "Bearer account-a-token" },
        }),
      );
    },
  );
});
