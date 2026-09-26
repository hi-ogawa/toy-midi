import { expect, type Page, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput, selectMenuItem } from "./helpers";
import {
  addRecorderAudio,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  getRecorderMidiNote,
  getRecorderBeat,
  createRecorderProject,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
  openRecorderMidiInstrument,
  selectRecorderMidiInstrument,
} from "./recorder-helpers";

useFakeAudioInput();

test("exports and imports a recorder project archive", async ({ page }) => {
  await createRecorderProject(page);

  // Build an editable project with backing audio and two retained takes.
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");

  await enableInput(page);
  const recordButton = page.getByTestId("recorder-record-button");
  for (const beat of [2, 4]) {
    await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * beat);
    await recordButton.click();
    await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
    await recordButton.click();
  }
  await expect(page.getByTestId("recorder-clip-comp-source")).toHaveCount(2);
  // Balance one take independently before archiving the project.
  await page.getByTestId("recorder-takes-toggle").click();
  const takeGain = page.getByRole("slider", {
    name: "Take 1 gain",
    exact: true,
  });
  await takeGain.press("ArrowLeft");
  await expect
    .poll(async () => Number(await takeGain.getAttribute("aria-valuenow")))
    .toBeCloseTo(-0.5);
  const clipGeometry = await getRecorderClipGeometry(page);
  await page.getByTestId("recorder-mixer-button").click();
  const masterLevel = page.getByRole("textbox", { name: "Master level in dB" });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await page.getByRole("button", { name: "Close Mixer" }).click();

  // Add MIDI content and non-default instrument, annotation, and locator settings.
  const row = await addRecorderMidiTrack(page);
  const note = await createRecorderMidiNote(page, row, {
    beat: 1,
    pitch: "C4",
  });
  const instrument = await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await selectRecorderMidiInstrument(instrument, {
    option: "33: Electric Bass (finger)",
  });
  await instrument
    .getByRole("checkbox", { name: "Show string annotations" })
    .check();
  await instrument
    .getByRole("combobox", { name: "Tuning", exact: true })
    .selectOption("fiveStringBass");
  await instrument.getByRole("button", { name: "Close", exact: true }).click();
  await note.click();
  await page.keyboard.press("5");
  await expect(note.getByTestId("tab-annotation")).toHaveText("B37");
  await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * 3);
  await page.getByRole("button", { name: "Add locator at playhead" }).click();
  page.once("dialog", (dialog) => dialog.accept("Verse"));
  await page.getByRole("button", { name: "Rename Section 1" }).click();

  // Export the open project and retain the downloaded archive for import.
  page.once("dialog", (dialog) => dialog.accept("Archived recording"));
  await page.getByTestId("recorder-project-name").click();
  const downloadPromise = page.waitForEvent("download");
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Project" });
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
  await expect.poll(() => getRecorderClipGeometry(page)).toEqual(clipGeometry);
  await page.getByTestId("recorder-takes-toggle").click();
  await expect
    .poll(async () => Number(await takeGain.getAttribute("aria-valuenow")))
    .toBeCloseTo(-0.5);
  await expect(
    page.getByRole("slider", { name: "Take 2 gain", exact: true }),
  ).toHaveAttribute("aria-valuenow", "0");
  await page.getByTestId("recorder-mixer-button").click();
  await expect(
    page.getByRole("textbox", { name: "Master level in dB" }),
  ).toHaveValue("-6.0");
  await page.getByRole("button", { name: "Close Mixer" }).click();

  // Restore the MIDI note's assigned string, instrument, tuning, and locator beat.
  const importedRow = page.getByTestId("recorder-midi-track-row");
  await expect(
    getRecorderMidiNote(importedRow, { beat: 1, pitch: "C4" }).getByTestId(
      "tab-annotation",
    ),
  ).toHaveText("B37");
  await page.getByRole("button", { name: "Verse", exact: true }).click();
  await expect.poll(() => getRecorderBeat(page)).toBe(3);
  await openRecorderMidiInstrument(page, { name: "MIDI 1" });
  await expect(instrument.getByTestId("instrument-select")).toContainText(
    "33: Electric Bass (finger)",
  );
  await expect(
    instrument.getByRole("checkbox", { name: "Show string annotations" }),
  ).toBeChecked();
  await expect(
    instrument.getByRole("combobox", { name: "Tuning", exact: true }),
  ).toHaveValue("fiveStringBass");
});

async function getRecorderClipGeometry(page: Page) {
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
