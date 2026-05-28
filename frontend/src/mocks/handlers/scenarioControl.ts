import { http, HttpResponse } from "msw";
import {
  getMockScenarioId,
  listMockScenarioIds,
  resetMockScenario,
  setMockScenario,
} from "@/mocks/scenarios/state";
import type { MockScenarioId } from "@/mocks/scenarios/types";

export const scenarioControlHandlers = [
  http.get("*/api/mock/scenario", () => {
    return HttpResponse.json({
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
      return HttpResponse.json({ detail: "Invalid or missing JSON body" }, { status: 400 });
    }
    if (!requested || !listMockScenarioIds().includes(requested as MockScenarioId)) {
      return HttpResponse.json(
        {
          detail: "Unknown scenario id",
          available: listMockScenarioIds(),
        },
        { status: 400 },
      );
    }
    setMockScenario(requested as MockScenarioId);
    return HttpResponse.json({ active: getMockScenarioId() });
  }),

  http.post("*/api/mock/reset", () => {
    resetMockScenario();
    return new HttpResponse(null, { status: 204 });
  }),
];
