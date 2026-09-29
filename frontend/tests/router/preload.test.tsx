import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { preloadSyncCollections } from "@/db/collections";
import { router as appRouter } from "@/router";
import { Header } from "@/components/Header";

vi.mock("@/db/collections", () => ({ preloadSyncCollections: vi.fn() }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: () => <Header /> }));
vi.mock("@/contexts/AppShellContext", () => ({
  useAppShellContext: () => ({ openShortcuts: vi.fn() }),
}));
vi.mock("@/components/sync/SyncStatusIndicator", () => ({ SyncStatusIndicator: () => null }));
vi.mock("@/hooks/useKeyboardShortcuts", () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock("@/pages/HomePage", () => ({ HomePage: () => null }));
vi.mock("@/pages/SettingsPage", () => ({ SettingsPage: () => null }));
vi.mock("@/pages/PrivacyPage", () => ({ PrivacyPage: () => null }));
vi.mock("@/pages/PebblePairPage", () => ({ PebblePairPage: () => null }));
vi.mock("@/pages/AuthCallbackPage", () => ({ AuthCallbackPage: () => null }));
vi.mock("@/pages/SilentRenewCallbackPage", () => ({ SilentRenewCallbackPage: () => null }));

describe("home route preloading", () => {
  let router: typeof appRouter;
  beforeEach(async () => {
    vi.mocked(preloadSyncCollections).mockReset();
    router = createRouter({
      ...appRouter.options,
      history: createMemoryHistory({ initialEntries: ["/privacy"] }),
    });
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

  it.each(["hover", "focus"])("preloads home when the brand receives %s", async (intent) => {
    vi.mocked(preloadSyncCollections).mockResolvedValue();
    const user = userEvent.setup();
    render(<RouterProvider router={router} />);
    const home = await screen.findByRole("button", { name: "Worktime" });

    if (intent === "hover") await user.hover(home);
    else {
      await user.tab(); // Skip-to-content link
      await user.tab(); // Home brand
      expect(document.activeElement).toBe(home);
    }

    await waitFor(() => expect(preloadSyncCollections).toHaveBeenCalledOnce());
    expect(router.state.location.pathname).toBe("/privacy");
  });

  it.each(["hover", "focus"])(
    "preloads home when the Settings back control receives %s",
    async (intent) => {
      vi.mocked(preloadSyncCollections).mockResolvedValue();
      await router.navigate({ to: "/settings" });
      const user = userEvent.setup();
      render(<RouterProvider router={router} />);
      const back = await screen.findByRole("button", { name: "Back to app" });

      if (intent === "hover") await user.hover(back);
      else {
        await user.tab();
        await user.tab();
        vi.mocked(preloadSyncCollections).mockClear();
        await user.tab();
        expect(document.activeElement).toBe(back);
      }

      await waitFor(() => expect(preloadSyncCollections).toHaveBeenCalledOnce());
      expect(router.state.location.pathname).toBe("/settings");
    },
  );
});
