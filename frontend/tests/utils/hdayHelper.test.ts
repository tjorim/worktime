import { afterEach, describe, expect, it, vi } from "vitest";
import { isHdayHelperMixedContentBlocked, resolveHdayHelperTarget } from "@/utils/hdayHelper";

describe("resolveHdayHelperTarget", () => {
  it("routes to the same-origin API when no helper URL is configured", () => {
    expect(resolveHdayHelperTarget(null)).toEqual({ baseUrl: "/api", usesHelper: false });
  });

  it("routes to the configured helper when a URL is set", () => {
    expect(resolveHdayHelperTarget("http://localhost:8080")).toEqual({
      baseUrl: "http://localhost:8080",
      usesHelper: true,
    });
  });
});

describe("isHdayHelperMixedContentBlocked", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flags an http:// helper URL when the app is served over https", () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    expect(isHdayHelperMixedContentBlocked("http://localhost:8080")).toBe(true);
  });

  it("does not flag an https:// helper URL when the app is served over https", () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    expect(isHdayHelperMixedContentBlocked("https://helper.example.com")).toBe(false);
  });

  it("does not flag an http:// helper URL when the app itself is served over http", () => {
    vi.stubGlobal("location", { ...window.location, protocol: "http:" });
    expect(isHdayHelperMixedContentBlocked("http://localhost:8080")).toBe(false);
  });

  it("returns false for an unparsable URL", () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    expect(isHdayHelperMixedContentBlocked("not-a-url")).toBe(false);
  });
});
