import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeOffStatsView } from "@/components/timeOff/TimeOffStatsView";
import { buildTimeOffEntryForRange } from "@/lib/timeOff/codecs";

describe("TimeOffStatsView", () => {
  const currentYear = new Date().getFullYear();

  const dateEntry = (
    start: string,
    end = start,
    entryType:
      | "vacation"
      | "business"
      | "course"
      | "in"
      | "weekend"
      | "birthday"
      | "ill"
      | "other" = "vacation",
    entryFlag: "half_am" | "half_pm" | "onsite" | "no_fly" | "can_fly" | "full_day" = "full_day",
  ) =>
    buildTimeOffEntryForRange({
      start,
      end,
      entryType,
      entryFlag,
    });

  describe("Rendering", () => {
    it("renders the statistics header", () => {
      render(<TimeOffStatsView entries={[]} />);
      expect(screen.getByText("Vacation Statistics")).toBeInTheDocument();
    });

    it("shows the current year in the year selector", () => {
      render(<TimeOffStatsView entries={[]} />);
      const yearSelect = screen.getByRole("combobox", { name: /select year/i });
      expect(yearSelect).toHaveValue(currentYear.toString());
    });

    it("shows empty state when no entries", () => {
      render(<TimeOffStatsView entries={[]} />);
      expect(screen.getByText(new RegExp(`No time off recorded for ${currentYear}`))).toBeInTheDocument();
    });

    it("shows total days count", () => {
      const entries = [dateEntry(`${currentYear}-01-15`, `${currentYear}-01-17`)];
      render(<TimeOffStatsView entries={entries} />);
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`days logged in ${currentYear}`))).toBeInTheDocument();
    });
  });

  describe("Category breakdown", () => {
    it("shows breakdown by entry type", () => {
      const entries = [
        dateEntry(`${currentYear}-01-15`, `${currentYear}-01-17`),
        dateEntry(`${currentYear}-02-10`, `${currentYear}-02-12`, "business"),
        dateEntry(`${currentYear}-03-05`, `${currentYear}-03-05`, "ill"),
      ];
      render(<TimeOffStatsView entries={entries} />);

      expect(screen.getByText("Holiday")).toBeInTheDocument();
      expect(screen.getByText("Business trip")).toBeInTheDocument();
      expect(screen.getByText("Sick leave")).toBeInTheDocument();
    });

    it("only shows categories with recorded days", () => {
      const entries = [dateEntry(`${currentYear}-01-15`)];
      render(<TimeOffStatsView entries={entries} />);

      expect(screen.getByText("Holiday")).toBeInTheDocument();
      expect(screen.queryByText("Business trip")).not.toBeInTheDocument();
      expect(screen.queryByText("Sick leave")).not.toBeInTheDocument();
    });

    it("shows day count badge for each category", () => {
      const entries = [
        dateEntry(`${currentYear}-01-15`, `${currentYear}-01-17`),
        dateEntry(`${currentYear}-02-10`, `${currentYear}-02-12`, "business"),
      ];
      render(<TimeOffStatsView entries={entries} />);

      // 3 vacation days badge and 3 business days badge
      const daysBadges = screen.getAllByText(/\d+ days/);
      expect(daysBadges.length).toBeGreaterThanOrEqual(2);
    });

    it("handles half-day entries", () => {
      const entries = [
        dateEntry(`${currentYear}-01-15`, `${currentYear}-01-15`, "vacation", "half_am"),
      ];
      render(<TimeOffStatsView entries={entries} />);
      expect(screen.getByText("0.5")).toBeInTheDocument();
    });
  });

  describe("Year selection", () => {
    it("includes years from entries", () => {
      const entries = [
        dateEntry(`${currentYear - 1}-06-15`, `${currentYear - 1}-06-20`),
        dateEntry(`${currentYear}-01-10`, `${currentYear}-01-15`),
      ];
      render(<TimeOffStatsView entries={entries} />);

      const yearSelect = screen.getByRole("combobox", { name: /select year/i });
      const options = within(yearSelect).getAllByRole("option");
      const yearTexts = options.map((opt) => opt.textContent);
      expect(yearTexts).toContain((currentYear - 1).toString());
      expect(yearTexts).toContain(currentYear.toString());
    });

    it("updates stats when year changes", async () => {
      const user = userEvent.setup();
      const entries = [
        dateEntry(`${currentYear - 1}-01-15`, `${currentYear - 1}-01-17`),
        dateEntry(`${currentYear}-01-10`, `${currentYear}-01-12`),
      ];
      render(<TimeOffStatsView entries={entries} />);

      const yearSelect = screen.getByRole("combobox", { name: /select year/i });
      await user.selectOptions(yearSelect, (currentYear - 1).toString());

      // Previous year had 3 days
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`days logged in ${currentYear - 1}`))).toBeInTheDocument();
    });
  });
});
