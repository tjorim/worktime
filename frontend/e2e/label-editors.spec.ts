import { test, expect } from "@playwright/test";
for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`label deletion restores focus (${theme}, ${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto(`/e2e/fixtures/label-editors.html?theme=${theme}`);
      await page.getByText("Raw labels JSON (import/export)", { exact: true }).click();
      const rawLabels = page.getByRole("textbox", { name: "Labels JSON", exact: true });
      const original = await rawLabels.inputValue();
      await rawLabels.fill('{"labels":[]}');
      await page.getByRole("button", { name: "Apply Labels JSON", exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText("Remove 1, add 0, change 0");
      await page.screenshot({ path: `../docs/screenshots/1697/${theme}-${width}-replacement.png` });
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await rawLabels.fill(original);
      await page.getByText("Raw labels JSON (import/export)", { exact: true }).click();
      const trigger = page.getByRole("button", { name: "Delete Support", exact: true });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Cancel", exact: true })
        .press("Enter");
      await expect(trigger).toBeFocused();
      await trigger.press("Enter");
      await page.screenshot({
        path: `../docs/screenshots/1719/${theme}-${width}-confirmation.png`,
      });
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete", exact: true })
        .press("Enter");
      await expect(page.getByRole("button", { name: "Add Label", exact: true })).toBeFocused();
      await page.screenshot({ path: `../docs/screenshots/1719/${theme}-${width}-deleted.png` });
      await page.getByText("Raw labels JSON (import/export)", { exact: true }).click();
      await page.getByRole("textbox", { name: "Labels JSON", exact: true }).fill("invalid draft");
      await page.getByRole("button", { name: "Apply Labels JSON", exact: true }).click();
      await page.screenshot({ path: `../docs/screenshots/1697/${theme}-${width}-invalid.png` });
      await page.getByRole("button", { name: "Simulate refresh" }).click();
      await expect(page.getByRole("textbox", { name: "Labels JSON", exact: true })).toHaveValue(
        "invalid draft",
      );
      await expect(page.getByText(/The saved data changed/)).toBeVisible();
      await page.screenshot({ path: `../docs/screenshots/1718/${theme}-${width}-draft.png` });
    });
  }
}

test("dirty drafts guard route changes and history separately", async ({ page }) => {
  await page.goto("/e2e/fixtures/label-editors.html");
  await page.getByRole("button", { name: "Leave editors" }).click();
  await page.getByRole("button", { name: "Return editors" }).click();
  await page.getByText("Raw templates JSON (import/export)", { exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Templates JSON", exact: true });
  await editor.fill("authored draft");
  page.on("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Leave editors" }).click();
  await expect(editor).toHaveValue("authored draft");
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(editor).toHaveValue("authored draft");
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Leave editors" }).click();
  await expect(page.getByText("Other page")).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  for (const width of [1280, 390]) {
    test(`partial replacement shows saved data and keeps draft (${theme}, ${width})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.goto(`/e2e/fixtures/label-editors.html?theme=${theme}&partial`);
      await page.getByText("Raw labels JSON (import/export)", { exact: true }).click();
      const editor = page.getByRole("textbox", { name: "Labels JSON", exact: true });
      const draft = JSON.stringify({ labels: [{ id: "new", name: "New", color: "#123456" }] });
      await editor.fill(draft);
      await page.getByRole("button", { name: "Apply Labels JSON", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
      await expect(page.getByText(/Server results: 1 accepted, 1 conflicted/)).toBeVisible();
      await expect(editor).toHaveValue(draft);
      await expect(page.getByText(/The saved data changed/)).toBeVisible();
      await page.screenshot({
        path: `../docs/screenshots/1697/${theme}-${width}-partial.png`,
        fullPage: true,
      });
    });
  }
}
