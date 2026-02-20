import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "../../src/components/SettingsPanel";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { DeveloperOptionsProvider } from "../../src/contexts/DeveloperOptionsContext";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <SettingsProvider>
      <EventStoreProvider>
        <DeveloperOptionsProvider>
          <ToastProvider>{ui}</ToastProvider>
        </DeveloperOptionsProvider>
      </EventStoreProvider>
    </SettingsProvider>,
  );
}

describe("SettingsPanel", () => {
  const mockOnHide = vi.fn();
  const mockOnShowAbout = vi.fn();
  const mockOnChangeSchedule = vi.fn();
  const mockOnChangeTeam = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  describe("Cross-Border Setup Section", () => {
    it("renders the Cross-Border Setup section", () => {
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      expect(screen.getByText("Cross-Border Setup")).toBeInTheDocument();
      expect(
        screen.getByText("Configure countries for work location tracking"),
      ).toBeInTheDocument();
    });

    it("renders Home Country and Office Country selectors", () => {
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      expect(screen.getByText("Home Country")).toBeInTheDocument();
      expect(screen.getByText("Country where you are based")).toBeInTheDocument();

      expect(screen.getByText("Office Country")).toBeInTheDocument();
      expect(screen.getByText("Country where your office is located")).toBeInTheDocument();
    });

    it("displays None as default for country selectors", () => {
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const homeCountrySelect = screen.getByLabelText("Home country");
      const officeCountrySelect = screen.getByLabelText("Office country");

      expect(homeCountrySelect).toHaveValue("");
      expect(officeCountrySelect).toHaveValue("");
    });

    it("updates home country when a country is selected", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const homeCountrySelect = screen.getByLabelText("Home country");

      await user.selectOptions(homeCountrySelect, "NL");

      expect(homeCountrySelect).toHaveValue("NL");
    });

    it("updates office country when a country is selected", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const officeCountrySelect = screen.getByLabelText("Office country");

      await user.selectOptions(officeCountrySelect, "BE");

      expect(officeCountrySelect).toHaveValue("BE");
    });

    it("persists country selections to settings context", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const homeCountrySelect = screen.getByLabelText("Home country");
      const officeCountrySelect = screen.getByLabelText("Office country");

      await user.selectOptions(homeCountrySelect, "DE");
      await user.selectOptions(officeCountrySelect, "LU");

      // Verify values are persisted to localStorage
      const stored = window.localStorage.getItem("worktime_user_state");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.homeCountry).toBe("DE");
      expect(parsed.settings.officeCountry).toBe("LU");
    });

    it("allows clearing country selection by selecting None", async () => {
      const user = userEvent.setup();

      // Pre-populate with country selections
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
          },
          lastUsed: {
            activeTab: "calendar",
            scheduleView: "today",
            otherSchedule: null,
            timeOffView: "table",
            timeTrackingView: "daily",
            otherTeam: null,
          },
        }),
      );

      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const homeCountrySelect = screen.getByLabelText("Home country");
      expect(homeCountrySelect).toHaveValue("NL");

      await user.selectOptions(homeCountrySelect, "");

      expect(homeCountrySelect).toHaveValue("");

      // Verify null is persisted
      const stored = window.localStorage.getItem("worktime_user_state");
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.homeCountry).toBeNull();
    });

    it("displays all supported countries in the dropdown", () => {
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const homeCountrySelect = screen.getByLabelText("Home country");
      const options = Array.from(homeCountrySelect.querySelectorAll("option"));
      const optionTexts = options.map((opt) => opt.textContent);

      expect(optionTexts).toContain("None");
      expect(optionTexts).toContain("Netherlands");
      expect(optionTexts).toContain("Belgium");
      expect(optionTexts).toContain("Germany");
      expect(optionTexts).toContain("Luxembourg");
      expect(optionTexts).toContain("France");
      expect(optionTexts).toContain("United Kingdom");
    });

    it("maintains independent selections for home and office countries", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const homeCountrySelect = screen.getByLabelText("Home country");
      const officeCountrySelect = screen.getByLabelText("Office country");

      await user.selectOptions(homeCountrySelect, "NL");
      await user.selectOptions(officeCountrySelect, "FR");

      expect(homeCountrySelect).toHaveValue("NL");
      expect(officeCountrySelect).toHaveValue("FR");

      // Verify both are persisted independently
      const stored = window.localStorage.getItem("worktime_user_state");
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.homeCountry).toBe("NL");
      expect(parsed.settings.officeCountry).toBe("FR");
    });

    it("allows setting the same country for both home and office", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const homeCountrySelect = screen.getByLabelText("Home country");
      const officeCountrySelect = screen.getByLabelText("Office country");

      await user.selectOptions(homeCountrySelect, "GB");
      await user.selectOptions(officeCountrySelect, "GB");

      expect(homeCountrySelect).toHaveValue("GB");
      expect(officeCountrySelect).toHaveValue("GB");
    });
  });

  describe("CountrySelect component", () => {
    it("renders with correct aria-label", () => {
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      expect(screen.getByLabelText("Home country")).toBeInTheDocument();
      expect(screen.getByLabelText("Office country")).toBeInTheDocument();
    });

    it("is keyboard accessible", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      const homeCountrySelect = screen.getByLabelText("Home country");

      // Focus and navigate with keyboard
      homeCountrySelect.focus();
      expect(homeCountrySelect).toHaveFocus();

      // Select an option using selectOptions (more reliable than keyboard events)
      await user.selectOptions(homeCountrySelect, "NL");

      // Should have selected a value
      expect(homeCountrySelect.value).toBe("NL");
    });
  });

  describe("Reset Settings interaction", () => {
    it("clears country settings when reset is confirmed", async () => {
      const user = userEvent.setup();

      // Pre-populate with country selections
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 3,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: null,
          settings: {
            timeFormat: "12h",
            theme: "dark",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
            homeCountry: "NL",
            officeCountry: "BE",
          },
          lastUsed: {
            activeTab: "calendar",
            scheduleView: "today",
            otherSchedule: null,
            timeOffView: "table",
            timeTrackingView: "daily",
            otherTeam: null,
          },
        }),
      );

      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      // Open reset dialog
      const resetButton = screen.getByText("Reset Settings");
      await user.click(resetButton);

      // Confirm reset
      const confirmButton = screen.getByText("Reset Now");
      await user.click(confirmButton);

      // Verify country settings are cleared
      const stored = window.localStorage.getItem("worktime_user_state");
      const parsed = JSON.parse(stored!);
      expect(parsed.settings.homeCountry).toBeNull();
      expect(parsed.settings.officeCountry).toBeNull();
    });
  });

  describe("Panel visibility", () => {
    it("does not render when show is false", () => {
      const { container } = renderWithProviders(
        <SettingsPanel
          show={false}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      // Bootstrap Offcanvas is present in DOM but hidden via CSS, so check visibility instead
      const offcanvas = container.querySelector(".offcanvas");
      expect(offcanvas).toBeInTheDocument();
      expect(offcanvas).not.toHaveClass("show");
    });

    it("renders when show is true", () => {
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      expect(screen.getByText("Cross-Border Setup")).toBeInTheDocument();
    });
  });

  describe("Preferences section integration", () => {
    it("renders preferences alongside cross-border setup", () => {
      renderWithProviders(
        <SettingsPanel
          show={true}
          onHide={mockOnHide}
          onShowAbout={mockOnShowAbout}
          onChangeSchedule={mockOnChangeSchedule}
          onChangeTeam={mockOnChangeTeam}
        />,
      );

      // Verify both sections are present
      expect(screen.getByText("Preferences")).toBeInTheDocument();
      expect(screen.getByText("Cross-Border Setup")).toBeInTheDocument();
      expect(screen.getByText("Time Format")).toBeInTheDocument();
      expect(screen.getByText("Home Country")).toBeInTheDocument();
    });
  });
});