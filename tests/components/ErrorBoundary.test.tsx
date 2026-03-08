import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";

// Mock console.error to avoid noise in test output
const originalError = console.error;
const mockConsoleError = vi.fn();

beforeEach(() => {
  console.error = mockConsoleError;
  mockConsoleError.mockClear();
});

afterEach(() => {
  console.error = originalError;
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

      expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reload Page" })).toBeInTheDocument();
    });

    it("handles try again button click", async () => {
      const user = userEvent.setup();

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      const tryAgainButton = screen.getByRole("button", { name: "Try Again" });
      await user.click(tryAgainButton);

      // After reset, should show error UI again since component still throws
      expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
    });

    it("renders custom fallback when provided", () => {
      const customFallback = <div data-testid="custom-fallback">Custom error UI</div>;

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try Again" })).not.toBeInTheDocument();
    });
  });
});
