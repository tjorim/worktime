import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { HomePage } from "@/pages/HomePage";
import { PebblePairPage } from "@/pages/PebblePairPage";
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
    section?:
      | "scheduleTeam"
      | "general"
      | "features"
      | "timeTracking"
      | "account"
      | "admin"
      | "data"
      | "about";
  } => {
    const section = typeof search.section === "string" ? search.section : undefined;
    if (
      section === "scheduleTeam" ||
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

const pebblePairRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pebble-pair",
  component: PebblePairPage,
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
  pebblePairRoute,
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
