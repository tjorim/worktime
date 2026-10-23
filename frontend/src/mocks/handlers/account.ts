import { http, HttpResponse } from "msw/http";
import { buildAuthFailureResponse } from "./auth";

/**
 * Account settings screens: a healthy backend whose account has no calendar feed, API tokens or integration
 * clients yet. Tests that need data override these with `server.use(...)`.
 */
export const accountHandlers = [
  http.get("*/api/health", () => HttpResponse.json({ status: "ok" })),

  http.get(
    "*/api/ical",
    () => buildAuthFailureResponse() ?? HttpResponse.json({ configured: false }),
  ),

  http.get(
    "*/api/access-tokens",
    () => buildAuthFailureResponse() ?? HttpResponse.json({ items: [], total: 0 }),
  ),

  http.get(
    "*/api/integration-clients",
    () => buildAuthFailureResponse() ?? HttpResponse.json({ items: [] }),
  ),
];
