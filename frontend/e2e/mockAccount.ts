import type { BrowserContext } from "@playwright/test";
import { emptyPullResponse, emptyPushResponse, emptyStatus } from "@/mocks/data/syncStore";
import { getMockScenario } from "@/mocks/scenarios/state";

/** Account reads and background sync for authenticated specs that block MSW. */
export async function mockAccount(context: BrowserContext) {
  const responses: Record<string, unknown> = {
    "/api/sync/status": emptyStatus,
    "/api/sync/pull": emptyPullResponse,
    "/api/me": getMockScenario().auth.profile,
    "/api/access-tokens": { items: [], total: 0 },
    "/api/integration-clients": { items: [] },
    "/api/ical": { configured: false },
    "/api/preferences": null,
  };
  await context.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (method === "GET" && pathname in responses) {
      await route.fulfill({ json: responses[pathname] });
    } else if (method === "POST" && pathname === "/api/sync/push") {
      await route.fulfill({ json: emptyPushResponse });
    } else if (method === "PUT" && pathname === "/api/preferences") {
      const body = route.request().postDataJSON();
      const now = new Date().toISOString();
      await route.fulfill({
        json: {
          user_id: 1,
          data: body.data,
          client_updated_at: body.client_updated_at ?? now,
          created_at: now,
          updated_at: now,
        },
      });
    } else if (method === "POST" && pathname === "/api/client-diagnostics") {
      await route.fulfill({ status: 204 });
    } else if (method === "GET" && pathname === "/api/sync/events") {
      // These route-loading tests do not exercise live updates.
      await route.abort();
    } else {
      await route.fallback();
    }
  });
}
