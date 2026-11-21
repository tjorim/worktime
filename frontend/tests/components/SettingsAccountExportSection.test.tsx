import type { UserDataExport } from "@/api-types";
import { jsonResponse, uncheckedJson } from "@/mocks/response";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsAccountExportSection } from "@/features/settings/account/SettingsAccountExportSection";
import * as m from "@/paraglide/messages.js";

describe("SettingsAccountExportSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // jsdom does not implement these; remove what the test installed.
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("downloads the account export as a JSON file", async () => {
    const exportData: UserDataExport = {
      exported_at: "2026-01-01T00:00:00Z",
      user: { id: 42, username: "alice", display_name: "Alice" },
      labels: [],
      time_tracking_tasks: [],
      time_tracking_templates: [],
      work_locations: [],
      gantt_tasks: [],
      time_off_entries: [],
      preferences: {},
    };
    const payload = JSON.stringify(exportData);
    const fetchFn = vi.fn(async () => jsonResponse<UserDataExport>(exportData));
    const createObjectURL = vi.fn(() => "blob:account-export");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();

    render(<SettingsAccountExportSection accountId={42} fetchFn={fetchFn} />);
    await user.click(screen.getByRole("button", { name: m.account_export_btn() }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(fetchFn).toHaveBeenCalledWith("/api/users/42/export");
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe(payload);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:account-export");
  });

  it("shows a translated error, not the server's detail, when the export fails", async () => {
    const fetchFn = vi.fn(async () =>
      uncheckedJson("error", { detail: "database exploded" }, { status: 500 }),
    );
    const user = userEvent.setup();

    render(<SettingsAccountExportSection accountId={42} fetchFn={fetchFn} />);
    await user.click(screen.getByRole("button", { name: m.account_export_btn() }));

    expect(await screen.findByRole("alert")).toHaveTextContent(m.account_export_failed());
    expect(screen.queryByText(/database exploded/)).not.toBeInTheDocument();
  });

  it("explains why the button is disabled until the account has loaded", () => {
    render(<SettingsAccountExportSection accountId={null} fetchFn={vi.fn()} />);

    const button = screen.getByRole("button", { name: m.account_export_btn() });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(m.account_export_unavailable());
  });
});
