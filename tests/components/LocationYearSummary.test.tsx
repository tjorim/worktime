import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import { LocationYearSummary } from "../../src/components/calendar/LocationYearSummary";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { toCountryCode } from "../../src/types/workLocation";
import type { WorkLocationInfo, WorkLocationMap } from "../../src/types/workLocation";
import { getLocale, setLocale } from "../../src/paraglide/runtime.js";

function renderSummary(year: number, workLocationMap: WorkLocationMap) {
  return render(
    <ToastProvider>
      <LocationYearSummary year={year} workLocationMap={workLocationMap} />
    </ToastProvider>,
  );
}

const cc = (value: string) => toCountryCode(value)!;
const HOME_NL: WorkLocationInfo = { location: "home", countryCode: cc("NL") };
const OFFICE_BE: WorkLocationInfo = { location: "office", countryCode: cc("BE") };

describe("LocationYearSummary", () => {
  const originalLocale = getLocale();

  afterEach(async () => {
    await setLocale(originalLocale, { reload: false });
  });

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
    const rows = screen.getAllByRole("row");
    const homeRow = rows.find((row) => row.textContent?.includes("Home"));
    const officeRow = rows.find((row) => row.textContent?.includes("Office"));
    expect(within(homeRow!).getByText("2")).toBeInTheDocument();
    expect(within(officeRow!).getByText("1")).toBeInTheDocument();
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
      const writeTextMock = vi.mocked(navigator.clipboard.writeText);
      expect(writeTextMock).toHaveBeenCalledOnce();
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Work Location Summary — 2026"),
      );
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("Home"));
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("NL"));
    });

    it("uses correct Dutch singular/plural day labels in clipboard text", async () => {
      await setLocale("nl", { reload: false });
      const map: WorkLocationMap = new Map([
        ["2026-01-05", HOME_NL],
        ["2026-01-06", OFFICE_BE],
        ["2026-01-07", OFFICE_BE],
      ]);

      renderSummary(2026, map);
      await userEvent.click(screen.getByRole("button", { name: /Kopieer/i }));

      const writeTextMock = vi.mocked(navigator.clipboard.writeText);
      expect(writeTextMock).toHaveBeenCalledOnce();
      const copiedText = writeTextMock.mock.calls[0]?.[0] ?? "";
      expect(copiedText).toContain("1 dag");
      expect(copiedText).toContain("2 dagen");
    });
  });
});
