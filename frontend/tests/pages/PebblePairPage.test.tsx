import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PebblePairPage } from "@/pages/PebblePairPage";
import { useAuth } from "@/contexts/AuthContext";
import { useApiClient } from "@/hooks/useApiClient";

vi.mock("@/contexts/AuthContext");
vi.mock("@/hooks/useApiClient");
vi.mock("@/paraglide/messages.js", () => ({
  pebble_pair_title: () => "Pair Pebble Watch",
  pebble_pair_description: () => "Sign in to link your Pebble companion app.",
  pebble_pair_connecting: () => "Connecting your watch...",
  pebble_pair_retry: () => "Retry pairing",
  pebble_pair_close_instruction: () => "You can close this window.",
  pebble_pair_failed: () => "Could not pair your watch right now.",
  error_rate_limited: () => "Too many requests.",
  error_code_oidc_session_required: () => "This needs a signed-in browser session.",
  auth_session_expired: () => "Your session has expired.",
  auth_error_forbidden: () => "Access denied.",
}));

describe("PebblePairPage", () => {
  const apiFetch = vi.fn();

  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isValidating: false,
      userId: "user-1",
      displayName: "Test User",
      getAccessToken: vi.fn().mockReturnValue("oidc-access-token"),
      triggerLogin: vi.fn(),
      triggerSignup: vi.fn(),
      logout: vi.fn(),
      renewSession: vi.fn(),
    });
    vi.mocked(useApiClient).mockReturnValue(apiFetch);
    apiFetch.mockReset();
  });

  it("allows retrying a transient token-creation failure", async () => {
    apiFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "wtpat_retry-token" }), { status: 201 }),
      );

    const user = userEvent.setup();
    render(<PebblePairPage />);

    expect(await screen.findByText("Could not pair your watch right now.")).toBeInTheDocument();
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry pairing" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("You can close this window.")).toBeInTheDocument();
  });

  it("shows a translated reason for a recognised status", async () => {
    apiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Rate limit exceeded: 5 per 1 minute" }), {
        status: 429,
      }),
    );

    render(<PebblePairPage />);

    expect(await screen.findByText("Too many requests.")).toBeInTheDocument();
    expect(screen.queryByText(/Rate limit exceeded/)).not.toBeInTheDocument();
  });

  it("shows the surface's translated reason for a recognised error code", async () => {
    apiFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "oidc_session_required", detail: "This operation requires" }),
        { status: 403 },
      ),
    );

    render(<PebblePairPage />);

    expect(await screen.findByText("This needs a signed-in browser session.")).toBeInTheDocument();
    expect(screen.queryByText(/This operation requires/)).not.toBeInTheDocument();
  });
});
