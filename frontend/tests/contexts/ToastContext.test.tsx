import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/contexts/ToastContext";

// Test component that uses the toast hook
function TestComponent() {
  const { showSuccess, showError, showWarning, showInfo, addToast } = useToast();

  return (
    <div>
      <button type="button" onClick={() => showSuccess("Success message")}>
        Show Success
      </button>
      <button type="button" onClick={() => showError("Error message")}>
        Show Error
      </button>
      <button type="button" onClick={() => showWarning("Warning message")}>
        Show Warning
      </button>
      <button type="button" onClick={() => showInfo("Info message")}>
        Show Info
      </button>
      <button
        type="button"
        onClick={() =>
          addToast({
            message: "Custom toast",
            variant: "success",
            icon: "bi-star-fill",
            autohide: false,
          })
        }
      >
        Custom Toast
      </button>
    </div>
  );
}

describe("ToastContext", () => {
  it("should render ToastProvider without crashing", () => {
    render(
      <ToastProvider>
        <div>Test content</div>
      </ToastProvider>,
    );
    expect(screen.getByText("Test content")).toBeInTheDocument();
  });

  it("should throw error when useToast is used outside provider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow("useToast must be used within a ToastProvider");

    consoleSpy.mockRestore();
  });

  it("should show success toast when showSuccess is called", async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const successButton = screen.getByText("Show Success");

    act(() => {
      successButton.click();
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();
    // Check for Bootstrap icon class
    const icon = document.querySelector(".bi-check-circle-fill");
    expect(icon).toBeInTheDocument();
  });

  it("should show error toast when showError is called", async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const errorButton = screen.getByText("Show Error");

    act(() => {
      errorButton.click();
    });

    expect(screen.getByText("Error message")).toBeInTheDocument();
    // Check for Bootstrap icon class
    const icon = document.querySelector(".bi-x-circle-fill");
    expect(icon).toBeInTheDocument();
  });

  it("should show warning toast when showWarning is called", async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const warningButton = screen.getByText("Show Warning");

    act(() => {
      warningButton.click();
    });

    expect(screen.getByText("Warning message")).toBeInTheDocument();
    // Check for Bootstrap icon class
    const icon = document.querySelector(".bi-exclamation-triangle-fill");
    expect(icon).toBeInTheDocument();
  });

  it("should show info toast when showInfo is called", async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const infoButton = screen.getByText("Show Info");

    act(() => {
      infoButton.click();
    });

    expect(screen.getByText("Info message")).toBeInTheDocument();
    // Check for Bootstrap icon class
    const icon = document.querySelector(".bi-info-circle-fill");
    expect(icon).toBeInTheDocument();
  });

  it("should show custom toast with addToast", async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const customButton = screen.getByText("Custom Toast");

    act(() => {
      customButton.click();
    });

    expect(screen.getByText("Custom toast")).toBeInTheDocument();
    // Check for Bootstrap icon class
    const icon = document.querySelector(".bi-star-fill");
    expect(icon).toBeInTheDocument();
  });

  it("should handle multiple toasts", async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const successButton = screen.getByText("Show Success");
    const errorButton = screen.getByText("Show Error");

    act(() => {
      successButton.click();
      errorButton.click();
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should announce non-error toasts politely with role=status", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Show Success").click();
    });

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Success message");
    expect(toast).toHaveAttribute("aria-live", "polite");
  });

  it("should announce error toasts assertively with role=alert", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Show Error").click();
    });

    const toast = screen.getByRole("alert");
    expect(toast).toHaveTextContent("Error message");
    expect(toast).toHaveAttribute("aria-live", "assertive");
  });

  it("should dismiss a toast when the close button is clicked", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    act(() => {
      screen.getByText("Show Success").click();
    });

    expect(screen.getByText("Success message")).toBeInTheDocument();

    const closeButton = screen.getByRole("button", { name: "Close notification" });
    act(() => {
      closeButton.click();
    });

    expect(screen.queryByText("Success message")).not.toBeInTheDocument();
  });

  it("should render toast container with correct positioning", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    const successButton = screen.getByText("Show Success");

    act(() => {
      successButton.click();
    });

    const toastContainer = document.querySelector(".toast-container");
    expect(toastContainer).toBeInTheDocument();
    expect(toastContainer).toHaveClass("toast-container");
    expect(toastContainer).toHaveClass("top-0");
    expect(toastContainer).toHaveClass("end-0");
    expect(toastContainer).toHaveClass("p-3");
  });
});
