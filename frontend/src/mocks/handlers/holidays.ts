/**
 * MSW handlers for the backend holiday proxy endpoints.
 *
 * Covers:
 *  GET /api/holidays/public
 *  GET /api/holidays/longweekend
 *  GET /api/holidays/school
 *  GET /api/holidays/paydates
 *
 * All holiday sources are proxied through the backend — the frontend calls
 * `/api/holidays/*` exclusively. These handlers return deterministic seed
 * data so tests and dev mode work without a real backend or external network.
 */

import { http, HttpResponse } from "msw";
import { getMockScenario } from "@/mocks/scenarios/state";

export const holidayHandlers = [
  // GET /api/holidays/public
  http.get("*/api/holidays/public", () => {
    return HttpResponse.json(getMockScenario().holidays.public);
  }),

  // GET /api/holidays/longweekend
  http.get("*/api/holidays/longweekend", () => {
    return HttpResponse.json(getMockScenario().holidays.longweekend);
  }),

  // GET /api/holidays/school
  http.get("*/api/holidays/school", () => {
    return HttpResponse.json(getMockScenario().holidays.school);
  }),

  // GET /api/holidays/paydates
  http.get("*/api/holidays/paydates", () => {
    return HttpResponse.json(getMockScenario().holidays.paydates);
  }),
];
