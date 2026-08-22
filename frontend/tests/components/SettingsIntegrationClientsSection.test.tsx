import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsIntegrationClientsSection } from "@/components/settings/account/SettingsIntegrationClientsSection";
import { ToastProvider } from "@/contexts/ToastContext";
import { useSettingsIntegrationClients } from "@/pages/settings/hooks/useSettingsIntegrationClients";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, ...init });

function renderHarness(fetchFn: (input: string, init?: RequestInit) => Promise<Response>, isAdmin = false) {
  function Harness() {
    const state = useSettingsIntegrationClients({ isAuthenticated: true, fetchFn });
    return <SettingsIntegrationClientsSection
      clients={state.clients} isLoading={state.isLoading} error={state.error}
      isCreating={state.isCreating} createdClient={state.createdClient}
      busyClientId={state.busyClientId} isAdmin={isAdmin}
      onDismissCreatedClient={state.dismissCreatedClient} onCreateClient={state.createClient}
      onRotateClient={state.rotateClient} onRevokeClient={state.revokeClient}
    />;
  }
  render(<ToastProvider><Harness /></ToastProvider>);
}

describe("Settings integration clients", () => {
  it("creates a client and only offers admin scope to admins", async () => {
    let created = false;
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/integration-clients" && init?.method === "POST") {
        created = true;
        return jsonResponse({ id: 7, name: "Home hub", key: "wtic_secret", scopes: ["worktime:mcp", "worktime:admin"], rate_limit_per_minute: 120, created_at: "2026-08-22T00:00:00Z" }, { status: 201 });
      }
      if (input === "/api/integration-clients") return jsonResponse({ items: created ? [{ id: 7, name: "Home hub", key_preview: "secret", scopes: ["worktime:mcp", "worktime:admin"], rate_limit_per_minute: 120, is_active: true, created_at: "2026-08-22T00:00:00Z", last_used_at: null, revoked_at: null }] : [], total: created ? 1 : 0 });
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
    });
    const user = userEvent.setup();
    renderHarness(fetchFn, true);
    await screen.findByText("No integration clients yet.");
    await user.type(screen.getByLabelText("Client name"), "Home hub");
    await user.click(screen.getByLabelText("worktime:admin (team-wide administration)"));
    await user.click(screen.getByRole("button", { name: "Create client" }));
    expect(await screen.findByText("wtic_secret")).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith("/api/integration-clients", expect.objectContaining({ body: JSON.stringify({ name: "Home hub", scopes: ["worktime:mcp", "worktime:admin"] }) }));
  });

  it("hides admin scope from non-admin users", async () => {
    renderHarness(async () => jsonResponse({ items: [], total: 0 }));
    await screen.findByText("No integration clients yet.");
    expect(screen.queryByLabelText(/worktime:admin/)).not.toBeInTheDocument();
  });

  it("rotates a key after confirmation and reveals the replacement once", async () => {
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === "/api/integration-clients/7/rotate" && init?.method === "POST") return jsonResponse({ id: 7, name: "Home hub", key: "wtic_replacement", scopes: ["worktime:mcp"], rate_limit_per_minute: 120, created_at: "2026-08-22T00:00:00Z" });
      if (input === "/api/integration-clients") return jsonResponse({ items: [{ id: 7, name: "Home hub", key_preview: "ement", scopes: ["worktime:mcp"], rate_limit_per_minute: 120, is_active: true, created_at: "2026-08-22T00:00:00Z", last_used_at: null, revoked_at: null }], total: 1 });
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${input}`);
    });
    const user = userEvent.setup();
    renderHarness(fetchFn);
    await user.click(await screen.findByRole("button", { name: "Rotate" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Rotate" }));
    expect(await screen.findByText("wtic_replacement")).toBeInTheDocument();
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith("/api/integration-clients/7/rotate", { method: "POST" }));
  });
});
