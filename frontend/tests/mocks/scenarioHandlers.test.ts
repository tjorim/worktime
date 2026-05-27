import { describe, expect, it } from "vitest";
import { getMockScenarioId, withMockScenario } from "@/mocks/scenarios/state";

describe("MSW mock scenarios", () => {
  it("returns read-model success data in current-shift-day scenario", async () => {
    await withMockScenario("current-shift-day", async () => {
      const response = await fetch("http://localhost/api/read-models/current-status");
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { current_shift?: { shift_code?: string } };
      expect(payload.current_shift?.shift_code).toBe("D");
    });
  });

  it("returns validation failure for time tracking in validation scenario", async () => {
    await withMockScenario("time-tracking-validation-failure", async () => {
      const response = await fetch("http://localhost/api/time-tracking/state");
      expect(response.status).toBe(422);
      const payload = (await response.json()) as { errors?: string[] };
      expect(payload.errors?.[0]).toContain("start_time");
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
