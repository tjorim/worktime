import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "@/components/shared/ContextMenu";

function Example({ onSelect, onDismiss }: { onSelect: () => void; onDismiss?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)}>
        Open menu
      </button>
      <ContextMenu
        isOpen={open}
        x={20}
        y={20}
        triggerRef={ref}
        onClose={() => {
          onDismiss?.();
          setOpen(false);
        }}
        items={[
          { label: "Disabled", disabled: true, onClick: onSelect },
          { label: "Edit", onClick: onSelect },
          { separator: true },
          { label: "Delete", variant: "danger", onClick: onSelect },
        ]}
      />
    </>
  );
}

describe("ContextMenu keyboard interaction", () => {
  it("prevents disabled actions, selects with the keyboard and restores focus", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<Example onSelect={onSelect} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() => expect(screen.getByRole("menu")).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Disabled" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });
  it("dismisses with Escape without selecting an action", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    render(<Example onSelect={onSelect} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
  });
});
