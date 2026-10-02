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

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");

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

  it("shows the header checkbox as mixed while only some visible rows are selected", () => {
    renderTable({ selectedIds: new Set(["date"]) });
    expect(screen.getByRole("checkbox", { name: /select all/i })).toHaveAttribute(
      "aria-checked",
      "mixed",
    );
    expect(screen.getByRole("checkbox", { name: /select conference/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /select ski trip/i })).not.toBeChecked();
  });

  it("checks the header checkbox once every visible row is selected", () => {
    renderTable({ selectedIds: new Set(entries.map((entry) => entry.id)) });
    expect(screen.getByRole("checkbox", { name: /select all/i })).toBeChecked();
  });

  it("colours each type badge from its own palette entry", () => {
    renderTable();
    const classes = (label: string) =>
      screen.getByText(label, { selector: "[data-event-type-badge]" }).className;
    expect(classes("Holiday")).toContain("tw:bg-wt-event-holiday-full-bg");
    expect(classes("Business trip")).toContain("tw:bg-wt-event-business-full-bg");
    expect(classes("In office")).toContain("tw:bg-wt-event-in-full-bg");
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
      const user = userEvent.setup();
      await user.click(screen.getByRole("combobox", { name: /rows per page/i }));
      await user.click(await screen.findByRole("option", { name: "50" }));
      expect(bodyRows()).toHaveLength(25);
    });

    it("changes page size with the keyboard and returns focus to the trigger", async () => {
      renderTable({ entries: manyEntries, eventCount: manyEntries.length });
      const user = userEvent.setup();
      const trigger = screen.getByRole("combobox", { name: /rows per page/i });
      trigger.focus();
      await user.keyboard("{Enter}{Home}{Enter}");
      expect(bodyRows()).toHaveLength(10);
      expect(trigger).toHaveFocus();
      expect(screen.getByText("Showing 1–10 of 25")).toBeInTheDocument();
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
      const [ids, selected] = onSetSelection.mock.calls[0]!;
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
      const badges = Array.from(document.querySelectorAll("[data-event-type-badge]")).map((el) =>
        el.textContent?.trim(),
      );
      expect(badges.join(" ")).toContain("Vakantie");
      expect(badges.join(" ")).toContain("Zakenreis");
      expect(badges.join(" ")).not.toContain("Business trip");
    });

    it("keeps English when the locale is English", async () => {
      await setLocale("en", { reload: false });
      renderTable();

      const badges = Array.from(document.querySelectorAll("[data-event-type-badge]")).map((el) =>
        el.textContent?.trim(),
      );
      expect(badges.join(" ")).toContain("Holiday");
      expect(badges.join(" ")).toContain("Business trip");
    });
  });

  describe("selection while searching", () => {
    // Fixture order by start date: range (2026-01-05), date (2026-02-01), weekly.

    it("selects every entry with Select All when no search is active", async () => {
      const { onSetSelection } = renderTable({
        selectedCount: 1,
        selectedIds: new Set(["weekly"]),
      });
      await userEvent.setup().click(screen.getByRole("button", { name: /^select all events$/i }));
      expect(onSetSelection).toHaveBeenCalledWith(["range", "date", "weekly"], true);
    });

    it("only selects the matching entries once a search is active, on every page", async () => {
      const { onSetSelection } = renderTable({
        selectedCount: 1,
        selectedIds: new Set(["weekly"]),
      });
      const user = userEvent.setup();
      // "2026" is in the dates of the range and the single day, but not in the weekly pattern.
      await user.type(screen.getByRole("searchbox"), "2026");
      onSetSelection.mockClear();

      await user.click(
        screen.getByRole("button", { name: /select all events matching the search/i }),
      );
      expect(onSetSelection).toHaveBeenCalledTimes(1);
      expect(onSetSelection).toHaveBeenCalledWith(["range", "date"], true);
    });

    it("labels the button as scoped to the search", async () => {
      renderTable({ selectedCount: 1, selectedIds: new Set(["range"]) });
      expect(screen.getByRole("button", { name: /^select all events$/i })).toBeInTheDocument();
      await userEvent.setup().type(screen.getByRole("searchbox"), "ski");
      expect(screen.getByRole("button", { name: /select all events matching/i })).toHaveTextContent(
        "Select all matching",
      );
    });

    it("disables Select All once every matching entry is already selected", async () => {
      renderTable({ selectedCount: 1, selectedIds: new Set(["range"]) });
      await userEvent.setup().type(screen.getByRole("searchbox"), "ski");
      // Only "Ski trip" matches, and it is the one selected.
      expect(screen.getByRole("button", { name: /select all events matching/i })).toBeDisabled();
    });

    it("drops selected entries the new search hides", async () => {
      const { onSetSelection } = renderTable({
        selectedCount: 2,
        selectedIds: new Set(["range", "weekly"]),
      });
      await userEvent.setup().type(screen.getByRole("searchbox"), "conf");

      // Final query "conf" only matches the single day, so both selected entries are hidden.
      const [ids, selected] = onSetSelection.mock.calls.at(-1)!;
      expect([...ids].sort()).toEqual(["range", "weekly"]);
      expect(selected).toBe(false);
    });

    it("keeps selected entries that the search still shows", async () => {
      const { onSetSelection } = renderTable({ selectedCount: 1, selectedIds: new Set(["date"]) });
      await userEvent.setup().type(screen.getByRole("searchbox"), "conf");
      expect(onSetSelection).not.toHaveBeenCalled();
    });
  });

  it("sizes the search box and the page-size select with classes, not inline styles", () => {
    renderTable();
    const search = screen.getByRole("searchbox");
    expect(search).toHaveClass("tw:max-w-80");
    expect(search).not.toHaveAttribute("style");
    const pageSize = screen.getByRole("combobox", { name: /rows per page/i });
    expect(pageSize).toHaveClass("tw:w-fit");
    expect(pageSize).not.toHaveAttribute("style");
  });
});
