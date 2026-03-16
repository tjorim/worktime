import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { apiFetch } from "../../src/utils/apiClient";

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
      "/v1/upload",
      { method: "POST", body },
      {
        apiUrl: "http://localhost:8000",
        getAuthHeaders: () => ({ Authorization: "Bearer token" }),
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
      "/v1/data",
      { method: "POST", body: JSON.stringify({ ok: true }) },
      {
        apiUrl: "http://localhost:8000",
        getAuthHeaders: () => ({ Authorization: "Bearer token" }),
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("strips caller Authorization header for off-origin requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(
      "https://third-party.example.com/data",
      {
        headers: {
          Authorization: "Bearer user-supplied-token",
          "X-Custom": "value",
        },
      },
      {
        apiUrl: "http://localhost:8000",
        getAuthHeaders: () => ({ Authorization: "Bearer internal-token" }),
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("X-Custom")).toBe("value");
  });

  it("allows caller Authorization header for same-origin requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(
      "http://localhost:8000/v1/data",
      {
        headers: {
          Authorization: "Bearer caller-token",
        },
      },
      {
        apiUrl: "http://localhost:8000",
        getAuthHeaders: () => ({ Authorization: "Bearer internal-token" }),
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("Authorization")).toBe("Bearer caller-token");
  });
});
