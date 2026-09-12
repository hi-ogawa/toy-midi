import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../../src/lib/timeline";
import {
  addRecorderAudio,
  createRecorderProject,
  enableInput,
  seekRecorderByPixels,
  waitForRecordingSamples,
} from "./recorder-helpers";

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
  await expect(page.getByTestId("recorder-clip-take")).toHaveCount(2);
  const clipGeometry = await getRecorderClipGeometry(page);
  await page.getByTestId("recorder-mixer-button").click();
  const masterLevel = page.getByRole("textbox", { name: "Master level in dB" });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await page.getByRole("button", { name: "Close Mixer" }).click();

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

  // Verify the imported project preserves its editable audio and comp state.
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Archived recording",
  );
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  await expect(page.getByTestId("recorder-clip-take")).toHaveCount(2);
  await expect(page.getByTestId("recorder-clip-comp")).toHaveCount(2);
  await expect.poll(() => getRecorderClipGeometry(page)).toEqual(clipGeometry);
  await page.getByTestId("recorder-mixer-button").click();
  await expect(
    page.getByRole("textbox", { name: "Master level in dB" }),
  ).toHaveValue("-6.0");
});

async function getRecorderClipGeometry(page: Page) {
  const geometry = await Promise.all(
    (["audio", "take", "comp"] as const).map(async (variant) => ({
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

test("imports a legacy recorder archive and saves the migrated project", async ({
  page,
}) => {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const paths = [
    "audio/tracks/0/channel-0.f32",
    "audio/tracks/0/channel-1.f32",
    "audio/takes/0/channel-0.f32",
  ];
  // Build a v1 archive with audible PCM, legacy channel paths, and edited clips.
  const pcm = await readFile("e2e/fixtures/test-tones.pcm");
  for (const path of paths) {
    zip.file(path, pcm);
  }
  zip.file(
    "manifest.json",
    JSON.stringify({ formatVersion: 1, projectType: "recorder" }),
  );
  zip.file(
    "project.json",
    JSON.stringify({
      title: "Legacy archive",
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      latencyCompensation: 0,
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
            pcm: { sampleRate: 22050, channels: paths.slice(0, 2) },
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
            pcm: { sampleRate: 22050, channels: paths.slice(2) },
          },
        ],
      },
    }),
  );
  const archive = await zip.generateAsync({ type: "nodebuffer" });

  // Import through the Recorder project list and open the migrated recorder.
  await page.goto("/");
  await page.getByRole("tab", { name: "Recorder", exact: true }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("import-recorder-project").click();
  await (
    await chooserPromise
  ).setFiles({
    name: "legacy.toymidi.zip",
    mimeType: "application/zip",
    buffer: archive,
  });
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Legacy archive",
  );
  await verifyMigratedClips(page);

  // Rename and save the migrated project, then reload its current-format data.
  page.once("dialog", (dialog) => dialog.accept("Migrated archive"));
  await page.getByTestId("recorder-project-name").click();
  const save = page.getByTestId("recorder-save-button");
  await expect(save).toHaveAttribute("data-status", "unsaved");
  await save.click();
  await expect(save).toHaveAttribute("data-status", "saved");
  await page.reload();
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Migrated archive",
  );
  await verifyMigratedClips(page);
});

async function verifyMigratedClips(page: Page) {
  const audio = page.getByTestId("recorder-clip-audio");
  const take = page.getByTestId("recorder-clip-comp");
  await expect(audio).toContainText("stereo.wav");
  await expect(take).toContainText("Take 8");
  await expect(audio.locator("svg")).toBeVisible();
  await expect(take.locator("svg")).toBeVisible();
  // At 120 BPM each source second spans two beats, including the saved trims.
  const pixelsPerSecond = 2 * DEFAULT_PIXELS_PER_BEAT;
  await expect
    .poll(() => getRecorderClipGeometry(page))
    .toEqual([
      {
        variant: "audio",
        clips: [
          {
            left: `${2.5 * pixelsPerSecond}px`,
            width: `${2.5 * pixelsPerSecond}px`,
          },
        ],
      },
      {
        variant: "take",
        clips: [
          {
            left: `${3.25 * pixelsPerSecond}px`,
            width: `${1.75 * pixelsPerSecond}px`,
          },
        ],
      },
      {
        variant: "comp",
        clips: [
          {
            left: `${3.25 * pixelsPerSecond}px`,
            width: `${1.75 * pixelsPerSecond}px`,
          },
        ],
      },
    ]);
  await page.getByTestId("recorder-mixer-button").click();
  await expect(
    page.getByRole("textbox", { name: "Audio 1 level in dB", exact: true }),
  ).toHaveValue("-6.0");
  await expect(
    page.getByRole("textbox", { name: "Capture level in dB", exact: true }),
  ).toHaveValue("-1.9");
  await page.getByRole("button", { name: "Close Mixer" }).click();
}
