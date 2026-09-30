import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Hint } from "@/components/ui/tooltip";

describe("Hint", () => {
  it("opens on focus, keeps the child click handler and dismisses with Escape", async () => {
    const click = vi.fn();
    const user = userEvent.setup();
    render(
      <Hint content="Details">
        <button onClick={click}>Action</button>
      </Hint>,
    );
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Details");
    expect(screen.getByRole("button")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button"));
    expect(click).toHaveBeenCalledOnce();
  });

  it("supports hover and disables hints when their action is unavailable", async () => {
    const user = userEvent.setup();
    const view = render(
      <Hint content="Details">
        <span>Value</span>
      </Hint>,
    );
    await user.hover(screen.getByText("Value"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Details");
    view.rerender(
      <Hint disabled content="Details">
        <span>Value</span>
      </Hint>,
    );
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("renders controlled copy feedback without adding a wrapper around a table cell", async () => {
    const view = render(
      <table>
        <tbody>
          <tr>
            <Hint open content="Copied">
              <td id="hours">Hours</td>
            </Hint>
          </tr>
        </tbody>
      </table>,
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Copied");
    expect(screen.getByRole("cell").parentElement?.tagName).toBe("TR");
    expect(screen.getByRole("cell")).toHaveAttribute("id", "hours");
    view.rerender(
      <table>
        <tbody>
          <tr>
            <Hint open={false} content="Copied">
              <td id="hours">Hours</td>
            </Hint>
          </tr>
        </tbody>
      </table>,
    );
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("can open a status hint by click while preserving its action", async () => {
    const click = vi.fn();
    const user = userEvent.setup();
    render(
      <Hint openOnClick content="Status">
        <button onClick={click}>Sync</button>
      </Hint>,
    );
    await user.click(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Status");
    expect(click).toHaveBeenCalledOnce();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });
});
