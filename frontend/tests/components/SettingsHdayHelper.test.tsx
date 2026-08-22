import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { SettingsHdayHelper } from "@/components/settings/SettingsHdayHelper";
import { DeveloperOptionsProvider } from "@/contexts/DeveloperOptionsContext";
import { server } from "@/mocks/server";
import * as m from "@/paraglide/messages.js";

function renderHelper() {
  return render(
    <DeveloperOptionsProvider>
      <SettingsHdayHelper />
    </DeveloperOptionsProvider>,
  );
}

describe("SettingsHdayHelper", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("warns about mixed content for a LAN HTTP helper on an HTTPS page", async () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    const user = userEvent.setup();
    renderHelper();

    await user.type(
      screen.getByLabelText(m.dev_hday_helper_url_label()),
      "http://planner.local:8080",
    );

    expect(await screen.findByText(m.dev_hday_helper_mixed_content_warning())).toBeInTheDocument();
  });

  it("allows and health-checks an HTTP localhost helper", async () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    server.use(http.get("http://localhost:8080/health", () => HttpResponse.json({ status: "ok" })));
    const user = userEvent.setup();
    renderHelper();

    await user.type(screen.getByLabelText(m.dev_hday_helper_url_label()), "http://localhost:8080");
    await user.click(screen.getByRole("button", { name: m.dev_hday_helper_test() }));

    expect(screen.queryByText(m.dev_hday_helper_mixed_content_warning())).not.toBeInTheDocument();
    expect(await screen.findByText(m.dev_hday_helper_connected())).toBeInTheDocument();
    expect(screen.getByText(m.dev_connected())).toBeInTheDocument();
  });
});
