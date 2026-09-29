import { createMemoryHistory } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { preloadSyncCollections } from "@/db/collections";
import { router } from "@/router";

vi.mock("@/db/collections", () => ({ preloadSyncCollections: vi.fn() }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: () => null }));
vi.mock("@/pages/HomePage", () => ({ HomePage: () => null }));
vi.mock("@/pages/SettingsPage", () => ({ SettingsPage: () => null }));
vi.mock("@/pages/PrivacyPage", () => ({ PrivacyPage: () => null }));
vi.mock("@/pages/PebblePairPage", () => ({ PebblePairPage: () => null }));
vi.mock("@/pages/AuthCallbackPage", () => ({ AuthCallbackPage: () => null }));
vi.mock("@/pages/SilentRenewCallbackPage", () => ({ SilentRenewCallbackPage: () => null }));

describe("home route preloading", () => {
  beforeEach(async () => {
    vi.mocked(preloadSyncCollections).mockReset();
    router.update({ history: createMemoryHistory({ initialEntries: ["/privacy"] }) });
    router.clearCache();
    await router.load();
  });

  it("starts collection loading without waiting for it to finish", async () => {
    vi.mocked(preloadSyncCollections).mockReturnValue(new Promise(() => {}));

    await router.navigate({ to: "/" });

    expect(preloadSyncCollections).toHaveBeenCalledOnce();
    expect(router.state.status).toBe("idle");
    expect(router.state.matches.at(-1)?.status).toBe("success");
  });

  it("warms collections on intent preload and again on navigation", async () => {
    vi.mocked(preloadSyncCollections).mockResolvedValue();

    await router.preloadRoute({ to: "/" });
    expect(preloadSyncCollections).toHaveBeenCalledOnce();
    await router.navigate({ to: "/" });
    expect(preloadSyncCollections).toHaveBeenCalledTimes(2);
  });

  it("keeps collection failures out of route error state", async () => {
    vi.mocked(preloadSyncCollections).mockRejectedValue(new Error("Offline"));

    await router.navigate({ to: "/" });

    expect(router.state.matches.at(-1)?.status).toBe("success");
  });

  it("does not preload home data for other routes", async () => {
    await router.navigate({ to: "/settings" });

    expect(preloadSyncCollections).not.toHaveBeenCalled();
  });
});
