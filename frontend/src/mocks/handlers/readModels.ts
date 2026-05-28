import { http, HttpResponse } from "msw";
import { buildAuthFailureResponse } from "./auth";
import { getMockScenario } from "@/mocks/scenarios/state";

export const readModelHandlers = [
  http.get("*/api/read-models/current-status", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    if (scenario.readModels.statusCode !== 200) {
      return new HttpResponse(null, { status: scenario.readModels.statusCode });
    }
    return HttpResponse.json(scenario.readModels.currentStatus);
  }),

  http.get("*/api/read-models/team-status", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    if (scenario.readModels.statusCode !== 200) {
      return new HttpResponse(null, { status: scenario.readModels.statusCode });
    }
    return HttpResponse.json(scenario.readModels.teamStatus);
  }),

  http.get("*/api/read-models/time-off-summary", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    if (scenario.readModels.statusCode !== 200) {
      return new HttpResponse(null, { status: scenario.readModels.statusCode });
    }
    return HttpResponse.json(scenario.readModels.timeOffSummary);
  }),

  http.get("*/api/read-models/dashboard", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    if (scenario.readModels.statusCode !== 200) {
      return new HttpResponse(null, { status: scenario.readModels.statusCode });
    }
    return HttpResponse.json({
      as_of: scenario.readModels.currentStatus.as_of,
      identity: scenario.auth.profile,
      work_context: {
        schedule_type: "5-shift",
        team_number: 1,
        effective_team_number: 1,
        state: "ready",
        feature_flags: { time_off_enabled: true },
      },
      current_status: scenario.readModels.currentStatus,
      next_shifts: {
        as_of: scenario.readModels.currentStatus.as_of,
        items: scenario.readModels.teamStatus.items.slice(0, 3).map((item, index) => {
          const baseDate = new Date(scenario.readModels.currentStatus.as_of);
          baseDate.setUTCDate(baseDate.getUTCDate() + index);
          return {
            team_number: 1,
            date: baseDate.toISOString().split("T")[0],
            shift_code: item.shift_code,
            shift: item.shift,
          };
        }),
      },
      team_status: scenario.readModels.teamStatus,
      time_off_summary: scenario.readModels.timeOffSummary,
    });
  }),
];
