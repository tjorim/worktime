import { uncheckedJson } from "@/mocks/response";
import { http, HttpResponse } from "msw/http";
import {
  getMockScenarioId,
  listMockScenarioIds,
  resetMockScenario,
  setMockScenario,
} from "@/mocks/scenarios/state";
import type { MockScenarioId } from "@/mocks/scenarios/types";

export const scenarioControlHandlers = [
  http.get("*/api/mock/scenario", () => {
    return uncheckedJson("control", {
      active: getMockScenarioId(),
      available: listMockScenarioIds(),
    });
  }),

  http.post("*/api/mock/scenario", async ({ request }) => {
    let requested: string | undefined;
    try {
      const body = (await request.json()) as { id?: string };
      requested = body.id;
    } catch {
      return uncheckedJson("control", { detail: "Invalid or missing JSON body" }, { status: 400 });
    }
    if (!requested || !listMockScenarioIds().includes(requested as MockScenarioId)) {
      return uncheckedJson(
        "control",
        {
          detail: "Unknown scenario id",
          available: listMockScenarioIds(),
        },
        { status: 400 },
      );
    }
    setMockScenario(requested as MockScenarioId);
    return uncheckedJson("control", { active: getMockScenarioId() });
  }),

  http.post("*/api/mock/reset", () => {
    resetMockScenario();
    return new HttpResponse(null, { status: 204 });
  }),
];
