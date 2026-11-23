import { routeJson } from "@/mocks/response";
import type {
  AccountProfile,
  AccessTokenListResponse,
  IntegrationClientListResponse,
  IcalFeedStatus,
  PreferencesResponse,
  SyncStatusResponse,
  SyncPullResponse,
  SyncPushResponse,
  UserPreferencesWrite,
} from "@/api-types";
import type { BrowserContext } from "@playwright/test";
import { emptyPullResponse, emptyPushResponse, emptyStatus } from "@/mocks/data/syncStore";
import { getMockScenario } from "@/mocks/scenarios/state";

/** Account reads and background sync for authenticated specs that block MSW. */
export async function mockAccount(context: BrowserContext) {
  const responses: {
    "/api/sync/status": SyncStatusResponse;
    "/api/sync/pull": SyncPullResponse;
    "/api/me": AccountProfile;
    "/api/access-tokens": AccessTokenListResponse;
    "/api/integration-clients": IntegrationClientListResponse;
    "/api/ical": IcalFeedStatus;
    "/api/preferences": PreferencesResponse | null;
  } = {
    "/api/sync/status": emptyStatus,
    "/api/sync/pull": emptyPullResponse,
    "/api/me": getMockScenario().auth.profile,
    "/api/access-tokens": { items: [], total: 0 },
    "/api/integration-clients": { items: [], total: 0 },
    "/api/ical": { configured: false, token_preview: null, created_at: null, last_used_at: null },
    "/api/preferences": null,
  };
  await context.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (
      method === "GET" &&
      pathname === "/api/preferences" &&
      route.request().headers().prefer === "return=minimal"
    ) {
      await route.fulfill({ status: 204 });
    } else if (method === "GET" && pathname in responses) {
      await route.fulfill(
        routeJson<(typeof responses)[keyof typeof responses]>(
          responses[pathname as keyof typeof responses],
        ),
      );
    } else if (method === "POST" && pathname === "/api/sync/push") {
      await route.fulfill(routeJson<SyncPushResponse>(emptyPushResponse));
    } else if (method === "PUT" && pathname === "/api/preferences") {
      const body: UserPreferencesWrite = route.request().postDataJSON();
      const now = new Date().toISOString();
      await route.fulfill(
        routeJson<PreferencesResponse>({
          user_id: 1,
          data: body.data ?? {},
          client_updated_at: body.client_updated_at ?? now,
          created_at: now,
          updated_at: now,
        }),
      );
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
