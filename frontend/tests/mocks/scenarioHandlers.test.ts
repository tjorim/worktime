import type { CurrentStatusReadModel } from "@/api-types";
import { describe, expect, it } from "vitest";
import { getMockScenarioId, withMockScenario } from "@/mocks/scenarios/state";

describe("MSW mock scenarios", () => {
  it("returns read-model success data in current-shift-day scenario", async () => {
    await withMockScenario("current-shift-day", async () => {
      const response = await fetch("http://localhost/api/read-models/current-status");
      expect(response.status).toBe(200);
      const payload = (await response.json()) as CurrentStatusReadModel;
      expect(payload.current_shift?.shift_code).toBe("D");
    });
  });

  it("returns auth failure and restores default scenario afterward", async () => {
    await withMockScenario("auth-expired", async () => {
      const response = await fetch("http://localhost/api/me");
      expect(response.status).toBe(401);
    });

    expect(getMockScenarioId()).toBe("demo-default");
  });
});
