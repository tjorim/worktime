import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => {
  const state: {
    mode: "ok" | "slow" | "fail";
    release: () => void;
    imports: number;
  } = { mode: "ok", release: () => {}, imports: 0 };
  return state;
});

vi.mock("@/db/collections", () => ({ preloadSyncCollections: vi.fn() }));
vi.mock("@/components/AppLayout", async () => {
  const { Outlet } = await import("@tanstack/react-router");
  return { AppLayout: () => <Outlet /> };
});
vi.mock("@/pages/HomePage", () => ({ HomePage: () => <p>home</p> }));
vi.mock("@/pages/AuthCallbackPage", () => ({ AuthCallbackPage: () => null }));
vi.mock("@/pages/SilentRenewCallbackPage", () => ({ SilentRenewCallbackPage: () => null }));
vi.mock("@/pages/PrivacyPage", () => ({ PrivacyPage: () => <p>privacy page</p> }));
vi.mock("@/pages/PebblePairPage", () => ({ PebblePairPage: () => null }));

// Each test needs a fresh "@/router": lazy routes remember what they loaded.
async function makeRouter(path: string) {
  vi.doMock("@/pages/SettingsPage", async () => {
    gate.imports += 1;
    if (gate.mode === "fail") throw new Error("Failed to fetch dynamically imported module");
    if (gate.mode === "slow") await new Promise<void>((resolve) => (gate.release = resolve));
    return { SettingsPage: () => <p>settings page</p> };
  });
  const { router: appRouter } = await import("@/router");
  return createRouter({
    ...appRouter.options,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
}

describe("lazy secondary routes", () => {
  beforeEach(() => {
    gate.mode = "ok";
    gate.imports = 0;
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows an accessible loading status while the chunk downloads", async () => {
    gate.mode = "slow";
    render(<RouterProvider router={await makeRouter("/settings")} />);

    expect(await screen.findByRole("status")).toHaveTextContent("Loading...");
    expect(screen.queryByText("settings page")).not.toBeInTheDocument();

    gate.release();
    expect(await screen.findByText("settings page")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers a reload when the chunk cannot be loaded", async () => {
    gate.mode = "fail";
    render(<RouterProvider router={await makeRouter("/settings")} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this page");
    expect(screen.getByRole("button", { name: "Reload Page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try Again" })).not.toBeInTheDocument();
    expect(screen.queryByText(/dynamically imported/)).not.toBeInTheDocument();
  });

  it("loads the chunk ahead of navigation on intent preload", async () => {
    const router = await makeRouter("/privacy");
    await router.load();

    await router.preloadRoute({ to: "/settings" });

    expect(gate.imports).toBe(1);
  });

  it("keeps the direct link and search section on the lazy route", async () => {
    const router = await makeRouter("/settings?section=data");
    render(<RouterProvider router={router} />);

    expect(await screen.findByText("settings page")).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ section: "data" });
  });
});
