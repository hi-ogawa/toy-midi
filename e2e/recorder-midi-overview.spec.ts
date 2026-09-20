import { expect, test } from "@playwright/test";
import {
  addRecorderMidiTrack,
  createRecorderMidiNote,
  createRecorderProject,
  saveRecorderProject,
} from "./recorder-helpers";

test("switches a MIDI track to a passive overview and restores its editor", async ({
  page,
}) => {
  // Create two pitches and a second track so switching views can be checked independently.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  await createRecorderMidiNote(page, row, { beat: 2, pitch: "E4" });
  const other = await addRecorderMidiTrack(page);
  const grid = row.getByTestId("recorder-midi-grid");
  const notes = grid.locator("[data-note-id]");
  const originalNote = (await notes.first().boundingBox())!;

  // Resize and scroll the editor, then copy a note before folding the track.
  const resize = (await row.getByTitle("Resize MIDI 1").boundingBox())!;
  await page.mouse.move(
    resize.x + resize.width / 2,
    resize.y + resize.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    resize.x + resize.width / 2,
    resize.y + resize.height / 2 + 60,
  );
  await page.mouse.up();
  const expandedHeight = (await row.boundingBox())!.height;
  await notes.first().click();
  await page.keyboard.press("ControlOrMeta+c");
  const scroll = row.getByTestId("recorder-midi-pitch-scroll");
  const scrollTop = await scroll.evaluate((element) => {
    element.scrollTop += 36;
    return element.scrollTop;
  });
  await saveRecorderProject(page);
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  const overviewToggle = page.getByRole("menuitemcheckbox", {
    name: "Overview",
    exact: true,
  });
  await expect(overviewToggle).not.toBeChecked();
  // Toggle Overview repeatedly without closing the menu, then dismiss it with Escape.
  await overviewToggle.click();
  await expect(overviewToggle).toBeChecked();
  await overviewToggle.press("Enter");
  await expect(overviewToggle).not.toBeChecked();
  await overviewToggle.press("Enter");
  await expect(overviewToggle).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(overviewToggle).not.toBeVisible();

  // Verify the overview retains track height and note timing while removing the piano roll.
  const overview = row.getByRole("img", {
    name: "MIDI 1 note overview, 2 notes",
  });
  await expect(overview).toBeVisible();
  await expect(grid).toHaveCount(0);
  await expect(row.getByRole("button", { name: /^Preview / })).toHaveCount(0);
  await expect(row.getByTitle("Resize MIDI 1")).toBeVisible();
  expect((await row.boundingBox())!.height).toBe(expandedHeight);
  const previewNotes = overview.locator(":scope > div");
  const firstPreview = (await previewNotes.first().boundingBox())!;
  expect(firstPreview.x).toBeCloseTo(originalNote.x, 0);
  expect(firstPreview.width).toBeCloseTo(originalNote.width, 0);
  expect(firstPreview.y).toBeGreaterThan(
    (await previewNotes.nth(1).boundingBox())!.y,
  );
  await expect(other.getByTestId("recorder-midi-grid")).toBeVisible();

  // Enlarge the overview and verify its pitches spread out while timing stays aligned.
  const overviewResize = (await row.getByTitle("Resize MIDI 1").boundingBox())!;
  await page.mouse.move(
    overviewResize.x + overviewResize.width / 2,
    overviewResize.y + overviewResize.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    overviewResize.x + overviewResize.width / 2,
    overviewResize.y + overviewResize.height / 2 + 80,
  );
  await page.mouse.up();
  const overviewHeight = (await row.boundingBox())!.height;
  expect(overviewHeight).toBe(expandedHeight + 80);
  const resizedPreview = (await previewNotes.first().boundingBox())!;
  const secondPreview = (await previewNotes.nth(1).boundingBox())!;
  expect(resizedPreview.y - secondPreview.y).toBeGreaterThan(40);
  expect(resizedPreview.x).toBeCloseTo(originalNote.x, 0);
  await saveRecorderProject(page);

  // Click, drag, delete, and paste on the passive overview without changing its notes.
  await overview.click();
  const box = (await overview.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 60);
  await page.mouse.up();
  await page.keyboard.press("Delete");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(overview).toHaveAttribute(
    "aria-label",
    "MIDI 1 note overview, 2 notes",
  );
  await expect(page.getByTestId("recorder-save-button")).toHaveAttribute(
    "data-status",
    "saved",
  );

  // Reopen the piano roll at the shared height and previous pitch scroll, with editing still available.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await expect(overviewToggle).toBeChecked();
  await overviewToggle.click();
  await expect(overviewToggle).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(grid).toBeVisible();
  expect((await row.boundingBox())!.height).toBe(overviewHeight);
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(scrollTop);
  await expect(notes).toHaveCount(2);
  await createRecorderMidiNote(page, row, { beat: 1, pitch: "D4" });
  await expect(notes).toHaveCount(3);

  // Return to the resized overview, save, and reload its mode and shared height.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await overviewToggle.click();
  await expect(overviewToggle).toBeVisible();
  await page.keyboard.press("Escape");
  expect((await row.boundingBox())!.height).toBe(overviewHeight);
  await saveRecorderProject(page);
  await page.reload();
  await expect(
    row.getByRole("img", { name: "MIDI 1 note overview, 3 notes" }),
  ).toBeVisible();
  expect((await row.boundingBox())!.height).toBe(overviewHeight);
  await expect(other.getByTestId("recorder-midi-grid")).toBeVisible();

  // Uncheck Overview after reload and verify the shared track height.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await expect(overviewToggle).toBeChecked();
  await overviewToggle.click();
  await expect(overviewToggle).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(grid).toBeVisible();
  expect((await row.boundingBox())!.height).toBe(overviewHeight);
  await saveRecorderProject(page);
  await page.reload();
  await expect(grid).toBeVisible();
  expect((await row.boundingBox())!.height).toBe(overviewHeight);
});

test("shows empty and single-pitch overviews", async ({ page }) => {
  // Fold an empty track, show its empty message, and keep its mix controls available.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Overview", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    row.getByRole("img", { name: "MIDI 1 note overview, 0 notes" }),
  ).toBeVisible();
  await expect(row.getByText("No notes", { exact: true })).toBeVisible();
  await expect(
    row.getByText("Click the grid to add notes", { exact: true }),
  ).toBeHidden();
  await row.getByTitle("Mute MIDI 1", { exact: true }).click();
  await expect(
    row.getByTitle("Unmute MIDI 1", { exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Add one note in the editor and verify the overview centers it in the lane.
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Overview", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await createRecorderMidiNote(page, row, { beat: 0, pitch: "C4" });
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "Overview", exact: true })
    .click();
  await page.keyboard.press("Escape");
  const overview = row.getByRole("img", {
    name: "MIDI 1 note overview, 1 note",
  });
  await expect(row.getByText("No notes", { exact: true })).toBeHidden();
  const box = (await overview.boundingBox())!;
  const note = (await overview.locator(":scope > div").boundingBox())!;
  // Allow the track border and subpixel rounding when checking visual centering.
  expect(
    Math.abs(note.y + note.height / 2 - box.y - box.height / 2),
  ).toBeLessThanOrEqual(1);
});
