import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";

describe("ConfirmationDialog", () => {
  it.each(["primary", "danger", "warning"] as const)(
    "labels a %s confirmation and invokes its actions",
    (variant) => {
      const onCancel = vi.fn();
      const onConfirm = vi.fn();
      render(
        <ConfirmationDialog
          isOpen
          title="Confirm change"
          message="Review this change"
          variant={variant}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />,
      );
      const dialog = screen.getByRole(variant === "danger" ? "alertdialog" : "dialog", {
        name: "Confirm change",
      });
      expect(dialog).toHaveAccessibleDescription("Review this change");
      const confirm = screen.getByRole("button", { name: "Confirm" });
      expect(confirm).toHaveClass(
        variant === "danger"
          ? "tw:text-danger-text"
          : variant === "warning"
            ? "tw:text-warning"
            : "tw:text-primary-foreground",
      );
      fireEvent.click(confirm);
      expect(onConfirm).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledOnce();
    },
  );
  it("routes Escape through the cancellation guard", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmationDialog
        isOpen
        title="Guarded"
        message="Unsaved changes"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("traps focus and returns it to the opener", async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open confirmation</button>
          <ConfirmationDialog
            isOpen={open}
            title="Focus test"
            message="Review"
            onCancel={() => setOpen(false)}
            onConfirm={() => setOpen(false)}
          />
        </>
      );
    }
    const user = userEvent.setup();
    render(<Example />);
    const opener = screen.getByRole("button", { name: "Open confirmation" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    for (let index = 0; index < 5; index++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });
});
