import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { OngoingConflictDialog } from "@/components/sync/OngoingConflictDialog";
import type { SyncPushPayload } from "@/utils/syncClient";

function emptyPayload(): SyncPushPayload {
  return { labels: [], tasks: [], templates: [], work_locations: [], time_off_entries: [], gantt_tasks: [] };
}

describe("OngoingConflictDialog", () => {
  describe("visibility", () => {
    it("does not render when show is false", () => {
      render(
        <OngoingConflictDialog
          show={false}
          conflictCount={1}
          conflictedPayload={emptyPayload()}
          onResolve={vi.fn()}
        />,
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders dialog when show is true", () => {
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={2}
          conflictedPayload={emptyPayload()}
          onResolve={vi.fn()}
        />,
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("content", () => {
    it("shows the conflict count in the title", () => {
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={3}
          conflictedPayload={emptyPayload()}
          onResolve={vi.fn()}
        />,
      );
      // The title should include the count (plural form for count > 1)
      expect(screen.getByText(/3 records overwritten/i)).toBeInTheDocument();
    });

    it("shows entity type counts for conflicted labels", () => {
      const payload: SyncPushPayload = {
        ...emptyPayload(),
        labels: [{ id: "l1", action: "update", client_updated_at: "2026-01-01T00:00:00.000Z" }],
        tasks: [
          { id: "t1", action: "update", client_updated_at: "2026-01-01T00:00:00.000Z" },
          { id: "t2", action: "update", client_updated_at: "2026-01-01T00:00:00.000Z" },
        ],
      };
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={3}
          conflictedPayload={payload}
          onResolve={vi.fn()}
        />,
      );
      expect(screen.getByText(/1 labels/i)).toBeInTheDocument();
      expect(screen.getByText(/2 tasks/i)).toBeInTheDocument();
    });

    it("does not show entity rows with zero counts", () => {
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={1}
          conflictedPayload={emptyPayload()}
          onResolve={vi.fn()}
        />,
      );
      expect(screen.queryByText(/0/)).not.toBeInTheDocument();
    });
  });

  describe("resolution choices", () => {
    it("Confirm button is disabled until a choice is selected", () => {
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={1}
          conflictedPayload={emptyPayload()}
          onResolve={vi.fn()}
        />,
      );
      expect(screen.getByRole("button", { name: /apply/i })).toBeDisabled();
    });

    it("selecting 'Keep server version' enables Confirm", async () => {
      const user = userEvent.setup();
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={1}
          conflictedPayload={emptyPayload()}
          onResolve={vi.fn()}
        />,
      );
      await user.click(screen.getByRole("button", { name: /keep server version/i }));
      expect(screen.getByRole("button", { name: /apply/i })).toBeEnabled();
    });

    it("selecting 'Keep my version' enables Confirm", async () => {
      const user = userEvent.setup();
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={1}
          conflictedPayload={emptyPayload()}
          onResolve={vi.fn()}
        />,
      );
      await user.click(screen.getByRole("button", { name: /keep my version/i }));
      expect(screen.getByRole("button", { name: /apply/i })).toBeEnabled();
    });

    it("clicking Confirm with 'Keep server version' calls onResolve('keep-server')", async () => {
      const user = userEvent.setup();
      const onResolve = vi.fn();
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={1}
          conflictedPayload={emptyPayload()}
          onResolve={onResolve}
        />,
      );
      await user.click(screen.getByRole("button", { name: /keep server version/i }));
      await user.click(screen.getByRole("button", { name: /apply/i }));
      expect(onResolve).toHaveBeenCalledWith("keep-server");
    });

    it("clicking Confirm with 'Keep my version' calls onResolve('keep-mine')", async () => {
      const user = userEvent.setup();
      const onResolve = vi.fn();
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={1}
          conflictedPayload={emptyPayload()}
          onResolve={onResolve}
        />,
      );
      await user.click(screen.getByRole("button", { name: /keep my version/i }));
      await user.click(screen.getByRole("button", { name: /apply/i }));
      expect(onResolve).toHaveBeenCalledWith("keep-mine");
    });

    it("clicking Dismiss calls onResolve('keep-server') without requiring a selection", async () => {
      const user = userEvent.setup();
      const onResolve = vi.fn();
      render(
        <OngoingConflictDialog
          show={true}
          conflictCount={1}
          conflictedPayload={emptyPayload()}
          onResolve={onResolve}
        />,
      );
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(onResolve).toHaveBeenCalledWith("keep-server");
    });
  });
});
