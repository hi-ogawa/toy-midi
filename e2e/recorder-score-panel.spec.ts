import { expect, test } from "@playwright/test";
import {
  createRecorderProject,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  saveRecorderProject,
} from "./recorder-helpers";

test("previews a MIDI note and opens its saved full score", async ({
  page,
}) => {
  // Create a MIDI track and add a C4 note at the first beat.
  await createRecorderProject(page);
  const row = await addRecorderMidiTrack(page);
  const note = await createRecorderMidiNote(page, row, {
    beat: 0,
    pitch: "C4",
  });
  await expect(note).toHaveAttribute("aria-label", "C4, beat 1");

  // Open the score preview and verify the note renders as notation.
  await page
    .getByRole("button", { name: "MIDI 1 actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Score preview", exact: true })
    .click();
  const score = page.getByTestId("recorder-score-preview");
  await expect(score).toHaveCount(1);
  await expect(
    score.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();

  // Keep the full-score link disabled until the project is saved.
  const openScore = score.getByRole("link", { name: "Open full score" });
  await expect(openScore).toBeDisabled();
  await expect(openScore).not.toHaveAttribute("href");
  await openScore.hover();
  await expect(score.getByRole("tooltip")).toHaveText(
    "Please save before opening score view",
  );
  await expect(score.getByRole("tooltip")).toHaveCSS("opacity", "1");

  // Save the project and open its track in the full score viewer.
  await saveRecorderProject(page);
  await expect(openScore).toBeEnabled();
  const projectId = new URL(page.url()).pathname.split("/").at(-1)!;
  const popupPromise = page.waitForEvent("popup");
  await openScore.click();
  const scorePage = await popupPromise;
  await expect(scorePage).toHaveURL(
    (url) =>
      url.pathname === "/score-viewer" &&
      url.searchParams.get("projectId") === projectId &&
      !!url.searchParams.get("trackId"),
  );
  await expect(scorePage.getByTestId("score-name")).toHaveText(
    "Untitled recording · MIDI 1.musicxml",
  );
  await expect(
    scorePage.getByTestId("score-viewer-renderer").locator("svg"),
  ).toBeVisible();
  await scorePage.close();

  // Close the score preview and verify the panel disappears.
  await page
    .getByRole("button", {
      name: "Close score preview for MIDI 1",
      exact: true,
    })
    .click();
  await expect(score).toHaveCount(0);
});
