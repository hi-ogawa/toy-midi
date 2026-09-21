import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  exportProjectFile,
  exportProjectFileV1,
} from "../src/lib/project-file";
import type { SavedProject } from "../src/lib/project-store";
import { getRecorderMidiNote, getRecorderPosition } from "./recorder-helpers";

for (const version of [1, 2] as const) {
  test(`imports a legacy v${version} archive into the recorder`, async ({
    page,
  }) => {
    // Import a fixed legacy archive directly, without opening the old editor.
    const archive = await createLegacyArchive(version);
    await page.goto("/");
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("import-recorder-project").click();
    await (
      await chooser
    ).setFiles({
      name: `legacy-v${version}.toymidi`,
      mimeType: "application/zip",
      buffer: archive,
    });
    await expect(page).toHaveURL(/\/recorder\/[^/]+$/);
    const projectUrl = page.url();
    const row = page.getByTestId("recorder-midi-track-row");
    const note = getRecorderMidiNote(row, { beat: 1, pitch: "C4" });
    await expect(page.getByTestId("recorder-project-name")).toHaveText(
      `Legacy v${version}`,
    );
    await expect(note).toBeVisible();
    await expect(note.getByTestId("tab-annotation")).toHaveText("G17");
    await expect(
      page.getByRole("button", { name: "Verse", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("recorder-tempo-input")).toHaveValue("98");
    await expect(
      page.getByTestId("recorder-clip-audio").locator("svg"),
    ).toBeVisible();

    // Play the imported project past the backing track's offset.
    await page.getByTestId("recorder-play-button").click();
    await expect.poll(() => getRecorderPosition(page)).toBeGreaterThan(0.6);
    await page.getByTestId("recorder-play-button").click();

    // Reload the new recorder copy and retain its note annotations and waveform.
    await page.reload();
    await expect(page).toHaveURL(projectUrl);
    await expect(note.getByTestId("tab-annotation")).toHaveText("G17");
    await expect(
      page.getByTestId("recorder-clip-audio").locator("svg"),
    ).toBeVisible();
  });
}

const LEGACY_MUSICAL_DATA = {
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
  locators: [{ id: "verse", position: 4, label: "Verse" }],
  keySignature: { fifths: -1, mode: "major" },
  tabAnnotationEnabled: true,
  tabOpenStringPitches: [43, 38, 33, 28],
  midiProgram: 24,
  midiVolume: 0.4,
  midiMuted: false,
  midiSoloed: false,
  masterVolume: 0.75,
  metronomeEnabled: false,
  metronomeVolume: 0.25,
} satisfies Omit<SavedProject, "version" | "audioTracks">;

async function createLegacyArchive(version: 1 | 2) {
  const audio = await readFile(
    new URL("./fixtures/test-audio.wav", import.meta.url),
  );
  const name = `Legacy v${version}`;
  const blob =
    version === 1
      ? await exportProjectFileV1(
          name,
          {
            ...LEGACY_MUSICAL_DATA,
            version: 1,
            audioFileName: "legacy-audio.wav",
            audioAssetKey: null,
            audioDuration: 3,
            audioOffset: 0.5,
            audioVolume: 0.65,
            audioMuted: false,
          },
          audio,
        )
      : await exportProjectFile(
          name,
          {
            ...LEGACY_MUSICAL_DATA,
            version: 2,
            audioTracks: [
              {
                id: "backing",
                fileName: "legacy-audio.wav",
                assetKey: "old-asset-key",
                duration: 3,
                offset: 0.5,
                volume: 0.65,
                muted: false,
                soloed: true,
              },
            ],
          },
          { loadAsset: async () => ({ blob: audio }) },
        );
  return Buffer.from(await blob.arrayBuffer());
}
