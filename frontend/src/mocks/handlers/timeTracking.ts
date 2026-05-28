import { http, HttpResponse } from "msw";
import { buildAuthFailureResponse } from "./auth";
import { getMockScenario } from "@/mocks/scenarios/state";

export const timeTrackingHandlers = [
  http.get("*/api/time-tracking/state", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    if (scenario.timeTracking.state === "validation_failure") {
      return HttpResponse.json(
        {
          detail: "Validation failed",
          errors: scenario.timeTracking.validation_errors,
        },
        { status: 422 },
      );
    }
    return HttpResponse.json(scenario.timeTracking);
  }),
];
