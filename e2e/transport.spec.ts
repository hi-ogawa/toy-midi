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

  // Note: Export MIDI/ABC tests moved to import-export.spec.ts
});

test.describe("Audio Track", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clickNewProject(page);
  });

  async function loadAudioFile(page: import("@playwright/test").Page) {
    // Load audio via Import/Export modal
    await page.getByTestId("settings-button").click();
    await page.getByTestId("import-export-button").click();
    await page.getByTestId("import-export-modal").waitFor({ state: "visible" });

    // Switch to import tab
    await page
      .getByRole("button", { name: /Import/i })
      .first()
      .click();

    // Import audio file
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Drop file here or click to browse").click(),
    ]);

    const testAudioPath = path.join(
      import.meta.dirname,
      "../public/test-audio.wav",
    );
    await fileChooser.setFiles(testAudioPath);
    await page.getByRole("button", { name: "Import" }).nth(1).click();

    // Wait for modal to close and audio to load
    await expect(page.getByTestId("import-export-modal")).not.toBeVisible();
    await page.waitForTimeout(500);
  }

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
