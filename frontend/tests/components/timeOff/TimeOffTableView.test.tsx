import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/contexts/ToastContext";
import { getLocale, setLocale } from "@/paraglide/runtime.js";
import { TimeOffTableView } from "@/components/timeOff/TimeOffTableView";
import type { TimeOffEntry } from "@/lib/timeOff/types";

const entries: TimeOffEntry[] = [
  {
    id: "range",
    entryKind: "range",
    start: "2026-01-05",
    end: "2026-01-09",
    entryType: "vacation",
    entryFlag: "full_day",
    note: "Ski trip",
  },
  {
    id: "date",
    entryKind: "date",
    date: "2026-02-01",
    entryType: "business",
    entryFlag: "full_day",
    note: "Conference",
  },
  {
    id: "weekly",
    entryKind: "weekly",
    weekday: 3,
    entryType: "in",
    entryFlag: "full_day",
    note: null,
  },
];

const manyEntries: TimeOffEntry[] = Array.from({ length: 25 }, (_, index) => ({
  id: `day-${index}`,
  entryKind: "date" as const,
  date: `2026-03-${String(index + 1).padStart(2, "0")}`,
  entryType: "vacation" as const,
  entryFlag: "full_day" as const,
  note: `Day ${index + 1}`,
}));

function renderTable(overrides: Partial<Parameters<typeof TimeOffTableView>[0]> = {}) {
  const onSetSelection = vi.fn();
  render(
    <ToastProvider>
      <TimeOffTableView
        eventCount={entries.length}
        selectedCount={0}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onBulkDelete={vi.fn()}
        onImport={vi.fn()}
        onExport={vi.fn()}
        isPullingFromHelper={false}
        isPushingToHelper={false}
        onAddEvent={vi.fn()}
        viewMode="table"
        entries={entries}
        selectedIds={new Set()}
        onToggleSelection={vi.fn()}
        onEditEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onSetSelection={onSetSelection}
        rawEditorText=""
        isRawEditorDirty={false}
        onChangeRawEditorText={vi.fn()}
        onApplyRawEditor={vi.fn()}
        onResetRawEditor={vi.fn()}
        {...overrides}
      />
    </ToastProvider>,
  );
  return { onSetSelection };
}

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("TimeOffTableView", () => {
  it("opens sorted by start date with weekly entries last", () => {
    renderTable();
    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent("Ski trip");
    expect(rows[1]).toHaveTextContent("Conference");
    expect(rows[2]).toHaveTextContent("Every");
    expect(screen.getByRole("columnheader", { name: /Date \/ Pattern/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  it("re-sorts when a column header is clicked", async () => {
    renderTable();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Title/ }));
    // Ascending by title: blank (weekly) first, then Conference, then Ski trip.
    expect(bodyRows()[1]).toHaveTextContent("Conference");
    expect(bodyRows()[2]).toHaveTextContent("Ski trip");
    await user.click(screen.getByRole("button", { name: /Title/ }));
    expect(bodyRows()[0]).toHaveTextContent("Ski trip");
  });

  it("filters rows by search text, including the date", async () => {
    renderTable();
    const user = userEvent.setup();
    const search = screen.getByRole("searchbox", { name: /search time-off events/i });

    await user.type(search, "conf");
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent("Conference");

    await user.clear(search);
    await user.type(search, "2026/01");
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent("Ski trip");
  });

  it("shows an empty state when nothing matches", async () => {
    renderTable();
    await userEvent.setup().type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No matching events")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("header checkbox only selects the rows matching the search", async () => {
    const { onSetSelection } = renderTable();
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "conf");
    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    expect(onSetSelection).toHaveBeenCalledWith(["date"], true);
  });

  describe("pagination", () => {
    it("shows 20 rows per page and pages through the rest", async () => {
      renderTable({ entries: manyEntries, eventCount: manyEntries.length });
      const user = userEvent.setup();

      expect(bodyRows()).toHaveLength(20);
      expect(screen.getByText("Showing 1–20 of 25")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(bodyRows()).toHaveLength(5);
      expect(bodyRows()[0]).toHaveTextContent("Day 21");
      expect(screen.getByText("Showing 21–25 of 25")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("changes the page size", async () => {
      renderTable({ entries: manyEntries, eventCount: manyEntries.length });
      await userEvent
        .setup()
        .selectOptions(screen.getByRole("combobox", { name: /rows per page/i }), "50");
      expect(bodyRows()).toHaveLength(25);
    });

    it("counts search results, not all entries, and returns to the first page", async () => {
      renderTable({ entries: manyEntries, eventCount: manyEntries.length });
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Next" }));
      await user.type(screen.getByRole("searchbox"), "Day 2");
      // Day 2 and Day 20–25 => 7 matches, all on page one.
      expect(await screen.findByText("Showing 1–7 of 7")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    });

    it("header checkbox selects only the current page", async () => {
      const { onSetSelection } = renderTable({
        entries: manyEntries,
        eventCount: manyEntries.length,
      });
      await userEvent.setup().click(screen.getByRole("checkbox", { name: /select all/i }));
      const [ids, selected] = onSetSelection.mock.calls[0];
      expect(ids).toHaveLength(20);
      expect(selected).toBe(true);
    });
  });

  describe("event type names", () => {
    const originalLocale = getLocale();

    afterEach(async () => {
      await setLocale(originalLocale, { reload: false });
    });

    it("shows the type badge in the active language", async () => {
      await setLocale("nl", { reload: false });
      renderTable();

      // "range" is a vacation, "date" is business, "weekly" is "in office" in the fixture data.
      const badges = Array.from(document.querySelectorAll(".event-type-badge")).map((el) =>
        el.textContent?.trim(),
      );
      expect(badges.join(" ")).toContain("Vakantie");
      expect(badges.join(" ")).toContain("Zakenreis");
      expect(badges.join(" ")).not.toContain("Business trip");
    });

    it("keeps English when the locale is English", async () => {
      await setLocale("en", { reload: false });
      renderTable();

      const badges = Array.from(document.querySelectorAll(".event-type-badge")).map((el) =>
        el.textContent?.trim(),
      );
      expect(badges.join(" ")).toContain("Holiday");
      expect(badges.join(" ")).toContain("Business trip");
    });
  });
});
