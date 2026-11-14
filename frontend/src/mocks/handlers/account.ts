import { http, HttpResponse } from "msw/http";
import type {
  AccessTokenListResponse,
  HealthSummary,
  IcalFeedStatus,
  IntegrationClientListResponse,
} from "@/api-types";
import { buildAuthFailureResponse } from "./auth";

/**
 * Account settings screens: a healthy backend whose account has no calendar feed, API tokens or integration
 * clients yet. Tests that need data override these with `server.use(...)`.
 */
export const accountHandlers = [
  http.get<never, never, HealthSummary>("*/api/health", () =>
    HttpResponse.json({
      status: "ok",
      version: "0.0.0",
      commit: "unknown",
      links: { liveness: "/api/health/liveness", readiness: "/api/health/readiness" },
    }),
  ),

  http.get<never, never, IcalFeedStatus>(
    "*/api/ical",
    () => buildAuthFailureResponse() ?? HttpResponse.json({ configured: false }),
  ),

  http.get<never, never, AccessTokenListResponse>(
    "*/api/access-tokens",
    () => buildAuthFailureResponse() ?? HttpResponse.json({ items: [], total: 0 }),
  ),

  http.get<never, never, IntegrationClientListResponse>(
    "*/api/integration-clients",
    () => buildAuthFailureResponse() ?? HttpResponse.json({ items: [], total: 0 }),
  ),
];
