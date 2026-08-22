import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsAuditTrailSection } from "@/components/settings/account/SettingsAuditTrailSection";
import { useSettingsAuditTrail } from "@/pages/settings/hooks/useSettingsAuditTrail";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

const entry = (id: number) => ({
  id,
  actor_user_id: 7,
  actor_label: "integration:Pebble",
  subject: null,
  auth_source: "integration_client",
  action: "update",
  resource_type: "time_entry",
  resource_id: `entry-${id}`,
  request_id: null,
  details: { field: "stop_time" },
  created_at: "2026-08-22T08:30:00Z",
});

function Harness({
  fetchFn,
  userId,
  teamWide = false,
}: {
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  userId?: number;
  teamWide?: boolean;
}) {
  const trail = useSettingsAuditTrail({ enabled: true, userId, fetchFn });
  return (
    <SettingsAuditTrailSection
      {...trail}
      teamWide={teamWide}
      onLoadMore={() => void trail.loadMore()}
    />
  );
}

describe("SettingsAuditTrailSection", () => {
  it("loads the personal trail with an explicit user scope and renders its client", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ items: [entry(30)], total: 1 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<Harness fetchFn={fetchFn} userId={7} />);

    expect(await screen.findByText("update · time entry entry-30")).toBeInTheDocument();
    expect(screen.getByText("integration:Pebble (integration client)")).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith("/api/audit?limit=25&user_id=7");
  });

  it("paginates the team-wide trail without adding a user filter", async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => entry(100 - index));
    const fetchFn = vi.fn(async (input: string) => {
      const items = input.includes("before_id=76") ? [entry(75)] : firstPage;
      return new Response(JSON.stringify({ items, total: items.length }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const user = userEvent.setup();

    render(<Harness fetchFn={fetchFn} teamWide />);
    await user.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("update · time entry entry-75")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchFn).toHaveBeenLastCalledWith("/api/audit?limit=25&before_id=76");
    });
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("ignores a stale pagination response after the API client changes", async () => {
    const stalePage = deferred<Response>();
    const firstPage = Array.from({ length: 25 }, (_, index) => entry(100 - index));
    const initialFetch = vi
      .fn<(input: string) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: firstPage })))
      .mockReturnValueOnce(stalePage.promise);
    const renewedFetch = vi.fn(async () =>
      new Response(JSON.stringify({ items: [entry(200)] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    const { rerender } = render(<Harness fetchFn={initialFetch} teamWide />);

    await user.click(await screen.findByRole("button", { name: "Load more" }));
    rerender(<Harness fetchFn={renewedFetch} teamWide />);
    expect(await screen.findByText("update · time entry entry-200")).toBeInTheDocument();

    stalePage.resolve(
      new Response(JSON.stringify({ items: [entry(75)] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => expect(screen.queryByText("update · time entry entry-75")).not.toBeInTheDocument());
    expect(screen.queryByText("update · time entry entry-100")).not.toBeInTheDocument();
  });
});
