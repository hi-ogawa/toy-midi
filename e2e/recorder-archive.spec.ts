import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "../src/lib/recorder/persistence";
import { exportRecorderProjectArchive } from "../src/lib/recorder/project-archive";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { useFakeAudioInput, selectMenuItem } from "./helpers";
import {
  addRecorderAudio,
  addRecorderMidiTrack,
  createRecorderMidiNote,
  getRecorderMidiNote,
  getRecorderBeat,
  createRecorderProject,
  armTrack,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
  openRecorderMidiInstrument,
  selectRecorderMidiInstrument,
  saveRecorderProject,
} from "./recorder-helpers";

useFakeAudioInput();

test("exports and imports a recorder project archive", async ({ page }) => {
  await createRecorderProject(page);

  // Build an editable project with backing audio on a new track and two
  // retained takes on Audio 1.
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const rows = page.getByTestId("recorder-audio-track-row");

  await enableInput(page);
  await armTrack(page, { track: "Audio 1" });
  const recordButton = page.getByTestId("recorder-record-button");
  for (const beat of [2, 4]) {
    await seekRecorderByPixels(page, DEFAULT_PIXELS_PER_BEAT * beat);
    await recordButton.click();
    await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
    await recordButton.click();
  }
  await expect(
    rows.nth(0).getByTestId("recorder-clip-audio-source"),
  ).toHaveCount(2);
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

  // Verify the take and backing tracks are exported as clip arrays with their PCM in the archive.
  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const saved: SerializedRecorderRuntimeState<string> = JSON.parse(
    await zip.file("project.json")!.async("text"),
  );
  expect(saved).not.toHaveProperty("recordingTrack");
  expect(saved.audioTracks).toMatchObject([
    {
      name: "Audio 1",
      nextTakeNumber: 3,
      clips: [{ name: "Take 1" }, { name: "Take 2" }],
    },
    { name: "Audio 2", clips: [{ name: "test-audio.wav" }] },
  ]);
  for (const track of saved.audioTracks) {
    expect(track).not.toHaveProperty("clip");
    expect(track).not.toHaveProperty("timelineOffset");
    for (const clip of track.clips!) {
      expect(zip.file(clip.pcm.channels[0])).not.toBeNull();
    }
  }

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
    rows.nth(1).getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  await expect(
    rows.nth(0).getByTestId("recorder-clip-audio-source"),
  ).toHaveCount(2);
  await expect(rows.nth(0).getByTestId("recorder-clip-audio")).toHaveCount(2);
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
    (["audio-source", "audio"] as const).map(async (variant) => ({
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

test("imports a recorder archive with single-clip tracks and a separate recording track", async ({
  page,
}) => {
  // Export an archive whose audio track stores one clip with track-level timing
  // and whose takes live on a separate recording track.
  const bytes = await readFile("e2e/fixtures/test-tones.pcm");
  const pcm = new Float32Array(Uint8Array.from(bytes).buffer);
  const project: SerializedRecorderRuntimeState = {
    title: "Single-clip archive",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    audioTracks: [
      {
        id: "backing",
        height: 72,
        gain: 0.5,
        muted: false,
        soloed: false,
        timelineOffset: 2,
        trimStart: 0.5,
        trimEnd: 3,
        clip: {
          name: "stereo.wav",
          pcm: { sampleRate: 22050, channels: [pcm, pcm] },
        },
      },
    ],
    recordingTrack: {
      height: 116,
      gain: 0.8,
      muted: false,
      soloed: false,
      nextTakeNumber: 9,
      takes: [
        {
          id: "retained",
          number: 8,
          timelineOffset: 3,
          trimStart: 0.25,
          trimEnd: 2,
          pcm: { sampleRate: 22050, channels: [pcm] },
        },
      ],
    },
  };
  const archive = await exportRecorderProjectArchive(project);

  // Import it from the project list and open the recorder.
  await page.goto("/");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("import-recorder-project").click();
  await (
    await chooserPromise
  ).setFiles({
    name: "single-clip.toymidi.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await archive.arrayBuffer()),
  });
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Single-clip archive",
  );

  // Show the retained take on the former Capture track above the backing
  // clip, both with decoded waveforms.
  const rows = page.getByTestId("recorder-audio-track-row");
  const take = rows.nth(0).getByTestId("recorder-clip-audio");
  const audio = rows.nth(1).getByTestId("recorder-clip-audio");
  await expect(audio).toContainText("stereo.wav");
  await expect(take).toContainText("Take 8");
  await expect(audio.locator("svg")).toBeVisible();
  await expect(take.locator("svg")).toBeVisible();
  const clipGeometry = await getRecorderClipGeometry(page);

  // Rename, save, and reopen the project with the same clip placement.
  page.once("dialog", (dialog) => dialog.accept("Resaved archive"));
  await page.getByTestId("recorder-project-name").click();
  await saveRecorderProject(page);
  await page.reload();
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Resaved archive",
  );
  await expect(audio).toContainText("stereo.wav");
  await expect(take).toContainText("Take 8");
  await expect.poll(() => getRecorderClipGeometry(page)).toEqual(clipGeometry);

  // Record another take into Capture, which continues the saved take numbering.
  await enableInput(page);
  await armTrack(page, { track: "Capture" });
  const record = page.getByTestId("recorder-record-button");
  await record.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await record.click();
  await expect(
    rows.nth(0).getByTestId("recorder-clip-audio-source"),
  ).toHaveCount(2);
  await expect(take.filter({ hasText: "Take 9" })).toHaveCount(1);
});
