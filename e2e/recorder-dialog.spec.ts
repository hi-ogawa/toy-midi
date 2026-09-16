import { expect, test } from "@playwright/test";
import { createRecorderProject, getRecorderPosition } from "./recorder-helpers";

test("menu dialogs contain keyboard focus and return to More", async ({
  page,
}) => {
  // Open Help by keyboard and leave the dropdown closed behind the dialog.
  await createRecorderProject(page);
  const more = page.getByRole("button", { name: "More", exact: true });
  await more.focus();
  await page.keyboard.press("Enter");
  const helpItem = page.getByRole("menuitem", { name: "Help & Shortcuts" });
  await expect(helpItem).toBeFocused();
  await page.keyboard.press("Enter");
  const help = page.getByRole("dialog", { name: "Recorder quick reference" });
  const close = help.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await expect(page.getByRole("menu")).toBeHidden();

  // Keep Tab navigation and timeline shortcuts inside Help.
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("ArrowRight");
  expect(await getRecorderPosition(page)).toBe(0);

  // Dismiss Help with Escape and restore focus to the persistent menu button.
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(more).toBeFocused();
  await expect(page.getByRole("menu")).toBeHidden();

  // Open Export by pointer and cycle focus through both dialog buttons.
  await more.click();
  await page
    .getByRole("menuitem", { name: "Export Audio", exact: true })
    .click();
  const exportDialog = page.getByRole("dialog", { name: "Export Audio" });
  const exportClose = exportDialog.getByRole("button", {
    name: "Close",
    exact: true,
  });
  await expect(exportClose).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    exportDialog.getByRole("button", { name: "Export file" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(exportClose).toBeFocused();

  // Click the backdrop to dismiss Export and return focus to More.
  await page.mouse.click(4, 4);
  await expect(exportDialog).toBeHidden();
  await expect(more).toBeFocused();
});

test("a directly opened dialog restores focus without an explicit target", async ({
  page,
}) => {
  // Open Input Setup from its persistent button and focus the dialog's close control.
  await createRecorderProject(page);
  const configure = page.getByRole("button", { name: "Configure audio input" });
  await configure.click();
  const dialog = page.getByRole("dialog", { name: "Audio Input Setup" });
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();

  // Close with Escape and restore focus to the original control.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(configure).toBeFocused();
});
