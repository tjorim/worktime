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
  it("shows an existing subscription without rotating its secret", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderSection(fetchFn);

    expect(await screen.findByText(/A calendar subscription is active/i)).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith("/api/ical");
    expect(screen.queryByLabelText("Calendar subscription URL")).not.toBeInTheDocument();
  });

  it("warns before replacing an active subscription", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url_path: "/api/ical/wtical_replacement.ics" }), { status: 201 }),
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
});
