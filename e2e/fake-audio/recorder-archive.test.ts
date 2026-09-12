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

test("loads legacy channel paths and rewrites them as uniform track clips", async ({
  page,
}) => {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const paths = [
    "audio/tracks/0/channel-0.f32",
    "audio/tracks/0/channel-1.f32",
    "audio/takes/0/channel-0.f32",
  ];
  paths.forEach((path, index) =>
    zip.file(
      path,
      new Uint8Array(new Float32Array([index + 1, index + 2]).buffer),
    ),
  );
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
          clip: {
            name: "stereo.wav",
            pcm: { sampleRate: 48000, channels: paths.slice(0, 2) },
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
            pcm: { sampleRate: 48000, channels: paths.slice(2) },
          },
        ],
      },
    }),
  );
  const encoded = await zip.generateAsync({ type: "base64" });
  await page.goto("/");
  const result = await page.evaluate(async (encoded) => {
    const moduleUrl = "/src/lib/recorder/project-archive.ts";
    const {
      parseRecorderProjectArchive,
      exportRecorderProjectArchive,
    }: typeof import("../../src/lib/recorder/project-archive") = await import(
      moduleUrl
    );
    const legacy = new File(
      [Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))],
      "legacy.toymidi.zip",
    );
    const project = await parseRecorderProjectArchive(legacy);
    const rewritten = await exportRecorderProjectArchive(project);
    const restored = await parseRecorderProjectArchive(
      new File([rewritten], "current.toymidi.zip"),
    );
    return {
      version: restored.version,
      armedTrack: restored.audioTracks.findIndex(
        (track) => track.id === restored.armedTrackId,
      ),
      tracks: restored.audioTracks.map((track) => ({
        gain: track.gain,
        nextTakeNumber: track.nextTakeNumber,
        clips: track.clips.map((clip) => ({
          name: clip.name,
          number: clip.number,
          timelineOffset: clip.timelineOffset,
          channels: clip.pcm.channels.map((channel) => Array.from(channel)),
        })),
      })),
    };
  }, encoded);
  expect(result).toEqual({
    version: 2,
    armedTrack: 1,
    tracks: [
      {
        gain: 0.5,
        nextTakeNumber: 1,
        clips: [
          {
            name: "stereo.wav",
            number: undefined,
            timelineOffset: 2,
            channels: [
              [1, 2],
              [2, 3],
            ],
          },
        ],
      },
      {
        gain: 0.8,
        nextTakeNumber: 9,
        clips: [
          { name: undefined, number: 8, timelineOffset: 3, channels: [[3, 4]] },
        ],
      },
    ],
  });
});
