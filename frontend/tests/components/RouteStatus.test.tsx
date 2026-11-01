import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RouteError } from "@/components/RouteStatus";
import * as m from "@/paraglide/messages.js";

describe("RouteError", () => {
  it("offers translated recovery for unrelated errors without exposing diagnostics", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<RouteError error={new Error("boom")} reset={reset} info={undefined} />);

    expect(screen.getByRole("alert")).toHaveTextContent(m.error_boundary_heading());
    expect(screen.getByRole("alert")).toHaveTextContent(m.error_boundary_fallback_message());
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    expect(screen.queryByText(m.route_load_failed_title())).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: m.error_boundary_try_again() }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: m.error_boundary_reload() })).toBeInTheDocument();
  });
});
