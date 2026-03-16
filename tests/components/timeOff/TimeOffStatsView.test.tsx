import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeOffStatsView } from "../../../src/components/timeOff/TimeOffStatsView";
import type { HdayEvent } from "../../../src/lib/hday/types";
import type { VacationAllowanceSettings } from "../../../src/utils/vacationCalculations";

describe("TimeOffStatsView", () => {
  const currentYear = new Date().getFullYear();

  const defaultAllowance: VacationAllowanceSettings = {
    yearlyAmounts: { [String(currentYear)]: 25 },
    unit: "days",
    hoursPerDay: 8,
  };

  const mockOnUpdateAllowance = vi.fn();

  const defaultProps = {
    events: [] as HdayEvent[],
    allowance: defaultAllowance,
    onUpdateAllowance: mockOnUpdateAllowance,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("should render the panel with header", () => {
      render(<TimeOffStatsView {...defaultProps} />);
      expect(screen.getByText("Vacation Statistics")).toBeInTheDocument();
    });

    it("should display current year badge", () => {
      render(<TimeOffStatsView {...defaultProps} />);

      // Badge is rendered in the header
      const badges = screen.getAllByText(currentYear.toString());
      expect(badges.length).toBeGreaterThan(0);
    });

    it("should render allowance settings form", () => {
      render(<TimeOffStatsView {...defaultProps} />);
      expect(screen.getByText("Allowance Settings")).toBeInTheDocument();
      expect(screen.getByLabelText(`Allowance for ${currentYear}`)).toBeInTheDocument();
      expect(screen.getByLabelText("Unit")).toBeInTheDocument();
      expect(screen.getByLabelText("Hours per day")).toBeInTheDocument();
    });

    it("should render vacation usage section", () => {
      render(<TimeOffStatsView {...defaultProps} />);
      expect(screen.getByText("Vacation Usage")).toBeInTheDocument();
    });

    it("should display allowance values in form inputs", () => {
      render(<TimeOffStatsView {...defaultProps} />);
      const amountInput = screen.getByLabelText(`Allowance for ${currentYear}`) as HTMLInputElement;
      const unitSelect = screen.getByLabelText("Unit") as HTMLSelectElement;
      const hoursInput = screen.getByLabelText("Hours per day") as HTMLInputElement;

      expect(amountInput.value).toBe("25");
      expect(unitSelect.value).toBe("days");
      expect(hoursInput.value).toBe("8");
    });
  });

  describe("Allowance Controls", () => {
    it("should call onUpdateAllowance when amount changes with valid value", async () => {
      const user = userEvent.setup();
      render(<TimeOffStatsView {...defaultProps} />);

      const amountInput = screen.getByLabelText(`Allowance for ${currentYear}`) as HTMLInputElement;

      // Typing backspace will reduce 25 to 2, which is valid
      await user.click(amountInput);
      await user.type(amountInput, "{Backspace}");

      // Should be called with valid value (2)
      expect(mockOnUpdateAllowance).toHaveBeenCalled();
      expect(mockOnUpdateAllowance).toHaveBeenCalledWith({
        yearlyAmounts: { [String(currentYear)]: 2 },
      });
    });

    it("should call onUpdateAllowance when unit changes", async () => {
      const user = userEvent.setup();
      render(<TimeOffStatsView {...defaultProps} />);

      const unitSelect = screen.getByLabelText("Unit");
      await user.selectOptions(unitSelect, "hours");

      expect(mockOnUpdateAllowance).toHaveBeenCalledWith({ unit: "hours" });
    });

    it("should call onUpdateAllowance when hours per day changes with valid value", async () => {
      const user = userEvent.setup();
      render(<TimeOffStatsView {...defaultProps} />);

      const hoursInput = screen.getByLabelText("Hours per day") as HTMLInputElement;

      // Type a digit to append (8 becomes 81, which is valid)
      await user.click(hoursInput);
      await user.type(hoursInput, "1");

      // Should be called with 81 (8 + typed 1)
      expect(mockOnUpdateAllowance).toHaveBeenCalled();
      expect(mockOnUpdateAllowance).toHaveBeenCalledWith({ hoursPerDay: 81 });
    });

    it("should not update allowance with negative amount", async () => {
      const user = userEvent.setup();
      render(<TimeOffStatsView {...defaultProps} />);

      const amountInput = screen.getByLabelText(`Allowance for ${currentYear}`);
      await user.clear(amountInput);
      await user.type(amountInput, "-5");

      expect(mockOnUpdateAllowance).not.toHaveBeenCalled();
    });

    it("should not update allowance with invalid amount (letters)", async () => {
      const user = userEvent.setup();
      render(<TimeOffStatsView {...defaultProps} />);

      const amountInput = screen.getByLabelText(`Allowance for ${currentYear}`);

      // Focus and try to type letters (which should be ignored by number input)
      await user.click(amountInput);
      const callCountBefore = mockOnUpdateAllowance.mock.calls.length;

      await user.type(amountInput, "abc");

      // The input type="number" prevents letters, so no new calls should happen
      const callCountAfter = mockOnUpdateAllowance.mock.calls.length;
      expect(callCountAfter).toBe(callCountBefore);
    });

    it("should not update hours per day with value less than 1", async () => {
      const user = userEvent.setup();
      render(<TimeOffStatsView {...defaultProps} />);

      const hoursInput = screen.getByLabelText("Hours per day");
      await user.clear(hoursInput);
      await user.type(hoursInput, "0.5");

      expect(mockOnUpdateAllowance).not.toHaveBeenCalled();
    });

    it("should render unit options correctly", () => {
      render(<TimeOffStatsView {...defaultProps} />);
      const unitSelect = screen.getByLabelText("Unit");
      const options = within(unitSelect).getAllByRole("option");

      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent("Days");
      expect(options[1]).toHaveTextContent("Hours");
    });
  });

  describe("Vacation Statistics Display", () => {
    it("should show 0 usage when no events", () => {
      render(<TimeOffStatsView {...defaultProps} />);
      expect(screen.getByText("0 / 25 days")).toBeInTheDocument();
    });

    it("should calculate and display vacation days used", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/17`,
          flags: ["holiday"],
        },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);
      expect(screen.getByText(/3 \/ 25 days/)).toBeInTheDocument();
    });

    it("should display remaining vacation days", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/17`,
          flags: ["holiday"],
        },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);
      // Check for Remaining section with proper value
      const remainingText = screen.getByText("Remaining");
      const remainingSection = remainingText.closest(".col-6");
      expect(remainingSection).toHaveTextContent("22");
    });

    it("should show hours when allowance unit is hours", () => {
      const hoursAllowance: VacationAllowanceSettings = {
        yearlyAmounts: { [String(currentYear)]: 200 },
        unit: "hours",
        hoursPerDay: 8,
      };
      render(<TimeOffStatsView {...defaultProps} allowance={hoursAllowance} />);
      expect(screen.getByText("0 / 200 hours")).toBeInTheDocument();
    });

    it("should render progress bar with correct percentage", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/19`,
          flags: ["holiday"],
        }, // 5 days
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "20"); // 5/25 = 20%
    });

    it("should show breakdown by event type", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/17`,
          flags: ["holiday"],
        },
        {
          type: "range",
          start: `${currentYear}/02/10`,
          end: `${currentYear}/02/12`,
          flags: ["business"],
        },
        {
          type: "range",
          start: `${currentYear}/03/05`,
          end: `${currentYear}/03/05`,
          flags: ["ill"],
        },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);

      expect(screen.getByText("Holiday")).toBeInTheDocument();
      expect(screen.getByText("Business trip")).toBeInTheDocument();
      expect(screen.getByText("Sick leave")).toBeInTheDocument();
    });

    it("should display total days and hours", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/17`,
          flags: ["holiday"],
        },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);

      expect(screen.getByText("Total time off")).toBeInTheDocument();
      expect(screen.getByText(/days \(24 h\)/)).toBeInTheDocument();
    });

    it("should handle half-day events in calculations", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/15`,
          flags: ["holiday", "half_am"],
        },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);

      expect(screen.getByText(/0\.5 \/ 25 days/)).toBeInTheDocument();
    });

    it("should update when hoursPerDay changes", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/15`,
          flags: ["holiday"],
        },
      ];
      const customAllowance: VacationAllowanceSettings = {
        yearlyAmounts: { [String(currentYear)]: 25 },
        unit: "days",
        hoursPerDay: 7,
      };

      render(<TimeOffStatsView {...defaultProps} events={events} allowance={customAllowance} />);
      expect(screen.getByText(/days \(7 h\)/)).toBeInTheDocument();
    });
  });

  describe("Year Selection", () => {
    it("should default to current year", () => {
      render(<TimeOffStatsView {...defaultProps} />);

      const yearSelect = screen.getByRole("combobox", { name: /select year/i });
      expect(yearSelect).toHaveValue(currentYear.toString());
    });

    it("should include years from events", () => {
      const events: HdayEvent[] = [
        { type: "range", start: `${currentYear - 1}/06/15`, end: `${currentYear - 1}/06/20` },
        { type: "range", start: `${currentYear}/01/10`, end: `${currentYear}/01/15` },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);

      const yearSelect = screen.getByRole("combobox", { name: /select year/i });
      const options = within(yearSelect).getAllByRole("option");

      const yearTexts = options.map((opt) => opt.textContent);
      expect(yearTexts).toContain((currentYear - 1).toString());
      expect(yearTexts).toContain(currentYear.toString());
    });

    it("should update statistics when year changes", async () => {
      const user = userEvent.setup();

      const multiYearAllowance: VacationAllowanceSettings = {
        yearlyAmounts: {
          [String(currentYear)]: 25,
          [String(currentYear - 1)]: 25,
        },
        unit: "days",
        hoursPerDay: 8,
      };
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear - 1}/01/15`,
          end: `${currentYear - 1}/01/17`,
          flags: ["holiday"],
        },
        {
          type: "range",
          start: `${currentYear}/01/10`,
          end: `${currentYear}/01/12`,
          flags: ["holiday"],
        },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} allowance={multiYearAllowance} />);

      const yearSelect = screen.getByRole("combobox", { name: /select year/i });
      await user.selectOptions(yearSelect, (currentYear - 1).toString());

      // Should show previous year vacation days (3 days)
      expect(screen.getByText(/3 \/ 25 days/)).toBeInTheDocument();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty allowance gracefully", () => {
      const zeroAllowance: VacationAllowanceSettings = {
        yearlyAmounts: {},
        unit: "days",
        hoursPerDay: 8,
      };
      render(<TimeOffStatsView {...defaultProps} allowance={zeroAllowance} />);

      expect(screen.getByText("0 / 0 days")).toBeInTheDocument();
    });

    it("should not show negative remaining days", () => {
      const smallAllowance: VacationAllowanceSettings = {
        yearlyAmounts: { [String(currentYear)]: 1 },
        unit: "days",
        hoursPerDay: 8,
      };
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/20`,
          flags: ["holiday"],
        }, // 6 days
      ];
      render(<TimeOffStatsView {...defaultProps} allowance={smallAllowance} events={events} />);

      // Check for Remaining section with 0
      expect(screen.getByText("Remaining")).toBeInTheDocument();
      const remainingSection = screen.getByText("Remaining").closest(".col-6");
      expect(remainingSection).toHaveTextContent("0");
    });

    it("should cap progress bar at 100%", () => {
      const smallAllowance: VacationAllowanceSettings = {
        yearlyAmounts: { [String(currentYear)]: 1 },
        unit: "days",
        hoursPerDay: 8,
      };
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/20`,
          flags: ["holiday"],
        }, // 6 days
      ];
      render(<TimeOffStatsView {...defaultProps} allowance={smallAllowance} events={events} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "100");
    });

    it("should handle events with no flags as holiday", () => {
      const events: HdayEvent[] = [
        { type: "range", start: `${currentYear}/01/15`, end: `${currentYear}/01/17` },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);

      expect(screen.getByText(/3 \/ 25 days/)).toBeInTheDocument();
    });

    it("should filter out non-holiday events from usage", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/17`,
          flags: ["holiday"],
        },
        {
          type: "range",
          start: `${currentYear}/02/10`,
          end: `${currentYear}/02/12`,
          flags: ["business"],
        },
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);

      // Only holiday days count toward allowance
      expect(screen.getByText(/3 \/ 25 days/)).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper labels on form controls", () => {
      render(<TimeOffStatsView {...defaultProps} />);

      expect(screen.getByLabelText(`Allowance for ${currentYear}`)).toBeInTheDocument();
      expect(screen.getByLabelText("Unit")).toBeInTheDocument();
      expect(screen.getByLabelText("Hours per day")).toBeInTheDocument();
    });

    it("should have valid input constraints", () => {
      render(<TimeOffStatsView {...defaultProps} />);

      const amountInput = screen.getByLabelText(`Allowance for ${currentYear}`) as HTMLInputElement;
      const hoursInput = screen.getByLabelText("Hours per day") as HTMLInputElement;

      expect(amountInput).toHaveAttribute("type", "number");
      expect(amountInput).toHaveAttribute("min", "0");
      expect(hoursInput).toHaveAttribute("type", "number");
      expect(hoursInput).toHaveAttribute("min", "1");
    });

    it("should have progress bar with aria attributes", () => {
      const events: HdayEvent[] = [
        {
          type: "range",
          start: `${currentYear}/01/15`,
          end: `${currentYear}/01/19`,
          flags: ["holiday"],
        }, // 5 days
      ];
      render(<TimeOffStatsView {...defaultProps} events={events} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
      expect(progressBar).toHaveAttribute("aria-valuenow", "20");
    });
  });
});
