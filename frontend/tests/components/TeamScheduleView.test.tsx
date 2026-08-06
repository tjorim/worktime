import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { TeamScheduleView } from "@/components/TeamScheduleView";
import { server } from "@/mocks/server";
import { DEVELOPER_OPTIONS_STORAGE_KEY, LAST_TEAM_ID_STORAGE_KEY } from "@/constants/storageKeys";
import * as m from "@/paraglide/messages.js";
import { TestProviders } from "../utils/testProviders";

const HELPER_URL = "http://localhost:8080";

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

function teamHdayPayload(teamId: string) {
  return {
    team_id: teamId,
    name: "Engineering",
    sections: [
      {
        title: null,
        members: [
          { username: "alice", display_name: "Alice", raw: "", events: [], etag: null },
        ],
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

  it("shows a backend-required message until the connection is established", () => {
    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(screen.getByText(m.team_backend_required_heading())).toBeInTheDocument();
  });

  it("routes team requests to the same-origin API and explains that no helper is configured", async () => {
    seedConnectedOptions(null);
    server.use(
      http.get("*/api/team/:teamId/hday", ({ params }) =>
        HttpResponse.json(teamHdayPayload(params.teamId as string)),
      ),
    );

    const user = userEvent.setup();
    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    expect(await screen.findByText(m.team_no_helper_configured())).toBeInTheDocument();

    await user.type(screen.getByLabelText(m.team_id_label()), "eng");
    await user.click(screen.getByRole("button", { name: m.team_load_btn() }));

    expect(await screen.findByText("Engineering")).toBeInTheDocument();
  });

  it("gives a helper-configuration hint when the same-origin team endpoint 404s", async () => {
    seedConnectedOptions(null);
    server.use(
      http.get("*/api/team/:teamId/hday", () =>
        HttpResponse.json({ detail: "Not Found" }, { status: 404 }),
      ),
    );

    const user = userEvent.setup();
    render(
      <TestProviders>
        <TeamScheduleView />
      </TestProviders>,
    );

    await screen.findByText(m.team_no_helper_configured());
    await user.type(screen.getByLabelText(m.team_id_label()), "eng");
    await user.click(screen.getByRole("button", { name: m.team_load_btn() }));

    expect(
      await screen.findByText(m.team_fetch_failed({ error: m.team_fetch_404_no_helper_hint({ error: "Not Found" }) })),
    ).toBeInTheDocument();
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
    expect(screen.queryByText(m.team_no_helper_configured())).not.toBeInTheDocument();
  });
});
