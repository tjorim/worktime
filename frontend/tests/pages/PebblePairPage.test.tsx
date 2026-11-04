import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PebblePairPage } from "@/pages/PebblePairPage";
import { useAuth } from "@/contexts/AuthContext";
import { useApiClient } from "@/hooks/useApiClient";
import * as m from "@/paraglide/messages.js";

vi.mock("@/contexts/AuthContext");
vi.mock("@/hooks/useApiClient");
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

    expect(await screen.findByText(m.pebble_pair_failed())).toBeInTheDocument();
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: m.pebble_pair_retry() }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(m.pebble_pair_close_instruction())).toBeInTheDocument();
  });

  it("shows a translated reason for a recognised status", async () => {
    apiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Rate limit exceeded: 5 per 1 minute" }), {
        status: 429,
      }),
    );

    render(<PebblePairPage />);

    expect(await screen.findByText(m.error_rate_limited())).toBeInTheDocument();
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

    expect(await screen.findByText(m.error_code_oidc_session_required())).toBeInTheDocument();
    expect(screen.queryByText(/This operation requires/)).not.toBeInTheDocument();
  });
});
