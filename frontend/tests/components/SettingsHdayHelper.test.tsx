import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { SettingsHdayHelper } from "@/components/settings/SettingsHdayHelper";
import { HdayHelperProvider, useHdayHelper } from "@/contexts/HdayHelperContext";
import { server } from "@/mocks/server";
import * as m from "@/paraglide/messages.js";
import { TestProviders } from "@tests/utils/testProviders";

function renderHelper() {
  return render(
    <TestProviders>
      <SettingsHdayHelper />
    </TestProviders>,
  );
}

function ProbeRaceHarness() {
  const { options, helperConnectionStatus, testHdayHelperConnection, updateHdayHelperUrl } =
    useHdayHelper();
  return (
    <>
      <output>{options.hdayHelperUrl ?? "none"}</output>
      <output>{helperConnectionStatus}</output>
      <button type="button" onClick={() => void testHdayHelperConnection("http://helper-a:8080")}>
        A
      </button>
      <button
        type="button"
        onClick={() => {
          updateHdayHelperUrl("http://helper-b:8080");
          void testHdayHelperConnection("http://helper-b:8080");
        }}
      >
        B
      </button>
    </>
  );
}

describe("SettingsHdayHelper", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("warns about mixed content for a LAN HTTP helper on an HTTPS page", async () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    const user = userEvent.setup();
    renderHelper();

    await user.type(screen.getByLabelText(m.hday_helper_url_label()), "http://planner.local:8080");

    expect(await screen.findByText(m.hday_helper_mixed_content_warning())).toBeInTheDocument();
  });

  it("allows and health-checks an HTTP localhost helper", async () => {
    vi.stubGlobal("location", { ...window.location, protocol: "https:" });
    server.use(http.get("http://localhost:8080/health", () => HttpResponse.json({ status: "ok" })));
    const user = userEvent.setup();
    renderHelper();

    await user.type(screen.getByLabelText(m.hday_helper_url_label()), "http://localhost:8080");
    await user.click(screen.getByRole("button", { name: m.hday_helper_test() }));

    expect(screen.queryByText(m.hday_helper_mixed_content_warning())).not.toBeInTheDocument();
    expect(await screen.findByText(m.hday_helper_connected())).toBeInTheDocument();
    expect(screen.getByText(m.dev_connected())).toBeInTheDocument();
  });

  it("rejects relative helper URLs without saving or testing them", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderHelper();

    await user.type(screen.getByLabelText(m.hday_helper_url_label()), "/api");
    await user.click(screen.getByRole("button", { name: m.hday_helper_save_url() }));

    expect(screen.getByText(m.hday_helper_url_invalid())).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: m.hday_helper_test() }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores a stale health result after the helper URL changes", async () => {
    const resolvers = new Map<string, (response: Response) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (input: RequestInfo | URL) =>
          new Promise<Response>((resolve) => resolvers.set(String(input), resolve)),
      ),
    );
    const user = userEvent.setup();
    render(
      <HdayHelperProvider>
        <ProbeRaceHarness />
      </HdayHelperProvider>,
    );

    await user.click(screen.getByRole("button", { name: "A" }));
    await user.click(screen.getByRole("button", { name: "B" }));
    await waitFor(() => expect(resolvers.has("http://helper-b:8080/health")).toBe(true));

    await act(async () => {
      resolvers.get("http://helper-a:8080/health")?.(Response.json({ status: "ok" }));
    });

    expect(screen.getByText("http://helper-b:8080")).toBeInTheDocument();
    expect(screen.queryByText("connected")).not.toBeInTheDocument();

    await act(async () => {
      resolvers.get("http://helper-b:8080/health")?.(Response.json({ status: "ok" }));
    });
    expect(await screen.findByText("connected")).toBeInTheDocument();
  });

  it("saves the .hday username as account-synced settings, independent of the device-local helper URL", async () => {
    const user = userEvent.setup();
    renderHelper();

    const usernameInput = screen.getByLabelText(m.hday_username_label());
    const saveButton = screen.getByRole("button", { name: m.hday_username_save() });
    expect(saveButton).toBeDisabled();

    await user.type(usernameInput, "jsmith");
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);
    expect(saveButton).toBeDisabled();

    // Re-rendering with a fresh provider tree reloads settings from storage,
    // proving the username was actually persisted (not just local component state).
    renderHelper();
    const usernameInputs = screen.getAllByLabelText(m.hday_username_label());
    expect(usernameInputs[usernameInputs.length - 1]).toHaveValue("jsmith");
  });

  it("clears the saved username when saved as blank", async () => {
    const user = userEvent.setup();
    renderHelper();

    await user.type(screen.getByLabelText(m.hday_username_label()), "jsmith");
    await user.click(screen.getByRole("button", { name: m.hday_username_save() }));

    await user.clear(screen.getByLabelText(m.hday_username_label()));
    await user.click(screen.getByRole("button", { name: m.hday_username_save() }));

    renderHelper();
    const usernameInputs = screen.getAllByLabelText(m.hday_username_label());
    expect(usernameInputs[usernameInputs.length - 1]).toHaveValue("");
  });
});
