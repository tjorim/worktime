import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { TeamScheduleView } from "@/components/TeamScheduleView";
import { useDeveloperOptions } from "@/contexts/DeveloperOptionsContext";
import { server } from "@/mocks/server";
import { DEVELOPER_OPTIONS_STORAGE_KEY, LAST_TEAM_ID_STORAGE_KEY } from "@/constants/storageKeys";
import * as m from "@/paraglide/messages.js";
import { TestProviders } from "../utils/testProviders";

const HELPER_URL = "http://localhost:8080";
const OTHER_HELPER_URL = "http://localhost:9090";

// Test-only harness for driving updateHdayHelperUrl() from outside DevOptionsPanel,
// sharing the same DeveloperOptionsContext instance as the rendered TeamScheduleView.
function HelperUrlSwitcher({ url }: { url: string }) {
  const { updateHdayHelperUrl } = useDeveloperOptions();
  return (
    <button type="button" onClick={() => updateHdayHelperUrl(url)}>
      switch helper
    </button>
  );
}

function seedConnectedOptions(hdayHelperUrl: string | null) {
  window.localStorage.setItem(
    DEVELOPER_OPTIONS_STORAGE_KEY,
    JSON.stringify({
      enabled: true,
      // Autoconnect kicks off the mocked /api/health test-connection on mount;
      // the provider always resets connectionStatus to "disconnected" first.
      autoConnect: true,
      connectionStatus: "disconnected",
      lastConnectionTest: null,
      isDevMode: true,
      hdayHelperUrl,
    }),
  );
}

function teamHdayPayload(teamId: string, name = "Engineering") {
  return {
    team_id: teamId,
    name,
    sections: [
      {
        title: null,
        members: [{ username: "alice", display_name: "Alice", raw: "", events: [], etag: null }],
      },
    ],
    members: [{ username: "alice", display_name: "Alice", raw: "", events: [], etag: null }],
  };
}

describe("TeamScheduleView", () => {
  beforeEach(() => {
    localStorage.clear();
    server.use(http.get("*/api/health", () => HttpResponse.json({ status: "ok" })));
  });

  it("guards direct rendering when no helper is configured", () => {
    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(screen.getByText(m.team_helper_required_heading())).toBeInTheDocument();
    expect(screen.queryByText(m.team_backend_required_heading())).not.toBeInTheDocument();
  });

  it("requires a configured helper and never falls back to the app's own origin", async () => {
    seedConnectedOptions(null);
    // No handler for */api/team/*hday is registered — MSW's onUnhandledRequest: "error"
    // means the test fails loudly if the view ever attempts that request.

    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(await screen.findByText(m.team_helper_required_heading())).toBeInTheDocument();
    expect(screen.queryByLabelText(m.team_id_label())).not.toBeInTheDocument();
  });

  it("routes team requests to the configured local helper instead of the app origin", async () => {
    seedConnectedOptions(HELPER_URL);
    window.localStorage.setItem(LAST_TEAM_ID_STORAGE_KEY, "eng");
    server.use(
      http.get(`${HELPER_URL}/team/:teamId/hday`, ({ params }) =>
        HttpResponse.json(teamHdayPayload(params.teamId as string)),
      ),
    );

    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(await screen.findByText("Engineering")).toBeInTheDocument();
    expect(screen.queryByText(m.team_helper_required_heading())).not.toBeInTheDocument();
  });

  it("clears stale data and refetches when the configured helper changes", async () => {
    seedConnectedOptions(HELPER_URL);
    window.localStorage.setItem(LAST_TEAM_ID_STORAGE_KEY, "eng");
    server.use(
      http.get(`${HELPER_URL}/team/:teamId/hday`, ({ params }) =>
        HttpResponse.json(teamHdayPayload(params.teamId as string, "Team from helper A")),
      ),
      http.get(`${OTHER_HELPER_URL}/team/:teamId/hday`, ({ params }) =>
        HttpResponse.json(teamHdayPayload(params.teamId as string, "Team from helper B")),
      ),
    );

    const user = userEvent.setup();
    render(
      <TestProviders>
        <HelperUrlSwitcher url={OTHER_HELPER_URL} />
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(await screen.findByText("Team from helper A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "switch helper" }));

    expect(await screen.findByText("Team from helper B")).toBeInTheDocument();
    expect(screen.queryByText("Team from helper A")).not.toBeInTheDocument();
  });
});
