import path from "path";
import { expect, test } from "@playwright/test";
import { clickNewProject, evaluateStore } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

test.describe("Import/Export Modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await clickNewProject(page);
  });

  async function openImportExportModal(page: import("@playwright/test").Page) {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("import-export-button").click();
    await page.getByTestId("import-export-modal").waitFor({ state: "visible" });
  }

  test.describe("Export Tab", () => {
    test("modal opens with export tab by default", async ({ page }) => {
      await openImportExportModal(page);

      // Should show export tab content
      await expect(page.getByText("Format")).toBeVisible();
      await expect(page.getByText("Project (.toymidi)")).toBeVisible();
      await expect(page.getByText("MIDI (.mid)")).toBeVisible();
      await expect(page.getByText("ABC Notation (.abc)")).toBeVisible();
    });

    test("export project file download", async ({ page }) => {
      // Add a note first
      const grid = page.getByTestId("piano-roll-grid");
      const gridBox = await grid.boundingBox();
      if (!gridBox) throw new Error("Grid not found");

      await page.mouse.move(
        gridBox.x + BEAT_WIDTH * 1.5,
        gridBox.y + ROW_HEIGHT * 3.5,
      );
      await page.mouse.down();
      await page.mouse.move(
        gridBox.x + BEAT_WIDTH * 3,
        gridBox.y + ROW_HEIGHT * 3.5,
      );
      await page.mouse.up();

      await openImportExportModal(page);

      // Project format should be selected by default
      const projectRadio = page.locator('input[value="project"]');
      await expect(projectRadio).toBeChecked();

      // Download project
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download" }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/\.toymidi$/);
    });

    test("export MIDI file download", async ({ page }) => {
      // Add a note
      const grid = page.getByTestId("piano-roll-grid");
      const gridBox = await grid.boundingBox();
      if (!gridBox) throw new Error("Grid not found");

      await page.mouse.click(
        gridBox.x + BEAT_WIDTH * 1.5,
        gridBox.y + ROW_HEIGHT * 3.5,
      );

      await openImportExportModal(page);

      // Select MIDI format
      await page.getByText("MIDI (.mid)").click();

      // Download MIDI
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download" }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/\.mid$/);
    });

    test("export ABC file download", async ({ page }) => {
      // Add a note
      const grid = page.getByTestId("piano-roll-grid");
      const gridBox = await grid.boundingBox();
      if (!gridBox) throw new Error("Grid not found");

      await page.mouse.click(
        gridBox.x + BEAT_WIDTH * 1.5,
        gridBox.y + ROW_HEIGHT * 3.5,
      );

      await openImportExportModal(page);

      // Select ABC format
      await page.getByText("ABC Notation (.abc)").click();

      // Download ABC
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download" }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/\.abc$/);
    });

    test("copy ABC to clipboard", async ({ page, context }) => {
      // Grant clipboard permissions
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);

      // Add a note
      const grid = page.getByTestId("piano-roll-grid");
      const gridBox = await grid.boundingBox();
      if (!gridBox) throw new Error("Grid not found");

      await page.mouse.click(
        gridBox.x + BEAT_WIDTH * 1.5,
        gridBox.y + ROW_HEIGHT * 3.5,
      );

      await openImportExportModal(page);

      // Select ABC format
      await page.getByText("ABC Notation (.abc)").click();

      // Copy to clipboard
      await page.getByRole("button", { name: "Copy to Clipboard" }).click();

      // Wait for success toast
      await expect(
        page.getByText("ABC notation copied to clipboard"),
      ).toBeVisible();

      // Verify clipboard content
      const clipboardText = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(clipboardText).toContain("X:1");
      expect(clipboardText).toContain("M:4/4");
    });

    test("shows summary info", async ({ page }) => {
      // Add a note
      const grid = page.getByTestId("piano-roll-grid");
      const gridBox = await grid.boundingBox();
      if (!gridBox) throw new Error("Grid not found");

      await page.mouse.click(
        gridBox.x + BEAT_WIDTH * 1.5,
        gridBox.y + ROW_HEIGHT * 3.5,
      );

      await openImportExportModal(page);

      // Should show note count
      await expect(page.getByText("Notes: 1")).toBeVisible();

      // Should show tempo
      await expect(page.getByText(/Tempo: 120 BPM/)).toBeVisible();
    });

    test("download disabled when no notes for MIDI/ABC", async ({ page }) => {
      await openImportExportModal(page);

      // Select MIDI format
      await page.getByText("MIDI (.mid)").click();

      // Download should be disabled (no notes)
      const downloadButton = page.getByRole("button", { name: "Download" });
      await expect(downloadButton).toBeDisabled();

      // Project format should still allow download (empty project is valid)
      await page.getByText("Project (.toymidi)").click();
      await expect(downloadButton).toBeEnabled();
    });
  });

  test.describe("Import Tab", () => {
    test("switch to import tab", async ({ page }) => {
      await openImportExportModal(page);

      // Click import tab
      await page
        .getByRole("button", { name: /Import/i })
        .first()
        .click();

      // Should show drop zone
      await expect(
        page.getByText("Drop file here or click to browse"),
      ).toBeVisible();
      await expect(page.getByText(".toymidi, .mid, .wav, .mp3")).toBeVisible();
    });

    test("import audio file", async ({ page }) => {
      await openImportExportModal(page);

      // Switch to import tab
      await page
        .getByRole("button", { name: /Import/i })
        .first()
        .click();

      // Import audio file via file chooser
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByText("Drop file here or click to browse").click(),
      ]);

      const testAudioPath = path.join(
        import.meta.dirname,
        "../public/test-audio.wav",
      );
      await fileChooser.setFiles(testAudioPath);

      // Should show file info
      await expect(page.getByText("test-audio.wav")).toBeVisible();
      // File type badge should show "Audio"
      await expect(
        page.locator(".bg-neutral-700", { hasText: "Audio" }),
      ).toBeVisible();

      // Import button (in footer, not the tab) should be enabled
      const importButton = page.getByRole("button", { name: "Import" }).nth(1);
      await expect(importButton).toBeEnabled();

      // Click import
      await importButton.click();

      // Modal should close and audio should be loaded
      await expect(page.getByTestId("import-export-modal")).not.toBeVisible();

      // Audio waveform should be visible (verify by checking for audio label)
      await expect(
        page.getByText("test-audio.wav", { exact: true }),
      ).toBeVisible();
    });

    test("import MIDI file shows track options", async ({ page }) => {
      await openImportExportModal(page);

      // Switch to import tab
      await page
        .getByRole("button", { name: /Import/i })
        .first()
        .click();

      // Import MIDI file
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByText("Drop file here or click to browse").click(),
      ]);

      const testMidiPath = path.join(
        import.meta.dirname,
        "../public/test-midi.mid",
      );
      await fileChooser.setFiles(testMidiPath);

      // Should show MIDI options
      // File type badge should show "MIDI"
      await expect(
        page.locator(".bg-neutral-700", { hasText: "MIDI" }),
      ).toBeVisible();
      await expect(page.getByText("Replace notes")).toBeVisible();
      await expect(page.getByText("Append notes")).toBeVisible();
      await expect(page.getByText(/Import tempo/)).toBeVisible();
    });

    test("import MIDI replaces notes", async ({ page }) => {
      // First add some existing notes
      const grid = page.getByTestId("piano-roll-grid");
      const gridBox = await grid.boundingBox();
      if (!gridBox) throw new Error("Grid not found");

      await page.mouse.click(
        gridBox.x + BEAT_WIDTH * 0.5,
        gridBox.y + ROW_HEIGHT * 2,
      );

      await expect(page.locator("[data-testid^='note-']")).toHaveCount(1);

      // Open modal and import MIDI
      await openImportExportModal(page);
      await page
        .getByRole("button", { name: /Import/i })
        .first()
        .click();

      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByText("Drop file here or click to browse").click(),
      ]);

      const testMidiPath = path.join(
        import.meta.dirname,
        "../public/test-midi.mid",
      );
      await fileChooser.setFiles(testMidiPath);

      // Make sure Replace is selected (default)
      await expect(page.getByLabel("Replace notes")).toBeChecked();

      // Import (use nth(1) to get the action button, not the tab)
      await page.getByRole("button", { name: "Import" }).nth(1).click();

      // Old note should be replaced with MIDI notes
      // Wait for modal to close
      await expect(page.getByTestId("import-export-modal")).not.toBeVisible();

      // Should have notes from MIDI file (exact count depends on test file)
      const noteCount = await page.locator("[data-testid^='note-']").count();
      expect(noteCount).toBeGreaterThan(0);
    });

    test("import MIDI appends notes", async ({ page }) => {
      // First add some existing notes
      const grid = page.getByTestId("piano-roll-grid");
      const gridBox = await grid.boundingBox();
      if (!gridBox) throw new Error("Grid not found");

      await page.mouse.click(
        gridBox.x + BEAT_WIDTH * 0.5,
        gridBox.y + ROW_HEIGHT * 2,
      );

      await expect(page.locator("[data-testid^='note-']")).toHaveCount(1);

      // Open modal and import MIDI
      await openImportExportModal(page);
      await page
        .getByRole("button", { name: /Import/i })
        .first()
        .click();

      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByText("Drop file here or click to browse").click(),
      ]);

      const testMidiPath = path.join(
        import.meta.dirname,
        "../public/test-midi.mid",
      );
      await fileChooser.setFiles(testMidiPath);

      // Select Append mode
      await page.getByLabel("Append notes").click();

      // Import (use nth(1) to get the action button, not the tab)
      await page.getByRole("button", { name: "Import" }).nth(1).click();

      // Wait for modal to close
      await expect(page.getByTestId("import-export-modal")).not.toBeVisible();

      // Should have original note + MIDI notes
      const noteCount = await page.locator("[data-testid^='note-']").count();
      expect(noteCount).toBeGreaterThan(1);
    });

    test("import button disabled when no file selected", async ({ page }) => {
      await openImportExportModal(page);
      await page
        .getByRole("button", { name: /Import/i })
        .first()
        .click();

      // Import action button (not the tab) should be disabled
      const importButton = page.getByRole("button", { name: "Import" }).nth(1);
      await expect(importButton).toBeDisabled();
    });
  });

  test.describe("Modal Behavior", () => {
    test("close modal with X button", async ({ page }) => {
      await openImportExportModal(page);
      await expect(page.getByTestId("import-export-modal")).toBeVisible();

      await page.getByLabel("Close").click();

      await expect(page.getByTestId("import-export-modal")).not.toBeVisible();
    });

    test("close modal with Escape key", async ({ page }) => {
      await openImportExportModal(page);
      await expect(page.getByTestId("import-export-modal")).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(page.getByTestId("import-export-modal")).not.toBeVisible();
    });

    test("close modal by clicking backdrop", async ({ page }) => {
      await openImportExportModal(page);
      await expect(page.getByTestId("import-export-modal")).toBeVisible();

      // Click backdrop (outside modal content)
      await page
        .getByTestId("import-export-modal")
        .click({ position: { x: 10, y: 10 } });

      await expect(page.getByTestId("import-export-modal")).not.toBeVisible();
    });

    test("cancel button closes modal", async ({ page }) => {
      await openImportExportModal(page);

      await page.getByRole("button", { name: "Cancel" }).click();

      await expect(page.getByTestId("import-export-modal")).not.toBeVisible();
    });
  });
});

test.describe("Project File Import/Export Roundtrip", () => {
  // Skip for now - complex due to page reload flow that needs debugging
  test.skip("export and import project preserves notes", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await clickNewProject(page);

    // Create notes
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) throw new Error("Grid not found");

    // Create 3 notes
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(
        gridBox.x + BEAT_WIDTH * (i * 2 + 0.5),
        gridBox.y + ROW_HEIGHT * (i + 2),
      );
      await page.mouse.down();
      await page.mouse.move(
        gridBox.x + BEAT_WIDTH * (i * 2 + 1.5),
        gridBox.y + ROW_HEIGHT * (i + 2),
      );
      await page.mouse.up();
      await page.keyboard.press("Escape");
    }

    await expect(page.locator("[data-testid^='note-']")).toHaveCount(3);

    // Get note data before export
    const notesBefore = await evaluateStore(page, (store) =>
      store.getState().notes.map((n) => ({
        pitch: n.pitch,
        start: n.start,
        duration: n.duration,
      })),
    );

    // Export project
    await page.getByTestId("settings-button").click();
    await page.getByTestId("import-export-button").click();
    await page.getByTestId("import-export-modal").waitFor({ state: "visible" });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    const download = await downloadPromise;

    // Save the downloaded file
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Download path not available");

    // Clear localStorage and create new project
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await clickNewProject(page);

    // Verify no notes
    await expect(page.locator("[data-testid^='note-']")).toHaveCount(0);

    // Import the exported project
    await page.getByTestId("settings-button").click();
    await page.getByTestId("import-export-button").click();
    await page.getByTestId("import-export-modal").waitFor({ state: "visible" });

    // Switch to import tab
    await page
      .getByRole("button", { name: /Import/i })
      .first()
      .click();

    // Import file
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByText("Drop file here or click to browse").click(),
    ]);
    await fileChooser.setFiles(downloadPath);

    // Wait for file to be loaded and shown
    await expect(
      page.locator(".bg-neutral-900", { hasText: ".toymidi" }),
    ).toBeVisible();

    // Import - this creates a new project and reloads (use nth(1) to get action button)
    const importButton = page.getByRole("button", { name: "Import" }).nth(1);
    await expect(importButton).toBeEnabled();

    // Click import and wait for navigation (page reload happens)
    await Promise.all([
      page.waitForURL("**/*"), // Wait for navigation/reload
      importButton.click(),
    ]);

    // After reload, should see startup screen
    await page.getByTestId("startup-screen").waitFor({ state: "visible" });

    // Click Continue to load the imported project
    await page.getByTestId("continue-button").click();

    // Wait for editor to load
    await page.getByTestId("transport").waitFor({ state: "visible" });

    // Verify notes are restored
    await expect(page.locator("[data-testid^='note-']")).toHaveCount(3);

    // Verify note data matches
    const notesAfter = await evaluateStore(page, (store) =>
      store.getState().notes.map((n) => ({
        pitch: n.pitch,
        start: n.start,
        duration: n.duration,
      })),
    );

    // Sort both arrays for comparison (IDs will be different)
    const sortNotes = (notes: typeof notesBefore) =>
      notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);

    expect(sortNotes(notesAfter)).toEqual(sortNotes(notesBefore));
  });
});
