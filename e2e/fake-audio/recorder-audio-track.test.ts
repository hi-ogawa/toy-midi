import { expect, test } from "@playwright/test";
import { dragBy } from "./recorder-helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/recorder");
  await page.getByTestId("new-recorder-project-button").click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  await expect(page.getByTestId("recorder-project-name")).toBeVisible();
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

test("mixes recorder outputs in a floating panel", async ({ page }) => {
  // Load backing audio so its channel appears in the mixer.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await fileChooserPromise).setFiles("e2e/fixtures/test-audio.wav");

  // Opening the floating mixer exposes every recorder output channel.
  await page.getByTestId("recorder-mixer-button").click();
  const panel = page.getByTestId("recorder-mixer-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-master")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-audio-1")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-capture")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-metro")).toBeVisible();

  // They set the master output to an exact decibel level.
  const masterLevel = panel.getByRole("textbox", {
    name: "Master level in dB",
  });
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await expect(masterLevel).toHaveValue("-6.0");

  // Backing audio can be muted and soloed independently.
  const audio = panel.getByTestId("recorder-mixer-audio-1");
  await audio.getByRole("button", { name: "Toggle Audio 1 mute" }).click();
  await expect(
    audio.getByRole("button", { name: "Toggle Audio 1 mute" }),
  ).toHaveAttribute("aria-pressed", "true");
  await audio.getByRole("button", { name: "Toggle Audio 1 solo" }).click();
  await expect(
    audio.getByRole("button", { name: "Toggle Audio 1 solo" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Closing the panel returns to the recorder without dismissing the project.
  await panel.getByRole("button", { name: "Close Mixer" }).click();
  await expect(panel).toBeHidden();
});
