import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/utils/apiClient";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not set default Content-Type when body is FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const body = new FormData();
    body.append("file", new Blob(["x"]), "x.txt");

    await apiFetch(
      "/upload",
      { method: "POST", body },
      {
        apiUrl: "http://localhost:8000",
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("sets default Content-Type for non-FormData requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(
      "/data",
      { method: "POST", body: JSON.stringify({ ok: true }) },
      {
        apiUrl: "http://localhost:8000",
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("calls onUnauthorized and throws on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const onUnauthorized = vi.fn();

    await expect(
      apiFetch(
        "/data",
        {},
        {
          apiUrl: "http://localhost:8000",
          onUnauthorized,
          onForbidden: vi.fn(),
        },
      ),
    ).rejects.toThrow("Unauthorized");

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("calls onForbidden and throws on 403", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const onForbidden = vi.fn();

    await expect(
      apiFetch(
        "/data",
        {},
        {
          apiUrl: "http://localhost:8000",
          onUnauthorized: vi.fn(),
          onForbidden,
        },
      ),
    ).rejects.toThrow("Forbidden");

    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("preserves caller headers in requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(
      "/data",
      {
        headers: {
          "X-Custom": "value",
        },
      },
      {
        apiUrl: "http://localhost:8000",
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("X-Custom")).toBe("value");
  });
});
