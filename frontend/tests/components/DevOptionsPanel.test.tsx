import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevOptionsPanel } from "@/components/DevOptionsPanel";
import { AuthProvider } from "@/contexts/AuthContext";
import { DeveloperOptionsProvider } from "@/contexts/DeveloperOptionsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import * as m from "@/paraglide/messages.js";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <DeveloperOptionsProvider>
      <ToastProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ToastProvider>
    </DeveloperOptionsProvider>,
  );
}

describe("DevOptionsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("warns about mixed content when the app is https and a LAN helper URL is http", async () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });

    const user = userEvent.setup();
    renderWithProviders(<DevOptionsPanel show onHide={vi.fn()} />);

    await user.type(
      screen.getByLabelText(m.dev_hday_helper_url_label()),
      "http://planner.local:8080",
    );

    expect(await screen.findByText(m.dev_hday_helper_mixed_content_warning())).toBeInTheDocument();
  });

  it("does not warn for an http localhost helper on an https page", async () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });

    const user = userEvent.setup();
    renderWithProviders(<DevOptionsPanel show onHide={vi.fn()} />);

    await user.type(screen.getByLabelText(m.dev_hday_helper_url_label()), "http://localhost:8080");

    expect(screen.queryByText(m.dev_hday_helper_mixed_content_warning())).not.toBeInTheDocument();
  });

  it("does not warn when the helper URL is https", async () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });

    const user = userEvent.setup();
    renderWithProviders(<DevOptionsPanel show onHide={vi.fn()} />);

    await user.type(
      screen.getByLabelText(m.dev_hday_helper_url_label()),
      "https://helper.example.com",
    );

    expect(screen.queryByText(m.dev_hday_helper_mixed_content_warning())).not.toBeInTheDocument();
  });
});
