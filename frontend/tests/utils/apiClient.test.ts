import { http, HttpResponse } from "msw/http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { apiFetch } from "@/utils/apiClient";

/** Answers every method on `path` with `status` and returns the requests it received. */
function serve(path: string, status = 200): Request[] {
  const received: Request[] = [];
  server.use(
    http.all(path, ({ request }) => {
      received.push(request);
      return new HttpResponse(null, { status });
    }),
  );
  return received;
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not set default Content-Type when body is FormData", async () => {
    const received = serve("/upload");

    const body = new FormData();
    body.append("file", new Blob(["x"]), "x.txt");

    await apiFetch(
      "/upload",
      { method: "POST", body },
      {
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    const headers = received[0]!.headers;

    // The browser adds the multipart boundary itself; a preset JSON type would break the upload.
    expect(headers.get("Content-Type")).toMatch(/^multipart\/form-data; boundary=/);
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("sets default Content-Type for non-FormData requests", async () => {
    const received = serve("/data");

    await apiFetch(
      "/data",
      { method: "POST", body: JSON.stringify({ ok: true }) },
      {
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    const headers = received[0]!.headers;

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("calls onUnauthorized and throws on 401", async () => {
    serve("/data", 401);

    const onUnauthorized = vi.fn();

    await expect(
      apiFetch(
        "/data",
        {},
        {
          onUnauthorized,
          onForbidden: vi.fn(),
        },
      ),
    ).rejects.toThrow("Unauthorized");

    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("calls onForbidden and throws on 403", async () => {
    serve("/data", 403);

    const onForbidden = vi.fn();

    await expect(
      apiFetch(
        "/data",
        {},
        {
          onUnauthorized: vi.fn(),
          onForbidden,
        },
      ),
    ).rejects.toThrow("Forbidden");

    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("preserves caller headers in requests", async () => {
    const received = serve("/data");

    await apiFetch(
      "/data",
      {
        headers: {
          "X-Custom": "value",
        },
      },
      {
        onUnauthorized: vi.fn(),
        onForbidden: vi.fn(),
      },
    );

    expect(received[0]!.headers.get("X-Custom")).toBe("value");
  });
});
