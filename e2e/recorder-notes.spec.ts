import { expect, test } from "@playwright/test";
import { createRecorderProject, saveRecorderProject } from "./recorder-helpers";

test("keeps project notes with the project", async ({ page }) => {
  // Open the notes panel, and write a chord chart into it.
  await createRecorderProject(page);
  await page.getByTestId("recorder-notes-button").click();
  const notes = page.getByTestId("recorder-notes-input");
  await notes.fill("## Chords\n| Dm7 | G7 |");

  // Type a space in the notes, and see it stay text instead of starting playback.
  await notes.press("End");
  await notes.press("Space");
  await expect(notes).toHaveValue("## Chords\n| Dm7 | G7 | ");
  await expect(page.getByTestId("recorder-play-button")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Save and reload, and see the panel reopen with the notes.
  await saveRecorderProject(page);
  await page.reload();
  await expect(page.getByTestId("recorder-notes-input")).toHaveValue(
    "## Chords\n| Dm7 | G7 | ",
  );
});
