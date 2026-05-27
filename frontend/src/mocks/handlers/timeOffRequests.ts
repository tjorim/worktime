import { http, HttpResponse } from "msw";
import { buildAuthFailureResponse } from "./auth";
import { getMockScenario } from "@/mocks/scenarios/state";

export const timeOffRequestHandlers = [
  http.get("*/api/time-off/requests", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    if (scenario.timeOffRequests.statusCode !== 200) {
      return new HttpResponse(null, { status: scenario.timeOffRequests.statusCode });
    }
    return HttpResponse.json({
      items: scenario.timeOffRequests.requests,
      total: scenario.timeOffRequests.requests.length,
    });
  }),
];
