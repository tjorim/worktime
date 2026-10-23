import type { DetachedWindowAPI } from "happy-dom";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "@/App";

const { happyDOM } = window as unknown as { happyDOM: DetachedWindowAPI };
const originalColorScheme = happyDOM.settings.device.prefersColorScheme;

// SuperTokens mocks are provided globally by tests/setup.ts

describe("Header", () => {
  beforeEach(() => {
    localStorage.setItem(
      "worktime_user_state",
      JSON.stringify({
        hasCompletedOnboarding: true,
        scheduleType: "5-shift",
        myTeam: 1,
      }),
    );
  });

  afterEach(() => {
    happyDOM.settings.device.prefersColorScheme = originalColorScheme;
    localStorage.clear();
    // Reset URL so settings-toggle behaviour (navigate home when already on /settings)
    // doesn't carry over into the next test.
    window.history.pushState(null, "", "/");
  });

  describe("Basic rendering", () => {
    it("renders Worktime title", async () => {
      render(<App />);
      expect(await screen.findByText("Worktime")).toBeInTheDocument();
    });

    it("renders Settings button", () => {
      render(<App />);
      expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    });

    it("turns the Settings control into a clearly labelled back control on Settings", async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByLabelText("Settings"));

      const backButton = await screen.findByLabelText("Back to app");
      expect(backButton.querySelector(".lucide-arrow-left")).toBeInTheDocument();
      await user.click(backButton);
      expect(await screen.findByLabelText("Settings")).toBeInTheDocument();
    });
  });

  describe("About modal", () => {
    it("opens About modal when accessed from Settings panel in full App", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open Settings panel first
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);

      await user.click(await screen.findByRole("button", { name: "About" }, { timeout: 5000 }));
      const aboutHelpButton = await screen.findByText("About & Help");
      await user.click(aboutHelpButton);

      // Modal should be open
      expect(screen.getByText("About Worktime")).toBeInTheDocument();
    });

    it("closes About modal when Close button is clicked", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open Settings panel first
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);

      await user.click(await screen.findByRole("button", { name: "About" }, { timeout: 5000 }));
      const aboutHelpButton = await screen.findByText("About & Help");
      await user.click(aboutHelpButton);

      // Modal should be open
      expect(screen.getByText("About Worktime")).toBeInTheDocument();

      // Close modal
      const closeButton = screen.getByText("Close");
      await user.click(closeButton);

      // Modal should be closed
      expect(screen.queryByText("About Worktime")).not.toBeInTheDocument();
    });
  });

  describe("Theme Integration", () => {
    beforeEach(() => {
      // Clear any existing theme attribute
      document.documentElement.removeAttribute("data-theme");
    });

    afterEach(() => {
      // Clean up theme attribute after each test
      document.documentElement.removeAttribute("data-theme");
    });

    it("applies dark theme to document.documentElement when theme is set to dark", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open Settings panel
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);
      await user.click(await screen.findByRole("button", { name: "Preferences" }));

      // Find and click the dark theme option
      const darkThemeButton = await screen.findByRole("radio", { name: /Dark/i });
      await user.click(darkThemeButton);

      // Check that the theme is applied to the document element
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("applies light theme to document.documentElement when theme is set to light", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open Settings panel
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);
      await user.click(await screen.findByRole("button", { name: "Preferences" }));

      // Find and click the light theme option
      const lightThemeButton = await screen.findByRole("radio", { name: /Light/i });
      await user.click(lightThemeButton);

      // Check that the theme is applied to the document element
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("resolves auto theme to system preference and applies to document.documentElement", async () => {
      const user = userEvent.setup();

      happyDOM.settings.device.prefersColorScheme = "dark";

      render(<App />);

      // Open Settings panel
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);
      await user.click(await screen.findByRole("button", { name: "Preferences" }));

      // Find and click the auto theme option (should be default)
      const autoThemeButton = await screen.findByRole("radio", { name: /Auto/i });
      await user.click(autoThemeButton);

      // Check that the resolved theme is applied to the document element
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("updates theme when system preference changes in auto mode", async () => {
      const user = userEvent.setup();

      happyDOM.settings.device.prefersColorScheme = "light";

      render(<App />);

      // Open Settings panel and ensure auto theme is selected (default)
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);
      await user.click(await screen.findByRole("button", { name: "Preferences" }));

      const autoThemeButton = await screen.findByRole("radio", { name: /Auto/i });
      await user.click(autoThemeButton);

      // Check initial theme (light)
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");

      act(() => {
        happyDOM.settings.device.prefersColorScheme = "dark";
        // Happy DOM reevaluates existing media queries on resize.
        window.dispatchEvent(new Event("resize"));
      });

      // Check that theme updated to dark
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
  });
});
