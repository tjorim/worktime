import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApiClient } from "@/hooks/useApiClient";
import { apiFetch } from "@/utils/apiClient";

const auth = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  logout: vi.fn(),
  triggerLogin: vi.fn(),
  renewSession: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  showError: vi.fn(),
  showWarning: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => toast,
}));

vi.mock("@/utils/apiClient", () => ({
  apiFetch: vi.fn(),
}));

describe("useApiClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getAccessToken.mockReturnValue("token-123");
    auth.renewSession.mockResolvedValue(null);
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("adds the current access token to requests", async () => {
    const { result } = renderHook(() => useApiClient());

    await result.current("/api/data", { headers: { "X-Test": "yes" } });

    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("X-Test")).toBe("yes");
  });

  it("starts only the login redirect when a request is unauthorized", async () => {
    vi.mocked(apiFetch).mockImplementation(async (_url, _init, options) => {
      options.onUnauthorized();
      throw new Error("Unauthorized");
    });
    const { result } = renderHook(() => useApiClient());

    await expect(result.current("/api/data")).rejects.toThrow("Unauthorized");

    expect(toast.showWarning).toHaveBeenCalledOnce();
    expect(auth.triggerLogin).toHaveBeenCalledOnce();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("can show an unauthorized warning without starting a login redirect", async () => {
    vi.mocked(apiFetch).mockImplementation(async (_url, _init, options) => {
      options.onUnauthorized();
      throw new Error("Unauthorized");
    });
    const { result } = renderHook(() => useApiClient());

    await expect(
      result.current("/api/data", { suppressUnauthorizedRedirect: true }),
    ).rejects.toThrow("Unauthorized");

    const [, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect("suppressUnauthorizedRedirect" in (init ?? {})).toBe(false);
    expect(toast.showWarning).toHaveBeenCalledOnce();
    expect(auth.triggerLogin).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("retries once after a successful silent renewal instead of ending the session", async () => {
    auth.renewSession.mockResolvedValue("renewed-token");
    let calls = 0;
    vi.mocked(apiFetch).mockImplementation(async (_url, _init, options) => {
      calls += 1;
      if (calls === 1) {
        options.onUnauthorized();
        throw new Error("Unauthorized");
      }
      return new Response(null, { status: 200 });
    });
    const { result } = renderHook(() => useApiClient());

    const response = await result.current("/api/data");

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(auth.renewSession).toHaveBeenCalledOnce();
    expect(toast.showWarning).not.toHaveBeenCalled();
    expect(auth.triggerLogin).not.toHaveBeenCalled();
  });

  it("retries with the freshly renewed token, not the (still stale) getAccessToken() value", async () => {
    // Regression test: getAccessToken() reads OIDC user state that hasn't
    // re-rendered yet immediately after renewSession() resolves, so the retry
    // must use the token renewSession() returned directly.
    auth.getAccessToken.mockReturnValue("stale-token");
    auth.renewSession.mockResolvedValue("fresh-token");
    let calls = 0;
    vi.mocked(apiFetch).mockImplementation(async (_url, init, options) => {
      calls += 1;
      if (calls === 1) {
        options.onUnauthorized();
        throw new Error("Unauthorized");
      }
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer fresh-token");
      return new Response(null, { status: 200 });
    });
    const { result } = renderHook(() => useApiClient());

    const response = await result.current("/api/data");

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("ends the session when the retried request is unauthorized again after renewal", async () => {
    auth.renewSession.mockResolvedValue("renewed-token");
    vi.mocked(apiFetch).mockImplementation(async (_url, _init, options) => {
      options.onUnauthorized();
      throw new Error("Unauthorized");
    });
    const { result } = renderHook(() => useApiClient());

    await expect(result.current("/api/data")).rejects.toThrow("Unauthorized");

    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(2);
    expect(toast.showWarning).toHaveBeenCalledOnce();
    expect(auth.triggerLogin).toHaveBeenCalledOnce();
  });

  it("reports a forbidden request without ending the session", async () => {
    // 403 is a permission boundary (admin-only endpoints, user-id mismatch, the
    // OIDC-only surfaces a Pebble token cannot reach), not an invalid session —
    // signing the user out of the whole app would be the wrong remedy.
    vi.mocked(apiFetch).mockImplementation(async (_url, _init, options) => {
      options.onForbidden();
      throw new Error("Forbidden");
    });
    const { result } = renderHook(() => useApiClient());

    await expect(result.current("/api/data")).rejects.toThrow("Forbidden");

    expect(toast.showError).toHaveBeenCalledOnce();
    expect(auth.logout).not.toHaveBeenCalled();
    expect(auth.triggerLogin).not.toHaveBeenCalled();
  });
});
