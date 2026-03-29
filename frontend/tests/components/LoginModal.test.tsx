import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginModal } from "../../src/components/LoginModal";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { DeveloperOptionsProvider } from "../../src/contexts/DeveloperOptionsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

function renderModal(props: { show?: boolean; onHide?: () => void } = {}) {
  const onHide = props.onHide ?? vi.fn();
  return render(
    <DeveloperOptionsProvider>
      <ToastProvider>
        <AuthProvider>
          <LoginModal show={props.show ?? true} onHide={onHide} />
        </AuthProvider>
      </ToastProvider>
    </DeveloperOptionsProvider>,
  );
}

describe("LoginModal", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders when show is true", () => {
    renderModal({ show: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("does not render when show is false", () => {
    renderModal({ show: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows Sign In button as disabled when fields are empty", () => {
    renderModal();
    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    expect(submitBtn).toBeDisabled();
  });

  it("enables Sign In button when both fields are filled", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it("shows invalid credentials error on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }),
    );

    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid username or password.")).toBeInTheDocument();
    });
  });

  it("shows rate-limited error on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }),
    );

    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Too many login attempts. Please try again later."),
      ).toBeInTheDocument();
    });
  });

  it("calls onHide when Cancel is clicked", async () => {
    const onHide = vi.fn();
    const user = userEvent.setup();
    renderModal({ onHide });

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onHide).toHaveBeenCalledOnce();
  });

  it("shows spinner during submission", async () => {
    // Never resolves so we can observe the in-flight state
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));

    const user = userEvent.setup();
    renderModal();

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // While submitting, the spinner should be visible and fields should be disabled
    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Username")).toBeDisabled();
  });
});
