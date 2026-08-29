import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createRecorderProject } from "../helpers";

test.beforeEach(async ({ page }) => {
  await createRecorderProject(page);
});

test("configures an ephemeral YouTube reference", async ({ page }) => {
  const toggle = page.getByTestId("recorder-reference-video-button");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const setup = page.getByTestId("recorder-youtube-reference");
  const initialPanelBox = await setup.boundingBox();
  expect(initialPanelBox).not.toBeNull();
  await dragBy(
    page,
    setup.getByTestId("recorder-reference-video-resize-handle"),
    -80,
    -60,
  );
  const resizedPanelBox = await setup.boundingBox();
  expect(resizedPanelBox).not.toBeNull();
  expect(resizedPanelBox!.width).toBeCloseTo(initialPanelBox!.width + 80, -1);
  expect(resizedPanelBox!.height).toBeCloseTo(initialPanelBox!.height + 60, -1);
  const preview = setup.getByTestId("recorder-reference-video-preview");
  const containedPlayer = preview.locator(":scope > div");
  const containedPlayerBox = await containedPlayer.boundingBox();
  expect(containedPlayerBox).not.toBeNull();
  expect(containedPlayerBox!.width / containedPlayerBox!.height).toBeCloseTo(
    16 / 9,
    2,
  );
  await setup.getByTestId("recorder-youtube-input").fill("not a video");
  await setup.getByRole("button", { name: "Add video" }).click();
  await expect(setup).toContainText("Enter a valid YouTube URL or video ID.");

  await setup
    .getByTestId("recorder-youtube-input")
    .fill("https://youtu.be/dQw4w9WgXcQ?t=42");
  await setup.getByRole("button", { name: "Add video" }).click();

  const reference = setup;
  await expect(
    reference
      .getByTestId("recorder-reference-video-placeholder")
      .locator("img"),
  ).toHaveAttribute(
    "src",
    /i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/(?:maxres|hq)default\.jpg/,
  );
  await expect(reference.locator("iframe")).toHaveAttribute(
    "src",
    /youtube(?:-nocookie)?\.com\/embed\/dQw4w9WgXcQ/,
  );
  const mute = page.getByTestId("recorder-reference-video-mute");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  const referenceTrack = page.getByTestId("recorder-reference-track");
  await expect(referenceTrack).toContainText("Reference");
  await expect(referenceTrack).toContainText("0:00");
  await expect(referenceTrack).toContainText("3:32");
  await expect(
    referenceTrack.getByTestId("recorder-clip-reference"),
  ).toContainText("YouTube reference");
  const referenceClip = referenceTrack.getByTestId("recorder-clip-reference");
  await dragBy(page, referenceClip, 80, 0, "start");
  await expect(referenceClip).toContainText(/\+\d+\.\d{3}s/);

  const openOnYouTube = reference.getByRole("link", {
    name: "Open on YouTube",
  });
  await expect(openOnYouTube).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  await page.getByRole("button", { name: "Reference actions" }).click();
  await page.getByRole("menuitem", { name: "Remove reference video" }).click();
  await expect(reference.locator("iframe")).toHaveCount(0);
  await expect(referenceTrack).toHaveCount(0);

  await reference
    .getByRole("button", { name: "Close Reference Video" })
    .click();
  await expect(reference).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("uploads and plays a backing track", async ({ page }) => {
  // The musician loads a backing track through the recorder's file picker.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles("e2e/fixtures/test-audio.wav");

  // Decoding produces both a named timeline clip and its waveform preview.
  const clip = page.getByTestId("recorder-clip-audio");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  // Backing audio supports the same non-destructive move and trim workflow.
  const beforeEdit = await clip.boundingBox();
  expect(beforeEdit).not.toBeNull();
  await dragBy(page, clip, 80);
  const afterMove = await clip.boundingBox();
  expect(afterMove).not.toBeNull();
  expect(afterMove!.x).toBeCloseTo(beforeEdit!.x + 80, -1);

  const trimPixels = afterMove!.width / 4;
  await dragBy(page, clip.getByTestId("recorder-take-trim-start"), trimPixels);
  const afterStartTrim = await clip.boundingBox();
  expect(afterStartTrim).not.toBeNull();
  expect(afterStartTrim!.x).toBeCloseTo(afterMove!.x + trimPixels, -1);
  expect(afterStartTrim!.x + afterStartTrim!.width).toBeCloseTo(
    afterMove!.x + afterMove!.width,
    -1,
  );

  await dragBy(page, clip.getByTestId("recorder-take-trim-end"), -trimPixels);
  const afterEndTrim = await clip.boundingBox();
  expect(afterEndTrim).not.toBeNull();
  expect(afterEndTrim!.x).toBeCloseTo(afterStartTrim!.x, -1);
  expect(afterEndTrim!.width).toBeCloseTo(
    afterStartTrim!.width - trimPixels,
    -1,
  );

  // Playback rolls the shared transport and can be paused from its new position.
  const playButton = page.getByTestId("recorder-play-button");
  const position = page.getByTestId("recorder-position");
  await expect(position).toHaveText("01|01 - 00:00.000");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect(position).not.toHaveText("01|01 - 00:00.000");
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "false");

  // Deleting the selected clip preserves the empty audio track row.
  await clip.dispatchEvent("click");
  await expect(clip).toHaveAttribute("data-selected", "true");
  await expect(clip.getByTestId("recorder-clip-selection")).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(clip).toHaveCount(0);
  await expect(page.getByText("Load an audio file")).toBeVisible();
  await expect(page.getByText("No file loaded")).toBeVisible();
});

test("selects and moves audio and take clips together", async ({ page }) => {
  // The musician imports a backing track.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooserPromise).setFiles("e2e/fixtures/test-audio.wav");
  const audio = page.getByTestId("recorder-clip-audio");
  await expect(audio).toBeVisible();

  // They record a take away from zero.
  await enableInput(page);
  await seekRecorderByPixels(page, 160);
  const recordButton = page.getByTestId("recorder-record-button");
  await recordButton.click();
  await waitForRecordingSamples(page.getByTestId("recorder-clip-recording"));
  await recordButton.click();
  const take = page.getByTestId("recorder-clip-take");
  await expect(take).toBeVisible();

  // Ctrl-click adds the take to the selected backing track.
  await audio.click();
  await take.click({ modifiers: ["Control"] });
  await expect(audio).toHaveAttribute("data-selected", "true");
  await expect(take).toHaveAttribute("data-selected", "true");

  // Dragging either selected clip moves the whole selection.
  const audioBefore = await audio.boundingBox();
  const takeBefore = await take.boundingBox();
  expect(audioBefore).not.toBeNull();
  expect(takeBefore).not.toBeNull();
  const takeCenter = {
    x: takeBefore!.x + takeBefore!.width / 2,
    y: takeBefore!.y + takeBefore!.height / 2,
  };
  await page.mouse.move(takeCenter.x, takeCenter.y);
  await page.mouse.down();
  await page.mouse.move(takeCenter.x + 80, takeCenter.y, { steps: 4 });
  await page.mouse.up();

  // Both clips preserve their relative spacing through the shared movement.
  const audioAfter = await audio.boundingBox();
  const takeAfter = await take.boundingBox();
  expect(audioAfter!.x - audioBefore!.x).toBeCloseTo(80, -1);
  expect(takeAfter!.x - takeBefore!.x).toBeCloseTo(80, -1);

  // Delete clears every selected clip while preserving the audio track row.
  await page.keyboard.press("Delete");
  await expect(audio).toHaveCount(0);
  await expect(take).toHaveCount(0);
  await expect(page.getByText("Load an audio file")).toBeVisible();
  await expect(page.getByText("No file loaded")).toBeVisible();
});

test("records, plays, and manages multiple takes", async ({ page }) => {
  // The musician connects the browser input before recording is available.
  await enableInput(page);

  // They place the playhead away from zero so take placement is exercised too.
  await seekRecorderByPixels(page, 160);

  // Recording starts capture and rolls the stopped transport.
  const recordButton = page.getByTestId("recorder-record-button");
  const playButton = page.getByTestId("recorder-play-button");
  const position = page.getByTestId("recorder-position");
  const takesToggle = page.getByTestId("recorder-takes-toggle");
  await expect(takesToggle).toHaveAttribute("aria-expanded", "false");
  await expect(takesToggle).toContainText("0");
  const captureActions = page.getByRole("button", { name: "Capture actions" });
  await captureActions.click();
  await expect(page.getByTestId("recorder-download-take")).toBeDisabled();
  await page.keyboard.press("Escape");
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "true");
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  const recording = page.getByTestId("recorder-clip-recording");
  await expect(recording).toContainText("Recording...");
  await waitForRecordingSamples(recording);
  await expect(recording.locator("svg")).toBeVisible();

  // Stopping flushes the worklet and finalizes a nonempty waveform-backed take.
  await recordButton.click();
  await expect(recordButton).toHaveAttribute("aria-pressed", "false");
  await expect(playButton).toHaveAttribute("aria-pressed", "false");
  const take = page.getByTestId("recorder-clip-take");
  const takeLane = page
    .getByTestId("recorder-take-row")
    .getByTestId("recorder-clip-take-lane");
  const takeRows = page.getByTestId("recorder-take-row");
  const compRegion = page.getByTestId("recorder-clip-comp");
  await expect(takesToggle).toHaveAttribute("aria-expanded", "false");
  await expect(takeRows).toHaveCount(0);
  await expect(take).toHaveCount(1);
  await takesToggle.click();
  await expect(takesToggle).toHaveAttribute("aria-expanded", "true");
  await expect(takeLane).toHaveCount(1);
  await expect(takeRows).toHaveCount(1);
  await expect(compRegion).toContainText("Take 1");
  await expect(compRegion.locator("svg")).toBeVisible();
  await captureActions.click();
  await expect(page.getByTestId("recorder-download-take")).toBeEnabled();
  await page.keyboard.press("Escape");
  expect(
    Number.parseFloat(await take.evaluate((element) => element.style.left)),
  ).toBeCloseTo(160, -2);

  // The take can be moved and trimmed without changing its source audio.
  const beforeEdit = await take.boundingBox();
  expect(beforeEdit).not.toBeNull();
  await dragBy(page, take, 80);
  const afterMove = await take.boundingBox();
  expect(afterMove).not.toBeNull();
  expect(afterMove!.x).toBeCloseTo(beforeEdit!.x + 80, -1);

  const trimStart = take.getByTestId("recorder-take-trim-start");
  const trimPixels = Math.max(2, afterMove!.width / 4);
  await dragBy(page, trimStart, trimPixels);
  const afterStartTrim = await take.boundingBox();
  expect(afterStartTrim).not.toBeNull();
  expect(afterStartTrim!.x).toBeCloseTo(afterMove!.x + trimPixels, -1);
  expect(afterStartTrim!.x + afterStartTrim!.width).toBeCloseTo(
    afterMove!.x + afterMove!.width,
    -1,
  );

  const trimEnd = take.getByTestId("recorder-take-trim-end");
  await dragBy(page, trimEnd, -trimPixels);
  const afterEndTrim = await take.boundingBox();
  expect(afterEndTrim).not.toBeNull();
  expect(afterEndTrim!.x).toBeCloseTo(afterStartTrim!.x, -1);
  expect(afterEndTrim!.width).toBeCloseTo(
    afterStartTrim!.width - trimPixels,
    -1,
  );

  // The resolved recording downloads as a timestamped WAV file.
  const downloadPromise = page.waitForEvent("download");
  await captureActions.click();
  await page.getByTestId("recorder-download-take").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^toy-midi-recording-.*\.wav$/);
  const downloadPath = test.info().outputPath("take.wav");
  await download.saveAs(downloadPath);
  expect(readFileSync(downloadPath).subarray(0, 4).toString()).toBe("RIFF");

  // The completed take immediately joins normal transport playback.
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await playButton.click();

  // They move later in the song and record another attempt.
  await seekRecorderByPixels(page, 320);
  await recordButton.click();
  const secondRecording = page.getByTestId("recorder-clip-recording");
  await expect(secondRecording).toContainText("Recording...");
  await waitForRecordingSamples(secondRecording);
  await recordButton.click();

  // The second recording is retained as a new source take.
  await expect(take).toHaveCount(2);
  await expect(takeLane).toHaveCount(2);
  await expect(takeRows).toHaveCount(2);
  expect(
    Number.parseFloat(
      await take.nth(1).evaluate((element) => element.style.left),
    ),
  ).toBeCloseTo(320, -2);

  // Muting removes a take from Capture without deleting its source lane.
  const muteTake = page.getByTestId("recorder-take-mute");
  await muteTake.nth(1).click();
  await expect(muteTake.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(takeLane).toHaveCount(2);
  await expect(take).toHaveCount(1);
  await expect(compRegion).not.toContainText("Take 2");

  // Solo derives Capture from soloed, unmuted take lanes.
  const soloTake = page.getByTestId("recorder-take-solo");
  await soloTake.nth(1).click();
  await expect(soloTake.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(take).toHaveCount(0);
  await muteTake.nth(1).click();
  await expect(take).toHaveCount(1);
  await soloTake.nth(1).click();
  await expect(take).toHaveCount(2);

  // The source lanes can be folded without changing the resolved comp.
  await takesToggle.click();
  await expect(takesToggle).toHaveAttribute("aria-expanded", "false");
  await expect(takeRows).toHaveCount(0);
  await expect(compRegion).not.toHaveCount(0);
  await takesToggle.click();
  await expect(takeRows).toHaveCount(2);

  // Selecting a source take does not seek, and Escape clears the selection.
  const positionBeforeSelection = await position.textContent();
  await take.nth(0).click();
  await expect(position).toHaveText(positionBeforeSelection!);
  await expect(take.nth(0)).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Escape");
  await expect(take.nth(0)).not.toHaveAttribute("data-selected", "true");

  // Delete removes every selected source take together.
  await take.nth(0).click();
  await takeLane.nth(1).click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  await expect(take).toHaveCount(0);
  await expect(page.getByText("No takes")).toBeVisible();
});

test("mixes recorder outputs in a floating panel", async ({ page }) => {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooserPromise).setFiles("e2e/fixtures/test-audio.wav");

  await page.getByTestId("recorder-mixer-button").click();
  const panel = page.getByTestId("recorder-mixer-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-master")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-audio-1")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-capture")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-metro")).toBeVisible();

  const masterLevel = panel.getByRole("textbox", {
    name: "Master level in dB",
  });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await expect(masterLevel).toHaveValue("-6.0");

  const audio = panel.getByTestId("recorder-mixer-audio-1");
  await audio.getByRole("button", { name: "Toggle Audio 1 mute" }).click();
  await expect(
    audio.getByRole("button", { name: "Toggle Audio 1 mute" }),
  ).toHaveAttribute("aria-pressed", "true");
  await audio.getByRole("button", { name: "Toggle Audio 1 solo" }).click();
  await expect(
    audio.getByRole("button", { name: "Toggle Audio 1 solo" }),
  ).toHaveAttribute("aria-pressed", "true");

  await panel.getByRole("button", { name: "Close Mixer" }).click();
  await expect(panel).toBeHidden();
});

test("exports and imports a recorder project archive", async ({ page }) => {
  // Build an editable project with backing audio and two retained takes.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooserPromise).setFiles("e2e/fixtures/test-audio.wav");
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();

  await enableInput(page);
  const recordButton = page.getByTestId("recorder-record-button");
  for (const position of [160, 320]) {
    await seekRecorderByPixels(page, position);
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
  await page.goto("/recorder");
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

async function seekRecorderByPixels(page: Page, pixels: number) {
  const ruler = page.getByTestId("recorder-timeline-ruler");
  const box = await ruler.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + pixels, box!.y + box!.height / 2);
}

async function dragBy(
  page: Page,
  locator: Locator,
  deltaX: number,
  deltaY = 0,
  horizontalAnchor: "center" | "start" = "center",
) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const startX =
    horizontalAnchor === "start" ? box!.x + 20 : box!.x + box!.width / 2;
  await page.mouse.move(startX, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, box!.y + box!.height / 2 + deltaY, {
    steps: 4,
  });
  await page.mouse.up();
}

async function waitForRecordingSamples(recording: Locator) {
  const initialWidth = await recording.evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  await expect
    .poll(() =>
      recording.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeGreaterThan(initialWidth);
}

async function enableInput(page: Page) {
  // Fake audio still exercises permission, device discovery, and channel setup.
  const route = page.getByRole("button", {
    name: "Fake Default Audio Input · Input 1",
  });
  await expect(page.getByTestId("recorder-input-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await route.click();
  await expect(
    page.getByRole("heading", { name: "Audio Input Setup" }),
  ).toBeVisible();
  const setup = page.getByTestId("recorder-input-setup");
  await setup.getByRole("button", { name: "Enable input" }).click();
  await expect(
    setup.getByRole("button", { name: "Disable input" }),
  ).toBeVisible();
  await expect(page.getByLabel("Device")).toContainText(
    "Fake Default Audio Input",
  );
  await expect(page.getByLabel("Channel")).toContainText("Channel 1");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("button", {
      name: "Fake Default Audio Input · Input 1",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("recorder-input-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}
