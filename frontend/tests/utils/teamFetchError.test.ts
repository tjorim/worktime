import { describe, expect, it } from "vitest";
import { ApiError } from "@/utils/apiError";
import * as m from "@/paraglide/messages.js";
import { classifyTeamLoadError, MAX_RECENT_TEAM_IDS, rememberTeamId } from "@/utils/teamFetchError";

describe("classifyTeamLoadError", () => {
  it.each([
    [404, { kind: "not_found", teamId: "eng" }],
    [400, { kind: "invalid_id", teamId: "eng" }],
    [500, { kind: "helper" }],
    [503, { kind: "helper" }],
  ])("maps status %i to a specific kind", (status, expected) => {
    expect(classifyTeamLoadError(new ApiError({ status }), "eng")).toEqual(expected);
  });

  it("treats a failure without a response as the helper being unreachable", () => {
    expect(classifyTeamLoadError(new TypeError("Failed to fetch"), "eng")).toEqual({
      kind: "unreachable",
    });
  });

  it("keeps the generic translated reason for statuses the app recognises", () => {
    expect(classifyTeamLoadError(new ApiError({ status: 429 }), "eng")).toEqual({
      kind: "other",
      reason: m.error_rate_limited(),
    });
    expect(classifyTeamLoadError(new ApiError({ status: 418 }), "eng")).toEqual({
      kind: "other",
      reason: null,
    });
  });
});

describe("rememberTeamId", () => {
  it("puts the newest ID first and drops its earlier occurrence", () => {
    expect(rememberTeamId(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("starts a list when none exists", () => {
    expect(rememberTeamId(undefined, "a")).toEqual(["a"]);
  });

  it("keeps only the most recent IDs", () => {
    const many = Array.from({ length: MAX_RECENT_TEAM_IDS }, (_, i) => `t${i}`);
    const next = rememberTeamId(many, "new");
    expect(next).toHaveLength(MAX_RECENT_TEAM_IDS);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`t${MAX_RECENT_TEAM_IDS - 1}`);
  });
});
