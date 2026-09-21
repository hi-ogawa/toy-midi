import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  getRecorderPosition,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  openRecorderMidiInstrument,
} from "./recorder-helpers";

test("menu dialogs contain keyboard focus and isolate shortcuts", async ({
  page,
}) => {
  // Open Help by keyboard and leave the dropdown closed behind the dialog.
  await createRecorderProject(page);
  const menuButton = page.getByRole("button", { name: "Editor menu" });
  const menu = page.getByRole("menu", { name: "Editor menu" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  const helpItem = menu.getByRole("menuitem", { name: "Help & Shortcuts" });
  await expect(helpItem).toBeFocused();
  await page.keyboard.press("Enter");
  const help = page.getByRole("dialog", { name: "Editor quick reference" });
  const close = help.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();
  await expect(menu).toBeHidden();
  await expect(
    help.getByText("Toggle metronome", { exact: true }),
  ).toBeVisible();

  // Keep Tab navigation and timeline shortcuts inside Help.
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("ArrowRight");
  expect(await getRecorderPosition(page)).toBe(0);
  await page.keyboard.press("m");
  await expect(
    page.getByTitle("Toggle metronome (M)", { exact: true }),
  ).toHaveAttribute("aria-pressed", "false");

  // Dismiss Help with Escape and leave the menu closed.
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(menu).toBeHidden();

  // Open Export by pointer and cycle focus through both dialog buttons.
  await menuButton.click();
  await menu.getByRole("menuitem", { name: "Export Audio" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export Audio" });
  const exportClose = exportDialog.getByRole("button", {
    name: "Close",
  });
  await expect(exportClose).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    exportDialog.getByRole("button", { name: "Export file" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(exportClose).toBeFocused();

  // Click the backdrop to dismiss Export.
  await page.mouse.click(4, 4);
  await expect(exportDialog).toBeHidden();

  // Reopen Help and close it through the shared dialog's close control.
  await menuButton.click();
  await helpItem.click();
  await expect(close).toBeFocused();
  await close.click();
  await expect(help).toBeHidden();
});

test("instrument dialog isolates shortcuts", async ({ page }) => {
  // Open a track's instrument dialog from its menu with a selected unsaved note.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const note = await createRecorderMidiNote(page, row, {
    beat: 0,
    pitch: "C4",
  });
  const dialog = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();
  await expect(page.getByRole("menu", { name: "MIDI 1 actions" })).toBeHidden();

  // Keep editor deletion, seeking, playback, and saving inactive inside the modal.
  await dialog.focus();
  await page.keyboard.press("Delete");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.press("Control+s");
  await expect(note).toBeVisible();
  expect(await getRecorderPosition(page)).toBe(0);
  await expect(page.getByTestId("recorder-play-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "unsaved",
  );
});
