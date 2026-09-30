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
    expect(screen.getByRole("cell")).toHaveAttribute(
      "aria-describedby",
      screen.getByRole("tooltip").id,
    );
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
    expect(screen.getByRole("cell")).not.toHaveAttribute("aria-describedby");
  });

  it("only references its description while the popup is open", async () => {
    const user = userEvent.setup();
    render(
      <Hint content="Details">
        <button>Action</button>
      </Hint>,
    );
    const trigger = screen.getByRole("button");
    expect(trigger).not.toHaveAttribute("aria-describedby");
    await user.tab();
    const popup = await screen.findByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", popup.id);
    await user.tab();
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(trigger).not.toHaveAttribute("aria-describedby");
  });

  it("dismisses click-enabled details after pointer exit and blur", async () => {
    const user = userEvent.setup();
    render(
      <Hint openOnClick content="Status">
        <button>Sync</button>
      </Hint>,
    );
    const trigger = screen.getByRole("button");
    await user.hover(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Status");
    await user.unhover(trigger);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await user.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Status");
    await user.tab();
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await user.click(trigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Status");
    await user.unhover(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Status");
    expect(trigger).toHaveFocus();
    await user.tab();
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
