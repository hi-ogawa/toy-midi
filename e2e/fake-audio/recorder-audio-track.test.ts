import { expect, test } from "@playwright/test";
import { createRecorderProject, dragBy } from "./recorder-helpers";

test("uploads and plays a backing track", async ({ page }) => {
  await createRecorderProject(page);

  // Load a backing track through the recorder's file picker.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles("e2e/fixtures/test-audio.wav");

  // Decoding produces both a named timeline clip and its waveform preview.
  const clip = page.getByTestId("recorder-clip-audio");
  await expect(clip).toContainText("test-audio.wav");
  await expect(clip.locator("svg")).toBeVisible();

  // Move and trim backing audio without changing its source.
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

test("scrolls overflowing tracks from the track list", async ({ page }) => {
  // Fill a short desktop viewport until the capture track sits below the fold.
  await page.setViewportSize({ width: 1280, height: 400 });
  await createRecorderProject(page);

  const addTrack = page.getByTitle("Add empty audio track");
  for (let index = 0; index < 4; index++) {
    await addTrack.click();
  }

  const lastTrack = page.getByText("Capture", { exact: true });
  await expect(lastTrack).not.toBeInViewport();

  // Scroll from the track list rather than panning the adjacent timeline.
  const tracksLabel = page.getByText("Tracks", { exact: true });
  const box = await tracksLabel.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 500);

  // The final track becomes reachable.
  await expect(lastTrack).toBeInViewport();
});

test("mixes recorder outputs in a floating panel", async ({ page }) => {
  await createRecorderProject(page);

  // Load backing audio so its channel appears in the mixer.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooserPromise).setFiles("e2e/fixtures/test-audio.wav");

  // Open the floating mixer and inspect every recorder output channel.
  await page.getByTestId("recorder-mixer-button").click();
  const panel = page.getByTestId("recorder-mixer-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-master")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-audio-1")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-capture")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-metro")).toBeVisible();

  // Set the master output to an exact decibel level.
  const masterLevel = panel.getByRole("textbox", {
    name: "Master level in dB",
  });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await expect(masterLevel).toHaveValue("-6.0");

  // Mute and solo backing audio independently.
  const audio = panel.getByTestId("recorder-mixer-audio-1");
  await audio.getByRole("button", { name: "Toggle Audio 1 mute" }).click();
  await expect(
    audio.getByRole("button", { name: "Toggle Audio 1 mute" }),
  ).toHaveAttribute("aria-pressed", "true");
  await audio.getByRole("button", { name: "Toggle Audio 1 solo" }).click();
  await expect(
    audio.getByRole("button", { name: "Toggle Audio 1 solo" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Close the panel without dismissing the project.
  await panel.getByRole("button", { name: "Close Mixer" }).click();
  await expect(panel).toBeHidden();
});
