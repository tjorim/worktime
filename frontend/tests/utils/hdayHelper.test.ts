import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHdayHelperErrorMessage,
  isHdayHelperMixedContentBlocked,
  resolveHdayHelperBaseUrl,
} from "@/utils/hdayHelper";

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

describe("getHdayHelperErrorMessage", () => {
  it("extracts the detail string from a JSON error body", async () => {
    const response = new Response(JSON.stringify({ detail: "share unreachable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
    expect(await getHdayHelperErrorMessage(response, "fallback")).toBe("share unreachable");
  });

  it("falls back to the given message for a non-JSON body", async () => {
    const response = new Response("<html>oops</html>", {
      status: 500,
      headers: { "content-type": "text/html" },
    });
    expect(await getHdayHelperErrorMessage(response, "fallback")).toBe("fallback");
  });

  it("falls back to the given message when detail is missing or blank", async () => {
    const response = new Response(JSON.stringify({ detail: "  " }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    expect(await getHdayHelperErrorMessage(response, "fallback")).toBe("fallback");
  });

  it("falls back to the given message when the JSON body cannot be parsed", async () => {
    const response = new Response("not json", {
      status: 500,
      headers: { "content-type": "application/json" },
    });
    expect(await getHdayHelperErrorMessage(response, "fallback")).toBe("fallback");
  });
});
