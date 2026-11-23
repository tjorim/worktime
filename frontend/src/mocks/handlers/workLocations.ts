import { uncheckedJson } from "@/mocks/response";
import { http, HttpResponse } from "msw/http";
import type { WorkLocationListResponse, WorkLocationRead, WorkLocationPut } from "@/api-types";
import { buildAuthFailureResponse } from "./auth";
import { getMockScenario } from "@/mocks/scenarios/state";

export const workLocationHandlers = [
  http.get<never, never, WorkLocationListResponse>("*/api/work-locations", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    if (scenario.workLocations.statusCode !== 200) {
      return new HttpResponse(null, { status: scenario.workLocations.statusCode });
    }
    return HttpResponse.json<WorkLocationListResponse>({
      items: scenario.workLocations.items,
      total: scenario.workLocations.items.length,
    });
  }),

  http.put<{ valueDate: string }, WorkLocationPut, WorkLocationRead | { detail: string }>(
    "*/api/work-locations/:valueDate",
    async ({ params, request }) => {
      const authFailure = buildAuthFailureResponse();
      if (authFailure) return authFailure;
      const scenario = getMockScenario();
      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return uncheckedJson("error", { detail: "Invalid JSON body" }, { status: 400 });
      }
      const date = params.valueDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof body?.country_code !== "string") {
        return uncheckedJson(
          "error",
          {
            detail: "Expected a YYYY-MM-DD path date and a country_code string.",
          },
          { status: 400 },
        );
      }
      const existing = scenario.workLocations.items.findIndex((entry) => entry.date === date);
      const previous = scenario.workLocations.items[existing];
      const item = {
        id: previous?.id ?? Number(date.replaceAll("-", "")),
        user_id: scenario.auth.profile.id,
        date,
        country_code: body.country_code.toUpperCase(),
        label: typeof body.label === "string" ? body.label : null,
        created_at: previous?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existing >= 0) {
        scenario.workLocations.items[existing] = item;
      } else {
        scenario.workLocations.items.push(item);
      }
      return HttpResponse.json<WorkLocationRead>(item);
    },
  ),

  http.delete("*/api/work-locations/:valueDate", ({ params }) => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    const target = String(params.valueDate);
    const index = scenario.workLocations.items.findIndex((item) => item.date === target);
    if (index === -1) {
      return uncheckedJson("error", { detail: "Not Found" }, { status: 404 });
    }
    scenario.workLocations.items.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
