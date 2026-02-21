import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LocationYearSummary } from "../../src/components/calendar/LocationYearSummary";
import { ToastProvider } from "../../src/contexts/ToastContext";
import type { WorkLocationInfo, WorkLocationMap } from "../../src/types/workLocation";

function renderSummary(year: number, workLocationMap: WorkLocationMap) {
  return render(
    <ToastProvider>
      <LocationYearSummary year={year} workLocationMap={workLocationMap} />
    </ToastProvider>,
  );
}

const HOME_NL: WorkLocationInfo = { location: "home", countryCode: "NL" };
const OFFICE_BE: WorkLocationInfo = { location: "office", countryCode: "BE" };
const OTHER_DE: WorkLocationInfo = { location: "other", countryCode: "DE", label: "Berlin office" };

describe("LocationYearSummary", () => {
  it("shows an empty-state message when the map has no entries for the year", () => {
    renderSummary(2026, new Map());
    expect(screen.getByText(/No work locations recorded for 2026/)).toBeInTheDocument();
  });

  it("shows the year in the empty-state message", () => {
    renderSummary(2025, new Map());
    expect(screen.getByText(/No work locations recorded for 2025/)).toBeInTheDocument();
  });

  it("renders a summary table when entries exist", () => {
    const map: WorkLocationMap = new Map([
      ["2026-01-05", HOME_NL],
      ["2026-01-06", OFFICE_BE],
    ]);
    renderSummary(2026, map);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows location labels and country codes in the table rows", () => {
    const map: WorkLocationMap = new Map([
      ["2026-01-05", HOME_NL],
      ["2026-01-06", OFFICE_BE],
    ]);
    renderSummary(2026, map);
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Office")).toBeInTheDocument();
    expect(screen.getByText("NL")).toBeInTheDocument();
    expect(screen.getByText("BE")).toBeInTheDocument();
  });

  it("shows the day count for each row", () => {
    const map: WorkLocationMap = new Map([
      ["2026-01-05", HOME_NL],
      ["2026-01-06", HOME_NL],
      ["2026-01-07", OFFICE_BE],
    ]);
    renderSummary(2026, map);
    // Two home days in one row, one office day in another
    const cells = screen.getAllByRole("cell");
    const textContent = cells.map((c) => c.textContent);
    expect(textContent).toContain("2");
    expect(textContent).toContain("1");
  });

  it("renders the optional label for other-location rows", () => {
    const map: WorkLocationMap = new Map([["2026-01-05", OTHER_DE]]);
    renderSummary(2026, map);
    expect(screen.getByText("(Berlin office)")).toBeInTheDocument();
  });

  it("only includes entries matching the requested year", () => {
    const map: WorkLocationMap = new Map([
      ["2026-01-05", HOME_NL],
      ["2025-12-31", OFFICE_BE], // different year — must be excluded
    ]);
    renderSummary(2026, map);
    // Only Home row should appear (NL). Office row for 2025 must be absent.
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Office")).not.toBeInTheDocument();
  });

  it("shows the year in the section heading", () => {
    const map: WorkLocationMap = new Map([["2026-01-05", HOME_NL]]);
    renderSummary(2026, map);
    expect(screen.getByText(/2026 Location Summary/)).toBeInTheDocument();
  });

  it("renders a Copy button when rows exist", () => {
    const map: WorkLocationMap = new Map([["2026-01-05", HOME_NL]]);
    renderSummary(2026, map);
    expect(screen.getByRole("button", { name: /Copy/i })).toBeInTheDocument();
  });

  describe("Copy to clipboard", () => {
    let originalClipboard: typeof navigator.clipboard;
    beforeEach(() => {
      originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", {
        writable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
    });

    afterEach(() => {
      Object.defineProperty(navigator, "clipboard", {
        writable: true,
        value: originalClipboard,
      });
      vi.restoreAllMocks();
    });

    it("calls navigator.clipboard.writeText when Copy is clicked", async () => {
      const map: WorkLocationMap = new Map([["2026-01-05", HOME_NL]]);
      renderSummary(2026, map);
      await userEvent.click(screen.getByRole("button", { name: /Copy/i }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
      const text = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(text).toMatch(/Work Location Summary — 2026/);
      expect(text).toMatch(/Home/);
      expect(text).toMatch(/NL/);
    });
  });
});
