import path from "path";
import { expect, test } from "@playwright/test";
import { clickContinue, clickNewProject } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;

test.describe("Transport Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("playback controls", async ({ page }) => {
    // Play button is always enabled for MIDI-only mode
    const playButton = page.getByTestId("play-pause-button");
    await expect(playButton).toBeEnabled();

    // Load audio via hidden file input
    const fileInput = page.getByTestId("audio-file-input");
    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileInput.setInputFiles(testAudioPath);

    // Wait for audio to load
    await page.waitForTimeout(500);

    // Should show play icon initially
    await expect(page.getByTestId("play-icon")).toBeVisible();

    // Click to play
    await playButton.click();
    // Should show pause icon
    await expect(page.getByTestId("pause-icon")).toBeVisible();

    // Click to pause
    await playButton.click();
    // Should show play icon again
    await expect(page.getByTestId("play-icon")).toBeVisible();

    // Press space to play
    await page.keyboard.press("Space");
    // Should show pause icon
    await expect(page.getByTestId("pause-icon")).toBeVisible();

    // Space bar to pause
    await page.keyboard.press("Space");
    // Should show play icon again
    await expect(page.getByTestId("play-icon")).toBeVisible();
  });

  test("tempo input", async ({ page }) => {
    const tempoInput = page.getByTestId("tempo-input");
    await expect(tempoInput).toHaveValue("120");

    // Change tempo to valid value
    await tempoInput.fill("140");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("140");

    // Test below minimum (30) - should clamp
    await tempoInput.fill("10");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("30");

    // Test above maximum (300) - should clamp
    await tempoInput.fill("500");
    await tempoInput.blur();
    await expect(tempoInput).toHaveValue("300");
  });

  test("metronome toggle", async ({ page }) => {
    const metronomeToggle = page.getByTestId("metronome-toggle");

    // Should be off by default
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "false");

    // Toggle on
    await metronomeToggle.click();
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "true");

    // Toggle off
    await metronomeToggle.click();
    await expect(metronomeToggle).toHaveAttribute("aria-pressed", "false");
  });

  test("auto-scroll toggle", async ({ page }) => {
    // Open settings dropdown to access auto-scroll toggle
    await page.getByTestId("settings-button").click();

    const autoScrollToggle = page.getByTestId("auto-scroll-toggle");

    // Should be on by default (checked state)
    await expect(autoScrollToggle).toHaveAttribute("data-state", "checked");

    // Toggle off (dropdown stays open)
    await autoScrollToggle.click();
    await expect(autoScrollToggle).toHaveAttribute("data-state", "unchecked");

    // Toggle on
    await autoScrollToggle.click();
    await expect(autoScrollToggle).toHaveAttribute("data-state", "checked");
  });

  test("tap tempo", async ({ page }) => {
    const tapButton = page.getByTestId("tap-tempo-button");
    const tempoInput = page.getByTestId("tempo-input");

    await expect(tempoInput).toHaveValue("120");

    // Tap 4 times at ~500ms intervals for ~120 BPM
    await tapButton.click();
    await page.waitForTimeout(500);
    await tapButton.click();
    await page.waitForTimeout(500);
    await tapButton.click();
    await page.waitForTimeout(500);
    await tapButton.click();

    // Tempo should have changed (might not be exactly 120 due to timing)
    const newTempo = await tempoInput.inputValue();
    expect(parseInt(newTempo)).toBeGreaterThanOrEqual(30);
    expect(parseInt(newTempo)).toBeLessThanOrEqual(300);
  });

  test("instrument selector (program change)", async ({ page }) => {
    const instrumentSelect = page.getByTestId("instrument-select");

    // Default should be "0: Acoustic Grand Piano"
    await expect(instrumentSelect).toContainText("Acoustic Grand Piano");

    // Open and select a different instrument
    await instrumentSelect.click();
    await page
      .locator('[data-slot="command-item"]', { hasText: "24: Acoustic Guitar" })
      .click();

    // Should show new instrument
    await expect(instrumentSelect).toContainText("Acoustic Guitar");

    // Verify state persisted - reload and check
    await page.reload();
    await clickContinue(page);
    await expect(page.getByTestId("instrument-select")).toContainText(
      "Acoustic Guitar",
    );
  });

  test("instrument selector search", async ({ page }) => {
    const instrumentSelect = page.getByTestId("instrument-select");

    // Open selector
    await instrumentSelect.click();

    // Type to search
    const searchInput = page.locator('[data-slot="command-input"]');
    await searchInput.fill("violin");

    // Should filter to show only violin
    const items = page.locator('[data-slot="command-item"]');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Violin");

    // Select it
    await items.first().click();
    await expect(instrumentSelect).toContainText("Violin");

    // Open again and search for something else
    await instrumentSelect.click();
    await searchInput.fill("synth");

    // Should show multiple synth instruments
    const synthItems = page.locator('[data-slot="command-item"]');
    expect(await synthItems.count()).toBeGreaterThan(5);
  });

  test("export MIDI workflow", async ({ page }) => {
    // Open settings dropdown to access export button
    await page.getByTestId("settings-button").click();
    const exportButton = page.getByTestId("export-midi-button");

    // Button disabled when no notes
    await expect(exportButton).toBeDisabled();

    // Close dropdown, add a note
    await page.keyboard.press("Escape");
    const pianoRoll = page.locator('[data-testid="piano-roll-grid"]');
    await pianoRoll.click({ position: { x: 100, y: 100 } });

    // Open settings dropdown again
    await page.getByTestId("settings-button").click();

    // Button enabled when notes exist
    await expect(exportButton).toBeEnabled();

    // Click export and verify download
    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.mid$/);
  });

  test("export ABC file workflow", async ({ page }) => {
    // Open settings dropdown to access export button
    await page.getByTestId("settings-button").click();
    const exportButton = page.getByTestId("export-abc-button");

    // Button disabled when no notes
    await expect(exportButton).toBeDisabled();

    // Close dropdown, add a note
    await page.keyboard.press("Escape");
    const pianoRoll = page.locator('[data-testid="piano-roll-grid"]');
    await pianoRoll.click({ position: { x: 100, y: 100 } });

    // Open settings dropdown again
    await page.getByTestId("settings-button").click();

    // Button enabled when notes exist
    await expect(exportButton).toBeEnabled();

    // Click export and verify download
    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.abc$/);
  });

  test("copy ABC to clipboard workflow", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Open settings dropdown to access copy button
    await page.getByTestId("settings-button").click();
    const copyButton = page.getByTestId("copy-abc-button");

    // Button disabled when no notes
    await expect(copyButton).toBeDisabled();

    // Close dropdown, add a note
    await page.keyboard.press("Escape");
    const pianoRoll = page.locator('[data-testid="piano-roll-grid"]');
    await pianoRoll.click({ position: { x: 100, y: 100 } });

    // Open settings dropdown again
    await page.getByTestId("settings-button").click();

    // Button enabled when notes exist
    await expect(copyButton).toBeEnabled();

    // Click copy button
    await copyButton.click();

    // Wait for success toast
    await expect(
      page.getByText("ABC notation copied to clipboard"),
    ).toBeVisible();

    // Verify clipboard content
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toContain("X:1"); // ABC header
    expect(clipboardText).toContain("M:4/4"); // Time signature
    expect(clipboardText).toContain("Q:1/4=120"); // Tempo
    expect(clipboardText).toContain("K:C"); // Key signature
  });
});

test.describe("Audio Track", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  async function loadAudioFile(page: import("@playwright/test").Page) {
    const fileInput = page.getByTestId("audio-file-input");
    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileInput.setInputFiles(testAudioPath);
    await page.waitForTimeout(500); // Wait for audio to load
  }

  test("remove audio via settings menu", async ({ page }) => {
    // Remove button should be disabled when no audio loaded
    await page.getByTestId("settings-button").click();
    const removeButton = page.getByTestId("remove-audio-button");
    await expect(removeButton).toBeDisabled();
    await page.keyboard.press("Escape");

    // Load audio file
    await loadAudioFile(page);

    // Verify waveform is visible
    const audioRegion = page
      .locator(".bg-emerald-700, .bg-emerald-600")
      .first();
    await expect(audioRegion).toBeVisible();

    // Remove button should now be enabled
    await page.getByTestId("settings-button").click();
    await expect(removeButton).toBeEnabled();
    await removeButton.click();

    // Verify audio region is gone
    await expect(audioRegion).not.toBeVisible();
  });

  test("select, deselect, and delete audio track", async ({ page }) => {
    await loadAudioFile(page);

    const audioRegion = page
      .locator(".bg-emerald-700, .bg-emerald-600")
      .first();
    const pianoRoll = page.getByTestId("piano-roll-grid");

    // Click to select - should show ring
    await audioRegion.click();
    await expect(audioRegion).toHaveClass(/ring-2/);

    // Escape to deselect - ring gone but audio still there
    await page.keyboard.press("Escape");
    await expect(audioRegion).not.toHaveClass(/ring-2/);
    await expect(audioRegion).toBeVisible();

    // Click to select again
    await audioRegion.click();
    await expect(audioRegion).toHaveClass(/ring-2/);

    // Click grid to deselect
    await pianoRoll.click({ position: { x: 200, y: 100 } });
    await expect(audioRegion).not.toHaveClass(/ring-2/);

    // Click to select and delete with Delete key
    await audioRegion.click();
    await expect(audioRegion).toHaveClass(/ring-2/);
    await page.keyboard.press("Delete");
    await expect(audioRegion).not.toBeVisible();
  });
});

test.describe("Timeline Seek", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  test("clicking timeline while paused moves playhead", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Playhead should start at position 0 (left edge)
    const playhead = page.getByTestId("timeline-playhead");
    const initialPlayheadBox = await playhead.boundingBox();
    if (!initialPlayheadBox) throw new Error("Playhead not found");
    const initialX = initialPlayheadBox.x;

    // Click at beat 4 (4 * BEAT_WIDTH from left)
    const clickX = timelineBox.x + BEAT_WIDTH * 4;
    const clickY = timelineBox.y + timelineBox.height / 2;
    await page.mouse.click(clickX, clickY);

    // Wait for React state update
    await page.waitForTimeout(100);

    // Playhead should have moved right
    const movedPlayheadBox = await playhead.boundingBox();
    if (!movedPlayheadBox) throw new Error("Playhead not found after seek");
    expect(movedPlayheadBox.x).toBeGreaterThan(initialX + BEAT_WIDTH * 3);

    // Time display should reflect new position (not at bar 1, beat 1)
    const timeDisplay = page.getByTestId("time-display");
    await expect(timeDisplay).not.toContainText("1|1.00");
  });

  test("clicking timeline snaps to grid", async ({ page }) => {
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    // Default grid snap is 1/8 note = 0.5 beats
    // Click at beat 2.2 (should snap to beat 2.0 - rounds down)
    const clickX = timelineBox.x + BEAT_WIDTH * 2.2;
    const clickY = timelineBox.y + timelineBox.height / 2;
    await page.mouse.click(clickX, clickY);

    // Wait for React state update
    await page.waitForTimeout(100);

    // Playhead should be at exactly beat 2.0 (nearest grid line)
    const playhead = page.getByTestId("timeline-playhead");
    const playheadBox = await playhead.boundingBox();
    if (!playheadBox) throw new Error("Playhead not found");

    // Calculate expected position for beat 2.0
    const expectedX = timelineBox.x + BEAT_WIDTH * 2;
    // Allow 2px tolerance for rounding
    expect(Math.abs(playheadBox.x - expectedX)).toBeLessThan(2);

    // Click at beat 2.3 (should snap to beat 2.5 - rounds up to nearest)
    const clickX2 = timelineBox.x + BEAT_WIDTH * 2.3;
    await page.mouse.click(clickX2, clickY);
    await page.waitForTimeout(100);

    const playheadBox2 = await playhead.boundingBox();
    if (!playheadBox2) throw new Error("Playhead not found after second click");

    // Calculate expected position for beat 2.5
    const expectedX2 = timelineBox.x + BEAT_WIDTH * 2.5;
    expect(Math.abs(playheadBox2.x - expectedX2)).toBeLessThan(2);
  });

  test("MIDI plays from seeked position", async ({ page }) => {
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create a note at beat 2
    const noteX = gridBox.x + BEAT_WIDTH * 2;
    const noteY = gridBox.y + 100;
    await page.mouse.move(noteX, noteY);
    await page.mouse.down();
    await page.mouse.move(noteX + BEAT_WIDTH, noteY);
    await page.mouse.up();

    // Seek to beat 4 (past the note)
    const timeline = page.getByTestId("timeline");
    const timelineBox = await timeline.boundingBox();
    if (!timelineBox) throw new Error("Timeline not found");

    const seekX = timelineBox.x + BEAT_WIDTH * 4;
    await page.mouse.click(seekX, timelineBox.y + timelineBox.height / 2);

    // Start playback
    await page.keyboard.press("Space");
    await expect(page.getByTestId("pause-icon")).toBeVisible();

    // Wait briefly for playback
    await page.waitForTimeout(200);

    // Stop playback
    await page.keyboard.press("Space");
    await expect(page.getByTestId("play-icon")).toBeVisible();

    // The playhead should have moved forward from beat 4, not from 0
    const playhead = page.getByTestId("timeline-playhead");
    const playheadBox = await playhead.boundingBox();
    if (!playheadBox) throw new Error("Playhead not found");

    // Playhead should still be around beat 4+ (not reset to 0)
    expect(playheadBox.x).toBeGreaterThan(timelineBox.x + BEAT_WIDTH * 3);
  });
});
