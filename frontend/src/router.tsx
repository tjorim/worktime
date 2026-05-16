import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { HomePage } from "@/pages/HomePage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import { SettingsPage } from "@/pages/SettingsPage";

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
  ): { section?: "general" | "features" | "account" | "sync" | "data" | "about" } => {
    const section = typeof search.section === "string" ? search.section : undefined;
    if (
      section === "general" ||
      section === "features" ||
      section === "account" ||
      section === "sync" ||
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

const routeTree = rootRoute.addChildren([homeRoute, settingsRoute, privacyRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
