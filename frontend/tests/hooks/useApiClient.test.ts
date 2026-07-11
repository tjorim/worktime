import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApiClient } from "@/hooks/useApiClient";
import { apiFetch } from "@/utils/apiClient";

const auth = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  logout: vi.fn(),
  triggerLogin: vi.fn(),
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
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 200 }));
  });

  it("adds the current access token to requests", async () => {
    const { result } = renderHook(() => useApiClient());

    await result.current("/api/data", { headers: { "X-Test": "yes" } });

    const [, init] = vi.mocked(apiFetch).mock.calls[0];
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

  it("logs out and shows an error when a request is forbidden", async () => {
    vi.mocked(apiFetch).mockImplementation(async (_url, _init, options) => {
      options.onForbidden();
      throw new Error("Forbidden");
    });
    const { result } = renderHook(() => useApiClient());

    await expect(result.current("/api/data")).rejects.toThrow("Forbidden");

    expect(auth.logout).toHaveBeenCalledOnce();
    expect(toast.showError).toHaveBeenCalledOnce();
    expect(auth.triggerLogin).not.toHaveBeenCalled();
  });
});
