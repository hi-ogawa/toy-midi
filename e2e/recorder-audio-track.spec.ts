import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { DEFAULT_PIXELS_PER_BEAT } from "../src/lib/timeline";
import { selectMenuItem } from "./helpers";
import {
  addRecorderAudio,
  createRecorderProject,
  dragBy,
  getRecorderPosition,
  saveRecorderProject,
} from "./recorder-helpers";

test("uploads and plays a backing track", async ({ page }) => {
  await createRecorderProject(page);

  // Load a backing track through the recorder's file picker.
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");

  // The imported clip retains its source filename.
  const clip = page.getByTestId("recorder-clip-audio-source");
  await expect(page.getByTestId("recorder-clip-audio")).toContainText(
    "test-audio.wav",
  );

  // TODO: Consider consolidating edit assertions with recorder-clip-move.spec.ts and recorder-clip-trim.spec.ts.
  // Move and trim backing audio without changing its source.
  const beforeEdit = await clip.boundingBox();
  expect(beforeEdit).not.toBeNull();
  await dragBy(page, clip, DEFAULT_PIXELS_PER_BEAT);
  const afterMove = await clip.boundingBox();
  expect(afterMove).not.toBeNull();
  expect(afterMove!.x).toBeCloseTo(beforeEdit!.x + DEFAULT_PIXELS_PER_BEAT, -1);

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
  await expect.poll(() => getRecorderPosition(page)).toBe(0);
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(0);
  await playButton.click();
  await expect(playButton).toHaveAttribute("aria-pressed", "false");

  // Deleting the selected clip preserves both audio track rows.
  await clip.dispatchEvent("click");
  await expect(clip).toHaveAttribute("data-selected", "true");
  await expect(clip.getByTestId("recorder-clip-selection")).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(clip).toHaveCount(0);
  await expect(page.getByText("Record or import audio")).toHaveCount(2);
  await expect(page.getByTestId("recorder-audio-track-row")).toHaveCount(2);
});

test("scrolls overflowing tracks from the track list", async ({ page }) => {
  // Fill a short desktop viewport until the last track sits below the fold.
  await page.setViewportSize({ width: 1280, height: 400 });
  await createRecorderProject(page);

  const addTrack = page.getByTitle("Add empty audio track");
  for (let index = 0; index < 4; index++) {
    await addTrack.click();
  }

  const lastTrack = page.getByText("Audio 5", { exact: true });
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
  await addRecorderAudio(page, "e2e/fixtures/test-audio.wav");

  // Master gain stays available without opening the mixer and steps by 0.5 dB.
  const masterGain = page.getByRole("slider", { name: "Master gain" });
  await expect(masterGain).toHaveAttribute("aria-valuenow", "0");
  await masterGain.press("ArrowDown");
  expect(Number(await masterGain.getAttribute("aria-valuenow"))).toBeCloseTo(
    -0.5,
  );

  // Track gain uses the same dB keyboard step without seeking the timeline.
  const position = page.getByTestId("recorder-position");
  await position.click();
  await page.keyboard.press("ArrowRight");
  const initialPosition = await position.getAttribute("data-position");
  const audioGain = page.getByRole("slider", { name: "Audio 2 gain" });
  await audioGain.press("ArrowRight");
  expect(Number(await audioGain.getAttribute("aria-valuenow"))).toBeCloseTo(
    0.5,
  );
  await expect(position).toHaveAttribute("data-position", initialPosition!);

  // Open the floating mixer and inspect every recorder output channel.
  await page.getByTestId("recorder-mixer-button").click();
  const panel = page.getByTestId("recorder-mixer-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-master")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-audio-2")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-audio-1")).toBeVisible();
  await expect(panel.getByTestId("recorder-mixer-metro")).toBeVisible();

  // Set the master output to an exact decibel level.
  const masterLevel = panel.getByRole("textbox", {
    name: "Master level in dB",
  });
  await expect(masterLevel).toHaveValue("-0.5");
  await masterLevel.fill("-6");
  await masterLevel.press("Enter");
  await expect(masterLevel).toHaveValue("-6.0");

  // Mute and solo backing audio independently.
  const audio = panel.getByTestId("recorder-mixer-audio-2");
  await audio.getByRole("button", { name: "Toggle Audio 2 mute" }).click();
  await expect(
    audio.getByRole("button", { name: "Toggle Audio 2 mute" }),
  ).toHaveAttribute("aria-pressed", "true");
  await audio.getByRole("button", { name: "Toggle Audio 2 solo" }).click();
  await expect(
    audio.getByRole("button", { name: "Toggle Audio 2 solo" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Close the panel without dismissing the project.
  await panel.getByRole("button", { name: "Close Mixer" }).click();
  await expect(panel).toBeHidden();
});

test("imports ordered stems and persists independent lane heights", async ({
  page,
}) => {
  // Import the stem archive after the empty Audio 1 and preserve its defined
  // track order.
  await createRecorderProject(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("recorder-add-audio-file").click();
  await (await chooser).setFiles("e2e/fixtures/test-stems.zip");
  const rows = page.getByTestId("recorder-audio-track-row");
  await expect(rows).toHaveCount(3);
  const backing = rows.nth(1);
  const bass = rows.nth(2);
  await expect(backing).toContainText("backing.wav");
  await expect(bass).toContainText("bass.wav");
  await expect(
    backing.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  await expect(
    bass.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  const firstHeight = (await backing.boundingBox())!.height;
  const secondHeight = (await bass.boundingBox())!.height;

  // Resize each lane without changing its neighbor's height.
  await dragBy(page, page.getByTitle("Resize Audio 2", { exact: true }), 0, {
    deltaY: 30,
  });
  await expect
    .poll(async () => (await backing.boundingBox())!.height)
    .toBe(firstHeight + 30);
  expect((await bass.boundingBox())!.height).toBe(secondHeight);
  await dragBy(page, page.getByTitle("Resize Audio 3", { exact: true }), 0, {
    deltaY: 50,
  });
  await expect
    .poll(async () => (await bass.boundingBox())!.height)
    .toBe(secondHeight + 50);
  expect((await backing.boundingBox())!.height).toBe(firstHeight + 30);

  // Rename the second stem from its track menu.
  page.once("dialog", (dialog) => dialog.accept("Bass"));
  await selectMenuItem(page, { menu: "Audio 3 actions", item: "Rename…" });
  await expect(bass.getByTitle("Resize Bass", { exact: true })).toBeAttached();

  // Save and reload both stems with their order, names, waveforms, and lane sizes intact.
  await saveRecorderProject(page);
  await page.reload();
  await expect(rows).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Bass actions" }),
  ).toBeVisible();
  await expect(backing).toContainText("backing.wav");
  await expect(bass).toContainText("bass.wav");
  await expect(
    backing.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  await expect(
    bass.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
  expect((await backing.boundingBox())!.height).toBe(firstHeight + 30);
  expect((await bass.boundingBox())!.height).toBe(secondHeight + 50);
});

test("appends imported and dropped audio as clips on a track", async ({
  page,
}) => {
  await createRecorderProject(page);
  const row = page.getByTestId("recorder-audio-track-row");
  const sources = row.getByTestId("recorder-clip-audio-source");
  const regions = row.getByTestId("recorder-clip-audio");
  const takesToggle = page.getByTestId("recorder-takes-toggle");

  // Import a file into Audio 1, which places it at the start.
  const chooser = page.waitForEvent("filechooser");
  await selectMenuItem(page, {
    menu: "Audio 1 actions",
    item: "Import audio…",
  });
  await (await chooser).setFiles("e2e/fixtures/test-audio.wav");
  await expect(sources).toHaveCount(1);
  const ruler = (await page
    .getByTestId("recorder-timeline-ruler")
    .boundingBox())!;
  expect((await sources.boundingBox())!.x).toBeCloseTo(ruler.x, -1);
  await expect(takesToggle).toHaveCount(0);

  // Drop another file on the lane, which appends it at the drop position.
  const bytes = [...(await readFile("e2e/fixtures/test-tones.wav"))];
  const dataTransfer = await page.evaluateHandle((bytes) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(
      new File([new Uint8Array(bytes)], "dropped.wav", { type: "audio/wav" }),
    );
    return dataTransfer;
  }, bytes);
  await sources.first().dispatchEvent("drop", {
    dataTransfer,
    clientX: ruler.x + DEFAULT_PIXELS_PER_BEAT * 4,
  });
  await expect(sources).toHaveCount(2);
  // The newer clip wins the comp from its start onward.
  const dropped = regions.filter({ hasText: "dropped.wav" });
  expect((await dropped.boundingBox())!.x).toBeCloseTo(
    ruler.x + DEFAULT_PIXELS_PER_BEAT * 4,
    -1,
  );

  // Both clips stay on the track, so it offers its takes.
  await takesToggle.click();
  await expect(page.getByTestId("recorder-take-row")).toHaveCount(2);

  // Undo removes only the dropped clip.
  await page.keyboard.press("Control+z");
  await expect(sources).toHaveCount(1);
  await expect(regions).toHaveCount(1);
  await expect(regions).toContainText("test-audio.wav");
});
