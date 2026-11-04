import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthCallbackPage } from "@/pages/AuthCallbackPage";

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  triggerLogin: vi.fn(),
  isValidating: false,
  error: undefined as Error | undefined,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state }));
vi.mock("react-oidc-context", () => ({ useAuth: () => state }));
beforeEach(() => {
  state.navigate.mockClear();
  state.triggerLogin.mockClear();
  state.isValidating = false;
  state.error = undefined;
});
afterEach(() => window.history.replaceState(null, "", "/"));

it.each(["access_denied", "server_error"])(
  "keeps %s visible with safe copy and retry",
  async (error) => {
    window.history.replaceState(
      null,
      "",
      `/auth/callback?error=${error}&error_description=private-provider-diagnostic`,
    );
    render(<AuthCallbackPage />);
    expect(screen.getByRole("heading", { name: "Sign-in failed" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent("private-provider-diagnostic");
    expect(state.navigate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Try signing in again" }));
    expect(state.triggerLogin).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Back to Worktime" })).toHaveAttribute("href", "/");
  },
);
it("also handles callback processing failures without URL error parameters", () => {
  window.history.replaceState(null, "", "/auth/callback?code=invalid");
  state.error = new Error("private-provider-diagnostic");
  render(<AuthCallbackPage />);
  expect(screen.getByRole("heading", { name: "Sign-in failed" })).toBeInTheDocument();
  expect(screen.queryByText("private-provider-diagnostic")).not.toBeInTheDocument();
  expect(state.navigate).not.toHaveBeenCalled();
});
it("keeps the progress state until validation finishes", () => {
  state.isValidating = true;
  window.history.replaceState(null, "", "/auth/callback");
  render(<AuthCallbackPage />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(state.navigate).not.toHaveBeenCalled();
});
it("returns home after a settled callback without errors", async () => {
  window.history.replaceState(null, "", "/auth/callback");
  render(<AuthCallbackPage />);
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith({ to: "/", replace: true }));
});
