import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  getRecorderPosition,
  addRecorderMidiTrack,
  createRecorderMidiNote,
} from "./recorder-helpers";

test("menu dialogs contain keyboard focus and return to the editor menu", async ({
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
  const close = help.getByRole("button", { name: "Close", exact: true });
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

  // Dismiss Help with Escape and restore focus to the persistent menu button.
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(menuButton).toBeFocused();
  await expect(menu).toBeHidden();

  // Open Export by pointer and cycle focus through both dialog buttons.
  await menuButton.click();
  await menu.getByRole("menuitem", { name: "Export Audio" }).click();
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

  // Click the backdrop to dismiss Export and return focus to the editor menu button.
  await page.mouse.click(4, 4);
  await expect(exportDialog).toBeHidden();
  await expect(menuButton).toBeFocused();

  // Reopen Help and close it through the shared dialog's close control.
  await menuButton.click();
  await helpItem.click();
  await expect(close).toBeFocused();
  await close.click();
  await expect(help).toBeHidden();
  await expect(menuButton).toBeFocused();
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

test("instrument dialog isolates shortcuts and restores its track menu trigger", async ({
  page,
}) => {
  // Open a track's instrument dialog from its menu with a selected unsaved note.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const note = await createRecorderMidiNote(page, row, {
    beat: 0,
    pitch: "C4",
  });
  const actions = row.getByRole("button", { name: "MIDI 1 actions" });
  await actions.click();
  const menu = page.getByRole("menu", { name: "MIDI 1 actions" });
  await menu.getByRole("menuitem", { name: "Instrument…" }).click();
  const dialog = page.getByRole("dialog", { name: "MIDI 1 instrument" });
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await expect(menu).toHaveCount(0);

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

  // Dismiss with Escape and return focus to the persistent track action button.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(actions).toBeFocused();
});
