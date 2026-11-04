import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsCalendarFeedSection } from "@/components/settings/account/SettingsCalendarFeedSection";
import { ToastProvider } from "@/contexts/ToastContext";

function renderSection(fetchFn: (input: string, init?: RequestInit) => Promise<Response>) {
  return render(
    <ToastProvider>
      <SettingsCalendarFeedSection fetchFn={fetchFn} />
    </ToastProvider>,
  );
}

describe("SettingsCalendarFeedSection", () => {
  it("clears the parent's load warning when generating after a failed load", async () => {
    const onLoadError = vi.fn();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url_path: "/api/ical/new.ics" })));
    render(
      <ToastProvider>
        <SettingsCalendarFeedSection fetchFn={fetchFn} onLoadError={onLoadError} />
      </ToastProvider>,
    );
    await waitFor(() => expect(onLoadError).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(await screen.findByDisplayValue(/new.ics$/)).toBeInTheDocument();
    expect(onLoadError).toHaveBeenLastCalledWith(false);
  });

  it("shows an existing subscription without rotating its secret", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ configured: true, last_used_at: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderSection(fetchFn);

    expect(await screen.findByText(/A calendar subscription is active/i)).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith("/api/ical");
    expect(screen.queryByLabelText("Calendar subscription URL")).not.toBeInTheDocument();
    expect(screen.getByText("Not fetched yet")).toBeInTheDocument();
  });

  it("shows when the calendar provider last fetched the feed", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ configured: true, last_used_at: "2026-08-22T18:30:00Z" }), {
        status: 200,
      }),
    );

    renderSection(fetchFn);

    expect(await screen.findByText(/Last fetched:/)).toHaveTextContent("2026");
  });

  it("warns before replacing an active subscription", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url_path: "/api/ical/wtical_replacement.ics" }), {
          status: 201,
        }),
      );

    renderSection(fetchFn);
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));

    expect(screen.getByText(/current link will stop working immediately/i)).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledOnce();

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Regenerate" }));

    await waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(fetchFn).toHaveBeenLastCalledWith("/api/ical", { method: "POST" });
    expect(await screen.findByDisplayValue(/wtical_replacement\.ics$/)).toBeInTheDocument();
  });

  it("shows which link is active after a reload", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ configured: true, token_preview: "f3a9", last_used_at: null }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    renderSection(fetchFn);

    expect(await screen.findByText("Active link ends in f3a9.")).toBeInTheDocument();
  });

  it("asks for confirmation before revoking the subscription", async () => {
    const fetchFn = vi.fn(async (_input: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify({ configured: true, token_preview: "f3a9" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
    );
    renderSection(fetchFn);

    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));

    // Nothing is sent until the user confirms.
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Revoke the calendar link?")).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalledWith("/api/ical", { method: "DELETE" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(fetchFn).not.toHaveBeenCalledWith("/api/ical", { method: "DELETE" });

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Revoke" }),
    );
    await waitFor(() => expect(fetchFn).toHaveBeenCalledWith("/api/ical", { method: "DELETE" }));
  });
});
