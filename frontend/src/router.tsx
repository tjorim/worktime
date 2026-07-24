import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { HomePage } from "@/pages/HomePage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SilentRenewCallbackPage } from "@/pages/SilentRenewCallbackPage";

const rootRoute = createRootRoute({
  component: AppLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    section?: "general" | "features" | "timeTracking" | "account" | "admin" | "data" | "about";
  } => {
    const section = typeof search.section === "string" ? search.section : undefined;
    // "sync" was folded into "account" when the two settings sections were combined;
    // keep old bookmarks/links working by redirecting them there.
    if (section === "sync") {
      return { section: "account" };
    }
    if (
      section === "general" ||
      section === "features" ||
      section === "timeTracking" ||
      section === "account" ||
      section === "admin" ||
      section === "data" ||
      section === "about"
    ) {
      return { section };
    }
    return {};
  },
  component: SettingsPage,
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallbackPage,
});

const silentRenewCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/silent-callback",
  component: SilentRenewCallbackPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  settingsRoute,
  privacyRoute,
  authCallbackRoute,
  silentRenewCallbackRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
