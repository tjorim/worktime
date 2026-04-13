import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";

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
    localStorage.clear();
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
  });

  describe("About modal", () => {
    it("opens About modal when accessed from Settings panel in full App", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open Settings panel first
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);

      await user.click(await screen.findByRole("button", { name: /Information/i }));
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

      await user.click(await screen.findByRole("button", { name: /Information/i }));
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
      document.documentElement.removeAttribute("data-bs-theme");
    });

    afterEach(() => {
      // Clean up theme attribute after each test
      document.documentElement.removeAttribute("data-bs-theme");
    });

    it("applies dark theme to document.documentElement when theme is set to dark", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open Settings panel
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);

      // Find and click the dark theme button
      const darkThemeButton = await screen.findByRole("button", {
        name: /Dark/i,
      });
      await user.click(darkThemeButton);

      // Check that the theme is applied to the document element
      expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
    });

    it("applies light theme to document.documentElement when theme is set to light", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open Settings panel
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);

      // Find and click the light theme button
      const lightThemeButton = await screen.findByRole("button", {
        name: /Light/i,
      });
      await user.click(lightThemeButton);

      // Check that the theme is applied to the document element
      expect(document.documentElement.getAttribute("data-bs-theme")).toBe("light");
    });

    it("resolves auto theme to system preference and applies to document.documentElement", async () => {
      const user = userEvent.setup();

      // Mock system preference to dark
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: query === "(prefers-color-scheme: dark)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      render(<App />);


      // Open Settings panel
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);

      // Find and click the auto theme button (should be default)
      const autoThemeButton = await screen.findByRole("button", {
        name: /Auto/i,
      });
      await user.click(autoThemeButton);

      // Check that the resolved theme is applied to the document element
      expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
    });

    it("updates theme when system preference changes in auto mode", async () => {
      const user = userEvent.setup();

      let mediaQueryChangeHandler: (event: { matches: boolean }) => void = () => {};

      // Mock system preference initially to light
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: false, // Initially light
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn((...args) => {
            mediaQueryChangeHandler = args[1];
          }),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      render(<App />);

      // Open Settings panel and ensure auto theme is selected (default)
      const settingsButton = await screen.findByLabelText("Settings");
      await user.click(settingsButton);

      const autoThemeButton = await screen.findByRole("button", {
        name: /Auto/i,
      });
      await user.click(autoThemeButton);

      // Check initial theme (light)
      expect(document.documentElement.getAttribute("data-bs-theme")).toBe("light");

      // Simulate system preference change to dark
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: query === "(prefers-color-scheme: dark)",
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      // Trigger the change handler
      mediaQueryChangeHandler({ matches: true });

      // Check that theme updated to dark
      expect(document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
    });
  });
});
