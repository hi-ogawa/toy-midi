import { expect, test } from "@playwright/test";
import { selectMenuItem } from "./helpers";
import {
  addRecorderMidiTrack,
  createRecorderProject,
  openRecorderMidiInstrument,
} from "./recorder-helpers";

test("native menu dialogs restore the persistent editor menu button", async ({
  page,
}) => {
  // Open Help by keyboard and move focus from the menu into the native dialog.
  await createRecorderProject(page);
  const menuButton = page.getByRole("button", { name: "Editor menu" });
  const menu = page.getByRole("menu", { name: "Editor menu" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  await expect(
    menu.getByRole("menuitem", { name: "Help & Shortcuts" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  const help = page.getByRole("dialog", { name: "Editor quick reference" });
  await expect(help.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(menu).toBeHidden();

  // Close with Escape and let the browser restore the menu button.
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(menuButton).toBeFocused();

  // Open Export by pointer and restore the same button after backdrop dismissal.
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Audio" });
  const exportDialog = page.getByRole("dialog", { name: "Export Audio" });
  await expect(
    exportDialog.getByRole("button", { name: "Close" }),
  ).toBeFocused();
  await page.mouse.click(4, 4);
  await expect(exportDialog).toBeHidden();
  await expect(menuButton).toBeFocused();
});

test("native instrument dialog contains its popup and restores the track menu button", async ({
  page,
}) => {
  // Open the instrument picker within the native dialog's top layer.
  await createRecorderProject(page);
  await addRecorderMidiTrack(page);
  const dialog = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await dialog.getByRole("combobox", { name: "MIDI 1 program" }).click();
  const search = dialog.getByPlaceholder("Search instruments...");
  await expect(search).toBeFocused();

  // Escape dismisses only the nested popup and keeps the dialog interactive.
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
  await expect(dialog).toBeVisible();

  // Close the dialog through its button and restore the persistent track menu button.
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "MIDI 1 actions" }),
  ).toBeFocused();
});

test("native input dialog restores its direct opener", async ({ page }) => {
  // Open Input Setup directly and move focus into the native dialog.
  await createRecorderProject(page);
  const opener = page.getByRole("button", { name: "Configure audio input" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Audio Input Setup" });
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();

  // Close with Escape and let the browser restore the opener.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
