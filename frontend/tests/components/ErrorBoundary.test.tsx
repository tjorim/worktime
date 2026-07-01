import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import * as m from "@/paraglide/messages.js";

// Mock error logging to avoid noise in test output.
const testConsole = globalThis["console"];
const mockConsoleError = vi.fn();

beforeEach(() => {
  vi.spyOn(testConsole, "error").mockImplementation(mockConsoleError);
  mockConsoleError.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Test component that throws an error
const ThrowError = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div data-testid="child">Child component</div>;
};

describe("ErrorBoundary", () => {
  describe("Normal operation", () => {
    it("renders children when no error occurs", () => {
      render(
        <ErrorBoundary>
          <div data-testid="child">Child component</div>
        </ErrorBoundary>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("catches and displays error UI when child component throws", () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(
        screen.getByRole("button", { name: m.error_boundary_try_again() }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: m.error_boundary_reload() })).toBeInTheDocument();
    });

    it("handles try again button click", async () => {
      const user = userEvent.setup();

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const tryAgainButton = screen.getByRole("button", { name: m.error_boundary_try_again() });
      await user.click(tryAgainButton);

      // After reset, should show error UI again since component still throws
      expect(
        screen.getByRole("button", { name: m.error_boundary_try_again() }),
      ).toBeInTheDocument();
    });

    it("renders custom fallback when provided", () => {
      const customFallback = <div data-testid="custom-fallback">Custom error UI</div>;

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: m.error_boundary_try_again() }),
      ).not.toBeInTheDocument();
    });
  });
});
