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

    expect(await screen.findByText("Pairing failed (503)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry pairing" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("You can close this window.")).toBeInTheDocument();
  });
});
