import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { clickNewProject, evaluateStore } from "./helpers";

// Constants matching piano-roll.tsx
const BEAT_WIDTH = 80;
const ROW_HEIGHT = 20;

test.describe("Settings Dialog - Project Export", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await clickNewProject(page);
  });

  async function openSettings(page: Page) {
    await page.getByTestId("settings-button").click();
    await page.getByTestId("settings-dialog").waitFor({ state: "visible" });
  }

  test("export .toymidi project file", async ({ page }) => {
    // Add a note first
    const grid = page.getByTestId("piano-roll-grid");
    const gridBox = await grid.boundingBox();
    if (!gridBox) {
      throw new Error("Grid not found");
    }

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

    await openSettings(page);

    // Export project
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-project-button").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.toymidi$/);
  });

  test("project export enabled even with no notes", async ({ page }) => {
    await openSettings(page);

    // Project export should be enabled (empty project is valid)
    await expect(page.getByTestId("export-project-button")).toBeEnabled();
  });

  test("export MusicXML with standard and TAB staves", async ({ page }) => {
    await evaluateStore(page, (store) => {
      // A1 (33) forced onto string 4 of BEADG tuning is fret 5, which
      // verifies that the second staff preserves explicit TAB positions.
      store.setState({
        notes: [
          {
            id: "forced-a",
            pitch: 33,
            start: 3.5,
            duration: 1,
            velocity: 100,
            tabString: 4,
          },
        ],
        tabOpenStringPitches: [43, 38, 33, 28, 23],
      });
    });
    await openSettings(page);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-musicxml-button").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.musicxml$/);

    const downloadPath = test.info().outputPath("export.musicxml");
    await download.saveAs(downloadPath);
    const xml = await readFile(downloadPath, "utf8");
    const parseError = await page.evaluate(
      (value) =>
        new DOMParser()
          .parseFromString(value, "application/xml")
          .querySelector("parsererror")?.textContent ?? null,
      xml,
    );
    expect(parseError).toBeNull();
    expect(xml).toContain("<work-title>Untitled</work-title>");
    expect(xml).toContain("<staves>2</staves>");
    expect(xml).toContain("<sign>TAB</sign>");
    expect(xml).toContain("<string>4</string>");
    expect(xml).toContain("<fret>5</fret>");
  });

  test("shows MusicXML validation errors inline", async ({ page }) => {
    await evaluateStore(page, (store) => {
      store.setState({
        notes: [
          {
            id: "off-grid",
            pitch: 33,
            start: 0.1,
            duration: 1,
            velocity: 100,
          },
        ],
      });
    });
    await openSettings(page);

    await page.getByTestId("export-musicxml-button").click();

    await expect(page.getByTestId("export-musicxml-error")).toHaveText(
      "start of note off-grid is not aligned to a supported grid",
    );
  });

  test("MIDI import confirms and replaces existing notes", async ({ page }) => {
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "existing-note",
        pitch: 61,
        start: 0,
        duration: 1,
        velocity: 100,
      });
      store.getState().setTempo(90);
      store.getState().setTimeSignature({ numerator: 3, denominator: 4 });
    });
    await openSettings(page);

    let confirmationMessage: string | undefined;
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      confirmationMessage = dialog.message();
      await dialog.accept();
    });
    await page
      .getByTestId("midi-file-input")
      .setInputFiles("e2e/fixtures/test-midi.mid");

    expect(confirmationMessage).toContain("Import MIDI file?");

    await expect(
      page.getByText(/Imported \d+ notes from MIDI file/),
    ).toBeVisible();
    const imported = await evaluateStore(page, (store) => ({
      notes: store.getState().notes,
      tempo: store.getState().tempo,
      timeSignature: store.getState().timeSignature,
    }));
    expect(imported.notes.map((note) => note.pitch)).toEqual([60, 64, 67, 60]);
    expect(imported.tempo).toBe(120);
    expect(imported.timeSignature).toEqual({ numerator: 4, denominator: 4 });
  });

  test("export and import .toymidi restores project data", async ({ page }) => {
    await evaluateStore(page, (store) => {
      store.getState().addNote({
        id: "note-1",
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      });
      store.getState().addNote({
        id: "note-2",
        pitch: 64,
        start: 1,
        duration: 0.5,
        velocity: 90,
      });
      store.getState().setTempo(123);
      store.getState().setTimeSignature({ numerator: 3, denominator: 4 });
    });

    await openSettings(page);
    const nameInput = page.locator("#settings-project-name");
    await nameInput.fill("Export Import Test");
    await nameInput.press("Enter");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-project-button").click();
    const download = await downloadPromise;
    const downloadPath = test.info().outputPath("export.toymidi");
    await download.saveAs(downloadPath);

    await page.keyboard.press("Escape");
    await page.goto("/");
    await expect(page.getByTestId("startup-screen")).toBeVisible();

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("import-project-button").click(),
    ]);
    await fileChooser.setFiles(downloadPath);

    await expect(page.getByTestId("transport")).toBeVisible();
    await expect(page).toHaveTitle("Export Import Test - Toy MIDI");

    const notes = await evaluateStore(page, (store) => store.getState().notes);
    expect(notes).toHaveLength(2);
    expect(notes[0].pitch).toBe(60);
    expect(notes[1].pitch).toBe(64);

    const tempo = await evaluateStore(page, (store) => store.getState().tempo);
    expect(tempo).toBe(123);

    const timeSignature = await evaluateStore(
      page,
      (store) => store.getState().timeSignature,
    );
    expect(timeSignature).toEqual({ numerator: 3, denominator: 4 });
  });

  test("import audio file via settings", async ({ page }) => {
    await openSettings(page);

    // Import audio file via file chooser
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("load-audio-button").click(),
    ]);

    const testAudioPath = path.join(
      import.meta.dirname,
      "fixtures/test-audio.wav",
    );
    await fileChooser.setFiles(testAudioPath);

    const waveform = page.locator(".bg-emerald-700, .bg-emerald-600").first();
    await expect(waveform).toBeVisible();
  });
});
