import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelsPanel } from "@/features/timeTracking/LabelsPanel";
import { TemplatesPanel } from "@/features/timeTracking/TemplatesPanel";
import { ToastProvider } from "@/contexts/ToastContext";

const labels = [{ id: "a", name: "Support", color: "#123456" }];
const templates = [{ id: "t", text: "Work", label: "a", start: "09:00", stop: "10:00" }];
for (const kind of ["labels", "templates"] as const) {
  const Panel = ({
    source,
    save,
  }: {
    source: Array<(typeof labels)[number] | (typeof templates)[number]>;
    save: () => void;
  }) =>
    kind === "labels" ? (
      <LabelsPanel
        labels={source as typeof labels}
        templates={[]}
        tasks={[]}
        onUpdateLabels={save}
      />
    ) : (
      <TemplatesPanel
        labels={labels}
        templates={source as typeof templates}
        onUpdateTemplates={save}
        onAddTemplate={() => {}}
        onUpdateTemplate={() => {}}
        onDeleteTemplate={() => {}}
      />
    );
  const source = kind === "labels" ? labels : templates;
  describe(`${kind} JSON`, () => {
    it("preserves dirty drafts, detects real changes and requires reconciliation", async () => {
      const user = userEvent.setup();
      const save = vi.fn();
      const view = render(
        <ToastProvider>
          <Panel source={source} save={save} />
        </ToastProvider>,
      );
      const input = screen.getByRole("textbox", {
        name: new RegExp(`${kind} JSON`, "i"),
        hidden: true,
      });
      await user.click(screen.getByText(new RegExp(`Raw ${kind} JSON`)));
      await user.clear(input);
      await user.type(input, "draft");
      view.rerender(
        <ToastProvider>
          <Panel source={[...source]} save={save} />
        </ToastProvider>,
      );
      expect(input).toHaveValue("draft");
      expect(screen.queryByText(/The saved data changed/)).toBeNull();
      view.rerender(
        <ToastProvider>
          <Panel source={[]} save={save} />
        </ToastProvider>,
      );
      expect(input).toHaveValue("draft");
      expect(screen.getByText(/The saved data changed/)).toBeVisible();
      await user.click(screen.getByRole("button", { name: new RegExp(`Apply ${kind} JSON`, "i") }));
      expect(save).not.toHaveBeenCalled();
    });
    it("confirms removals and retains rejected drafts without success", async () => {
      const user = userEvent.setup();
      const save = vi.fn().mockRejectedValue(new Error("diagnostic"));
      render(
        <ToastProvider>
          <Panel source={source} save={save} />
        </ToastProvider>,
      );
      await user.click(screen.getByText(new RegExp(`Raw ${kind} JSON`)));
      const input = screen.getByRole("textbox", { name: new RegExp(`${kind} JSON`, "i") });
      await user.clear(input);
      await user.paste(JSON.stringify({ [kind]: [] }));
      await user.click(screen.getByRole("button", { name: new RegExp(`Apply ${kind} JSON`, "i") }));
      expect(save).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Remove 1, add 0, change 0");
      await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
      expect(await screen.findByText(/Could not save changes/)).toBeVisible();
      expect(input).toHaveValue(JSON.stringify({ [kind]: [] }));
      expect(screen.queryByText(/updated\./)).toBeNull();
    });
    it("rejects malformed JSON and accepts a confirmed unused removal", async () => {
      const user = userEvent.setup();
      const save = vi.fn().mockResolvedValue(undefined);
      render(
        <ToastProvider>
          <Panel source={source} save={save} />
        </ToastProvider>,
      );
      await user.click(screen.getByText(new RegExp(`Raw ${kind} JSON`)));
      const input = screen.getByRole("textbox", { name: new RegExp(`${kind} JSON`, "i") });
      await user.clear(input);
      await user.paste("not JSON");
      await user.click(screen.getByRole("button", { name: new RegExp(`Apply ${kind} JSON`, "i") }));
      expect(screen.getByText(new RegExp(`Invalid ${kind} JSON`))).toBeVisible();
      expect(save).not.toHaveBeenCalled();
      await user.clear(input);
      await user.paste(JSON.stringify({ [kind]: [] }));
      await user.click(screen.getByRole("button", { name: new RegExp(`Apply ${kind} JSON`, "i") }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
      expect(save).toHaveBeenCalledWith([], true);
      expect(await screen.findByText(new RegExp(`${kind} updated\\.`, "i"))).toBeVisible();
    });
    it("rejects invalid entries rather than silently dropping them", async () => {
      const user = userEvent.setup();
      const save = vi.fn();
      render(
        <ToastProvider>
          <Panel source={source} save={save} />
        </ToastProvider>,
      );
      await user.click(screen.getByText(new RegExp(`Raw ${kind} JSON`)));
      const input = screen.getByRole("textbox", { name: new RegExp(`${kind} JSON`, "i") });
      await user.clear(input);
      await user.paste(JSON.stringify({ [kind]: [{ foo: 1 }] }));
      await user.click(screen.getByRole("button", { name: new RegExp(`Apply ${kind} JSON`, "i") }));
      expect(screen.getByText(/Invalid entries: 1/)).toBeVisible();
      expect(save).not.toHaveBeenCalled();
    });
  });
}
it("refuses removing an in-use label", async () => {
  const user = userEvent.setup();
  const save = vi.fn();
  render(
    <ToastProvider>
      <LabelsPanel labels={labels} templates={templates} tasks={[]} onUpdateLabels={save} />
    </ToastProvider>,
  );
  await user.click(screen.getByText(/Raw labels JSON/));
  const input = screen.getByRole("textbox", { name: /Labels JSON/i });
  await user.clear(input);
  await user.paste('{"labels":[]}');
  await user.click(screen.getByRole("button", { name: /Apply Labels JSON/i }));
  expect(screen.getByText(/still in use.*Support/)).toBeVisible();
  expect(save).not.toHaveBeenCalled();
});
it("focuses Add Label after the final delete trigger is removed", async () => {
  function Stateful() {
    const [items, setItems] = useState(labels);
    return <LabelsPanel labels={items} templates={[]} tasks={[]} onUpdateLabels={setItems} />;
  }
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <Stateful />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Delete Support" }));
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add Label" })).toHaveFocus());
  expect(screen.queryByRole("button", { name: "Delete Support" })).toBeNull();
});
it("failed deletion announces failure and returns focus to its surviving trigger", async () => {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <LabelsPanel
        labels={labels}
        templates={[]}
        tasks={[]}
        onUpdateLabels={vi.fn().mockRejectedValue(new Error("private"))}
      />
    </ToastProvider>,
  );
  const trigger = screen.getByRole("button", { name: "Delete Support" });
  await user.click(trigger);
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
  expect(await screen.findByText(/Could not save changes/)).toBeVisible();
  await waitFor(() => expect(trigger).toHaveFocus());
});
it("rejects templates with an unknown label", async () => {
  const user = userEvent.setup();
  const save = vi.fn();
  render(
    <ToastProvider>
      <TemplatesPanel
        labels={labels}
        templates={templates}
        onUpdateTemplates={save}
        onAddTemplate={() => {}}
        onUpdateTemplate={() => {}}
        onDeleteTemplate={() => {}}
      />
    </ToastProvider>,
  );
  await user.click(screen.getByText(/Raw templates JSON/));
  const input = screen.getByRole("textbox", { name: /Templates JSON/i });
  await user.clear(input);
  await user.paste(JSON.stringify({ templates: [{ ...templates[0], label: "ghost" }] }));
  await user.click(screen.getByRole("button", { name: /Apply Templates JSON/i }));
  expect(screen.getByText(/Invalid entries: 1/)).toBeVisible();
  expect(save).not.toHaveBeenCalled();
});
