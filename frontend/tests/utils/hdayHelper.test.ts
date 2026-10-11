import { afterEach, describe, expect, it, vi } from "vitest";
import { isHdayHelperMixedContentBlocked, resolveHdayHelperBaseUrl } from "@/utils/hdayHelper";

describe("resolveHdayHelperBaseUrl", () => {
  it("returns null when no helper URL is configured", () => {
    expect(resolveHdayHelperBaseUrl(null)).toBeNull();
  });

  it("normalizes a configured helper URL", () => {
    expect(resolveHdayHelperBaseUrl(" http://localhost:8080/ ")).toBe("http://localhost:8080");
  });
});

describe("isHdayHelperMixedContentBlocked", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows an http:// localhost helper when the app is served over https", () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    expect(isHdayHelperMixedContentBlocked("http://localhost:8080")).toBe(false);
    expect(isHdayHelperMixedContentBlocked("http://127.0.0.1:8080")).toBe(false);
    expect(isHdayHelperMixedContentBlocked("http://[::1]:8080")).toBe(false);
  });

  it("flags a non-loopback http:// helper URL when the app is served over https", () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    expect(isHdayHelperMixedContentBlocked("http://planner-proxy.lan:8080")).toBe(true);
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
