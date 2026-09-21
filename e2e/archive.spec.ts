import { expect, type Page, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import {
  addAudio,
  addMidiTrack,
  createMidiNote,
  getMidiNote,
  getBeat,
  createProject,
  enableInput,
  seekByPixels,
  waitForRecordingSamples,
} from "./editor-helpers";
import { useFakeAudioInput } from "./helpers";

useFakeAudioInput();

test("exports and imports a recorder project archive", async ({ page }) => {
  await createProject(page);

  // Build an editable project with backing audio and two retained takes.
  await addAudio(page, "e2e/fixtures/test-audio.wav");

  await enableInput(page);
  const recordButton = page.getByTestId("recorder-record-button");
  for (const beat of [2, 4]) {
    await seekByPixels(page, DEFAULT_PIXELS_PER_BEAT * beat);
    await recordButton.click();
    await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
    await recordButton.click();
  }
  await expect(page.getByTestId("recorder-clip-comp-source")).toHaveCount(2);
  const clipGeometry = await getClipGeometry(page);
  await page.getByTestId("recorder-mixer-button").click();
  const masterLevel = page.getByRole("textbox", { name: "Master level in dB" });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await page.getByRole("button", { name: "Close Mixer" }).click();

  // Add MIDI content and non-default instrument, annotation, and locator settings.
  const row = await addMidiTrack(page);
  const note = await createMidiNote(page, row, {
    beat: 1,
    pitch: "C4",
  });
  await row.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  const program = page.getByRole("combobox", { name: "MIDI 1 program" });
  await program.click();
  await page.getByPlaceholder("Search instruments...").fill("Finger");
  await page
    .getByRole("option", { name: "33: Electric Bass (finger)", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Show string annotations" }).check();
  await page
    .getByRole("combobox", { name: "Tuning", exact: true })
    .selectOption("fiveStringBass");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await note.click();
  await page.keyboard.press("5");
  await expect(note.getByTestId("tab-annotation")).toHaveText("B37");
  await seekByPixels(page, DEFAULT_PIXELS_PER_BEAT * 3);
  await page.getByRole("button", { name: "Add locator at playhead" }).click();
  page.once("dialog", (dialog) => dialog.accept("Verse"));
  await page.getByRole("button", { name: "Rename Section 1" }).click();

  // Export the open project and retain the downloaded archive for import.
  page.once("dialog", (dialog) => dialog.accept("Archived recording"));
  await page.getByTestId("recorder-project-name").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByTestId("recorder-export-project").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.toymidi\.zip$/);
  const archivePath = test.info().outputPath("recorder.toymidi.zip");
  await download.saveAs(archivePath);

  // Import from the project list, which opens a newly created local project.
  await page.goto("/");
  const importChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("import-recorder-project").click();
  await (await importChooserPromise).setFiles(archivePath);

  // Reopen the imported copy to verify its persisted content rather than only import state.
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Archived recording",
  );
  await page.reload();

  // Verify the imported project preserves its editable audio and comp state.
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Archived recording",
  );
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  await expect(page.getByTestId("recorder-clip-comp-source")).toHaveCount(2);
  await expect(page.getByTestId("recorder-clip-comp")).toHaveCount(2);
  await expect.poll(() => getClipGeometry(page)).toEqual(clipGeometry);
  await page.getByTestId("recorder-mixer-button").click();
  await expect(
    page.getByRole("textbox", { name: "Master level in dB" }),
  ).toHaveValue("-6.0");
  await page.getByRole("button", { name: "Close Mixer" }).click();

  // Restore the MIDI note's assigned string, instrument, tuning, and locator beat.
  const importedRow = page.getByTestId("recorder-midi-track-row");
  await expect(
    getMidiNote(importedRow, { beat: 1, pitch: "C4" }).getByTestId(
      "tab-annotation",
    ),
  ).toHaveText("B37");
  await page.getByRole("button", { name: "Verse", exact: true }).click();
  await expect.poll(() => getBeat(page)).toBe(3);
  await importedRow.getByRole("button", { name: "MIDI 1 actions" }).click();
  await page
    .getByRole("menuitem", { name: "Instrument…", exact: true })
    .click();
  await expect(program).toContainText("33: Electric Bass (finger)");
  await expect(
    page.getByRole("checkbox", { name: "Show string annotations" }),
  ).toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Tuning", exact: true }),
  ).toHaveValue("fiveStringBass");
});

async function getClipGeometry(page: Page) {
  const geometry = await Promise.all(
    (["audio-source", "comp-source", "comp"] as const).map(async (variant) => ({
      variant,
      clips: await page
        .getByTestId(`recorder-clip-${variant}`)
        .evaluateAll((elements) =>
          elements.map((element) => ({
            left: (element as HTMLElement).style.left,
            width: (element as HTMLElement).style.width,
          })),
        ),
    })),
  );
  return geometry;
}
