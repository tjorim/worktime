import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { RouteError, RoutePending } from "@/components/RouteStatus";
import { preloadSyncCollections } from "@/db/collections";
import { lazyRoute } from "@/lib/lazyRoute";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";
import { HomePage } from "@/pages/HomePage";
import { SilentRenewCallbackPage } from "@/pages/SilentRenewCallbackPage";

// Secondary routes are code-split: Settings alone pulls in backup/restore, the
// account/admin sections and their dialogs. Home, the auth callbacks and the
// layout stay in the entry chunk so sign-in and the first paint never wait on
// a second download.
const SettingsPage = lazyRoute(() => import("@/pages/SettingsPage"), "SettingsPage");
const PrivacyPage = lazyRoute(() => import("@/pages/PrivacyPage"), "PrivacyPage");
const PebblePairPage = lazyRoute(() => import("@/pages/PebblePairPage"), "PebblePairPage");

const rootRoute = createRootRoute({
  component: AppLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: () => {
    // Warm the existing QueryCollections on navigation and intent preload.
    // Do not return the promise: slow/offline sync must not delay navigation,
    // and the page's live queries remain responsible for loading/error state.
    void preloadSyncCollections().catch(() => {});
  },
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
  defaultPendingComponent: RoutePending,
  defaultErrorComponent: RouteError,
  // Let the collections own freshness rather than caching the preload hint.
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
