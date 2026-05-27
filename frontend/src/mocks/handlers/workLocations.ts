import { http, HttpResponse } from "msw";
import { buildAuthFailureResponse } from "./auth";
import { getMockScenario } from "@/mocks/scenarios/state";

export const workLocationHandlers = [
  http.get("*/api/work-locations", () => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    if (scenario.workLocations.statusCode !== 200) {
      return new HttpResponse(null, { status: scenario.workLocations.statusCode });
    }
    return HttpResponse.json({
      items: scenario.workLocations.items,
      total: scenario.workLocations.items.length,
    });
  }),

  http.post("*/api/work-locations/", async ({ request }) => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    const body = (await request.json()) as { date: string; country_code: string; label?: string | null };
    const userId = scenario.auth.profile.id;
    const item = {
      id: Number(body.date.replaceAll("-", "")),
      user_id: userId,
      date: body.date,
      country_code: body.country_code,
      label: body.label ?? null,
      created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    };
    const existing = scenario.workLocations.items.findIndex((entry) => entry.date === body.date);
    if (existing >= 0) {
      scenario.workLocations.items[existing] = item;
    } else {
      scenario.workLocations.items.push(item);
    }
    return HttpResponse.json(item, { status: 201 });
  }),

  http.delete("*/api/work-locations/:valueDate", ({ params }) => {
    const authFailure = buildAuthFailureResponse();
    if (authFailure) return authFailure;
    const scenario = getMockScenario();
    const target = String(params.valueDate);
    const index = scenario.workLocations.items.findIndex((item) => item.date === target);
    if (index === -1) {
      return HttpResponse.json({ detail: "Not Found" }, { status: 404 });
    }
    scenario.workLocations.items.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
