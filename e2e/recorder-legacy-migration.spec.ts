import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { SavedProject } from "../src/lib/project-store";
import { getRecorderMidiNote } from "./recorder-helpers";

const LEGACY_PROJECT: SavedProject = {
  version: 2,
  notes: [
    {
      id: "c4",
      pitch: 60,
      start: 1,
      duration: 0.5,
      velocity: 0.7,
      tabString: 1,
    },
  ],
  tempo: 98,
  timeSignature: { numerator: 3, denominator: 4 },
  gridSnap: "1/8",
  tabAnnotationEnabled: true,
  tabOpenStringPitches: [43, 38, 33, 28],
  audioTracks: [
    {
      id: "backing",
      fileName: "legacy-audio.wav",
      assetKey: "",
      duration: 3,
      offset: 0.5,
      volume: 0.65,
      muted: false,
    },
  ],
  midiVolume: 0.8,
  metronomeEnabled: false,
  metronomeVolume: 0.5,
};

test("manually migrates a stored legacy project and retains the original", async ({
  page,
}) => {
  // Seed a legacy project with audio without opening the old editor.
  await page.goto("/__e2e__/");
  const audio = new Uint8Array(
    await readFile(new URL("./fixtures/test-audio.wav", import.meta.url)),
  );
  await page.evaluate(
    async ({ project, audio }) => {
      await window.__e2e.seedProjectLegacyV2({
        name: "Legacy song",
        project,
        audioData: { backing: audio },
      });
    },
    { project: LEGACY_PROJECT, audio },
  );

  // Migrate the stored project from the Recorder tab into a new recorder copy.
  await page.goto("/");
  await page.getByRole("tab", { name: "Recorder", exact: true }).click();
  const legacyProjects = page.getByRole("region", { name: "Legacy projects" });
  await expect(legacyProjects).toContainText("Legacy song");
  await legacyProjects
    .getByRole("button", { name: "Migrate to recorder" })
    .click();
  await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
  const copyUrl = page.url();
  await expect(page.getByTestId("recorder-project-name")).toHaveText(
    "Legacy song",
  );
  const note = getRecorderMidiNote(
    page.getByTestId("recorder-midi-track-row"),
    { beat: 1, pitch: "C4" },
  );
  await expect(note.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(page.getByTestId("recorder-tempo-input")).toHaveValue("98");
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();

  // Reload the copy and retain the migrated notes and decoded waveform.
  await page.reload();
  await expect(note.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();

  // Return home and find both the recorder copy and the original MIDI project.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Legacy song" })).toHaveAttribute(
    "href",
    new URL(copyUrl).pathname,
  );
  await expect(legacyProjects).toContainText("Legacy song");
  await page.getByRole("tab", { name: "MIDI", exact: true }).click();
  await expect(page.getByRole("link", { name: "Legacy song" })).toHaveAttribute(
    "href",
    /\/project\//,
  );

  // Cancel deletion and keep the original available for migration.
  await page.getByRole("tab", { name: "Recorder", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await legacyProjects
    .getByRole("button", { name: "Delete legacy project" })
    .click();
  await expect(legacyProjects).toContainText("Legacy song");

  // Delete the original explicitly and retain the recorder copy after reload.
  page.once("dialog", (dialog) => dialog.accept());
  await legacyProjects
    .getByRole("button", { name: "Delete legacy project" })
    .click();
  await expect(legacyProjects).toHaveCount(0);
  await page.reload();
  await expect(legacyProjects).toHaveCount(0);
  await page.getByRole("link", { name: "Legacy song" }).click();
  await expect(page).toHaveURL(copyUrl);
  await expect(note.getByTestId("tab-annotation")).toHaveText("G17");
  await expect(
    page.getByTestId("recorder-clip-audio").locator("svg"),
  ).toBeVisible();
});
