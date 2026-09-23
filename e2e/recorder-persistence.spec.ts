import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "../src/lib/recorder/persistence";
import { selectMenuItem } from "./helpers";
import {
  addRecorderAudio,
  createRecorderProject,
  getRecorderPosition,
  saveRecorderProject,
} from "./recorder-helpers";

test("saves and restores a recorder project", async ({ page }) => {
  // Create a project and show its default name in the browser tab.
  await createRecorderProject(page);
  await expect(page).toHaveTitle("Untitled - Toy MIDI");
  const projectUrl = page.url();
  const saveButton = page.getByTestId("recorder-save-button");
  await expect(saveButton).toHaveAttribute("data-status", "saved");
  const saveTooltip = page.getByRole("tooltip");
  await expect(saveButton).not.toHaveAttribute("title");
  await expect(saveTooltip).toHaveCSS("opacity", "0");
  await saveButton.hover();
  await expect(saveTooltip).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(saveTooltip).toHaveCSS("opacity", "0");
  await saveButton.focus();
  await expect(saveTooltip).toHaveCSS("opacity", "1");

  // Transport updates are session state and do not stale persisted state.
  await page.getByTestId("recorder-play-button").click();
  await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(0);
  await page.getByTestId("recorder-play-button").click();
  await expect(saveButton).toHaveAttribute("data-status", "saved");

  // Rename the project and update the browser tab before saving.
  page.once("dialog", (dialog) => dialog.accept("Practice take"));
  await page.getByTestId("recorder-project-name").click();
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );
  await expect(page).toHaveTitle("Practice take - Toy MIDI");

  // Load a backing track, including its decoded waveform.
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");
  const clip = page.getByTestId("recorder-clip-audio");
  await expect(clip).toContainText("test-audio.wav");

  // They change the session tempo.
  await page.getByTestId("recorder-tempo-input").fill("140");
  await page.getByTestId("recorder-tempo-input").press("Enter");

  // They add a reference video and mute its audio.
  await page.getByTestId("recorder-reference-video-button").click();
  const referencePanel = page.getByTestId("recorder-youtube-reference");
  await referencePanel
    .getByTestId("recorder-youtube-input")
    .fill("https://www.youtube.com/watch?v=knp40WxQgOI");
  await referencePanel.getByRole("button", { name: "Add video" }).click();
  await page.getByTestId("recorder-reference-video-mute").click();

  // They set output levels from the recorder mixer.
  await page.getByTestId("recorder-mixer-button").click();
  const masterLevel = page.getByRole("textbox", { name: "Master level in dB" });
  const metronomeLevel = page.getByRole("textbox", {
    name: "Metronome level in dB",
  });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await metronomeLevel.fill("-9");
  await metronomeLevel.press("Enter");

  // The accumulated project edits are unsaved until explicitly saved.
  await expect(saveButton).toHaveAttribute("data-status", "unsaved");
  await saveButton.click();
  await expect(saveButton).toHaveAttribute("data-status", "saved");

  // Reload restores the project name and browser title, tempo, and PCM-backed waveform data.
  await page.reload();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );
  await expect(page).toHaveTitle("Practice take - Toy MIDI");
  await expect(page.getByTestId("recorder-tempo-input")).toHaveValue("140");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  // Reference identity and mute state restore together.
  await expect(page.getByTestId("recorder-reference-track")).toBeVisible();
  await expect(
    page.getByTestId("recorder-reference-video-mute"),
  ).toHaveAttribute("aria-pressed", "true");

  // Mixer levels restore independently from whether the mixer panel was open.
  await page.getByTestId("recorder-mixer-button").click();
  await expect(
    page.getByRole("textbox", { name: "Master level in dB" }),
  ).toHaveValue("-6.0");
  await expect(
    page.getByRole("textbox", { name: "Metronome level in dB" }),
  ).toHaveValue("-9.0");

  // Reopen the saved project from the index with its name in the browser tab.
  await page.goto("/");
  const project = page.getByText("Practice take", { exact: true });
  await expect(project).toBeVisible();
  await project.click();
  await expect(page).toHaveURL(projectUrl);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Practice take",
  );
  await expect(page).toHaveTitle("Practice take - Toy MIDI");

  // Deleting from the index removes the project metadata and content.
  await page.goto("/");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByText("Practice take", { exact: true })).toBeHidden();

  // A stale deep link reports the missing project without retrying its read.
  await page.goto(projectUrl);
  await expect(page.getByText(/Recorder project .* not found/)).toBeVisible();
});

test("loads and resaves a project stored with a single-clip audio track", async ({
  page,
}) => {
  // Seed a stored project whose audio track keeps one clip with track-level timing.
  await page.goto("/__e2e__/");
  const projectId = await page.evaluate(async () => {
    const samples = new Float32Array(22050 * 2).map(
      (_, index) => Math.sin(index / 8) * 0.5,
    );
    return window.__e2e.recorderProjectStorage.createWithContent({
      title: "Single clip",
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      audioTracks: [
        {
          id: "backing",
          height: 72,
          gain: 0.5,
          muted: false,
          soloed: false,
          timelineOffset: 1,
          trimStart: 0.25,
          trimEnd: 1.5,
          clip: {
            name: "single.wav",
            gain: 0.5,
            pcm: { sampleRate: 22050, channels: [samples, samples] },
          },
        },
      ],
      recordingTrack: {
        height: 116,
        gain: 1,
        muted: false,
        soloed: false,
        takes: [],
      },
    });
  });

  // Open the stored project and show the clip with its decoded waveform.
  await page.goto(`/recorder/${projectId}`);
  const clip = page.getByTestId("recorder-clip-audio");
  await expect(clip).toContainText("single.wav");
  await expect(clip.locator("svg")).toBeVisible();

  // Rename and save, which rewrites the track as a clip array with the same timing.
  page.once("dialog", (dialog) => dialog.accept("Resaved clip"));
  await page.getByTestId("recorder-project-name").click();
  await saveRecorderProject(page);
  const saved = await page.evaluate(
    (id) => window.__e2e.recorderProjectStorage.load(id),
    projectId,
  );
  expect(saved.audioTracks[0]).not.toHaveProperty("clip");
  expect(saved.audioTracks[0]).not.toHaveProperty("timelineOffset");
  expect(saved.audioTracks[0].clips).toMatchObject([
    {
      name: "single.wav",
      gain: 0.5,
      timelineOffset: 1,
      trimStart: 0.25,
      trimEnd: 1.5,
      pcm: { sampleRate: 22050 },
    },
  ]);
  expect(saved.audioTracks[0].clips![0].pcm.channels).toHaveLength(2);

  // Reload the resaved project and show the same clip.
  await page.reload();
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Resaved clip",
  );
  await expect(clip).toContainText("single.wav");
  await expect(clip.locator("svg")).toBeVisible();
});

test("saves, exports, and imports every clip on a multi-clip audio track", async ({
  page,
}) => {
  // Seed a stored project whose audio track holds two clips with their own gain and placement.
  await page.goto("/__e2e__/");
  const projectId = await page.evaluate(async () => {
    const samples = new Float32Array(22050).map(
      (_, index) => Math.sin(index / 8) * 0.5,
    );
    const pcm = { sampleRate: 22050, channels: [samples] };
    return window.__e2e.recorderProjectStorage.createWithContent({
      title: "Multi clip",
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      audioTracks: [
        {
          id: "backing",
          height: 72,
          gain: 1,
          muted: false,
          soloed: false,
          clips: [
            {
              id: "first",
              name: "first.wav",
              gain: 0.5,
              timelineOffset: 0,
              pcm,
            },
            {
              id: "second",
              name: "second.wav",
              gain: 0.25,
              timelineOffset: 2,
              trimStart: 0.25,
              trimEnd: 0.75,
              pcm,
            },
          ],
        },
      ],
      recordingTrack: {
        height: 116,
        gain: 1,
        muted: false,
        soloed: false,
        takes: [],
      },
    });
  });

  // Open the project and show both clips on the one track.
  await page.goto(`/recorder/${projectId}`);
  const clips = page.getByTestId("recorder-clip-audio");
  await expect(clips).toHaveCount(2);
  await expect(clips.nth(0)).toContainText("first.wav");
  await expect(clips.nth(1)).toContainText("second.wav");

  // Save, which keeps every clip with its own gain and placement.
  page.once("dialog", (dialog) => dialog.accept("Saved clips"));
  await page.getByTestId("recorder-project-name").click();
  await saveRecorderProject(page);
  const expectedClips = [
    { id: "first", name: "first.wav", gain: 0.5, timelineOffset: 0 },
    {
      id: "second",
      name: "second.wav",
      gain: 0.25,
      timelineOffset: 2,
      trimStart: 0.25,
      trimEnd: 0.75,
    },
  ];
  const saved = await page.evaluate(
    (id) => window.__e2e.recorderProjectStorage.load(id),
    projectId,
  );
  expect(saved.audioTracks[0].clips).toMatchObject(expectedClips);

  // Export the project and find both clips' audio in the archive.
  const downloadPromise = page.waitForEvent("download");
  await selectMenuItem(page, { menu: "Editor menu", item: "Export Project" });
  const archivePath = test.info().outputPath("multi-clip.toymidi.zip");
  await (await downloadPromise).saveAs(archivePath);
  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const archived: SerializedRecorderRuntimeState<string> = JSON.parse(
    await zip.file("project.json")!.async("text"),
  );
  expect(archived.audioTracks[0].clips).toMatchObject(expectedClips);
  for (const clip of archived.audioTracks[0].clips!) {
    expect(zip.file(clip.pcm.channels[0])).not.toBeNull();
  }

  // Import the archive as a new project and show both clips again.
  await page.goto("/");
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("import-recorder-project").click();
  await (await chooserPromise).setFiles(archivePath);
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Saved clips",
  );
  await expect(clips).toHaveCount(2);
  await expect(clips.nth(0)).toContainText("first.wav");
  await expect(clips.nth(1)).toContainText("second.wav");
});
