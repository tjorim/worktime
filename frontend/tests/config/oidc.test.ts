import { describe, expect, it } from "vitest";
import { getPostSigninReturnTo } from "@/config/oidc";

describe("getPostSigninReturnTo", () => {
  it("restores a local route saved before sign-in", () => {
    expect(getPostSigninReturnTo({ returnTo: "/pebble-pair" })).toBe("/pebble-pair");
  });

  it.each([
    undefined,
    {},
    { returnTo: null },
    { returnTo: "https://example.com" },
    { returnTo: "//example.com" },
  ])("falls back to the home route for missing or unsafe state", (state) => {
    expect(getPostSigninReturnTo(state)).toBe("/");
  });
});
