import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { SavedProject, SavedProjectV1 } from "../src/lib/project-store";
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

for (const format of ["v2", "v1", "layout-v1"] as const) {
  test(`manually migrates a stored ${format} project and retains the original`, async ({
    page,
  }) => {
    // Seed a legacy project with audio without opening the old editor.
    await page.goto("/__e2e__/");
    const audio = new Uint8Array(
      await readFile(new URL("./fixtures/test-audio.wav", import.meta.url)),
    );
    await page.evaluate(
      async ({ project, audio, format }) => {
        if (format === "v2") {
          await window.__e2e.seedProjectLegacyV2({
            name: "Legacy song",
            project,
            audioData: { backing: audio },
          });
        } else if (format === "v1") {
          const { audioTracks, ...settings } = project;
          const track = audioTracks[0];
          const legacy: SavedProjectV1 = {
            ...settings,
            version: 1,
            audioFileName: track.fileName,
            audioAssetKey: "",
            audioDuration: track.duration,
            audioOffset: track.offset,
            audioVolume: track.volume,
            audioMuted: track.muted,
          };
          await window.__e2e.seedProjectV1("Legacy song", legacy, audio);
        } else {
          const assetKey = await window.__e2e.projectStorage.saveAsset(
            new File([audio], "legacy-audio.wav", { type: "audio/wav" }),
          );
          window.__e2e.seedLayoutV1Project("Legacy song", {
            ...project,
            audioTracks: project.audioTracks.map((track) => ({
              ...track,
              assetKey,
            })),
          });
        }
      },
      { project: LEGACY_PROJECT, audio, format },
    );

    // Migrate the stored project from the project home into a new recorder copy.
    await page.goto("/");
    await page.getByRole("button", { name: "View legacy projects" }).click();
    const legacyProjects = page.getByRole("region", {
      name: "Legacy projects",
    });
    await expect(legacyProjects).toContainText("Legacy song");
    await legacyProjects
      .getByRole("button", { name: "Migrate to new editor" })
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

    // Return home and find both the recorder copy and the original legacy project.
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Legacy song" }),
    ).toHaveAttribute("href", new URL(copyUrl).pathname);
    await page.getByRole("button", { name: "View legacy projects" }).click();
    await expect(legacyProjects).toContainText("Legacy song");

    // Cancel deletion and keep the original available for migration.
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
}
