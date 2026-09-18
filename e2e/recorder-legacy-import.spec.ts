import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "../src/lib/recorder/persistence";
import { getRecorderMidiNote, getRecorderPosition } from "./recorder-helpers";

for (const version of [1, 2] as const) {
  test(`imports a legacy v${version} archive into the recorder`, async ({
    page,
  }) => {
    // Import a fixed legacy archive directly, without opening the old editor.
    const archive = await createLegacyArchive(version);
    await page.goto("/");
    await page.getByRole("tab", { name: "Recorder", exact: true }).click();
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

    // Export the reloaded copy to verify persisted musical settings and decoded samples.
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByTestId("recorder-export-project").click();
    const download = await downloading;
    const filePath = test.info().outputPath("converted.toymidi.zip");
    await download.saveAs(filePath);
    const zip = await JSZip.loadAsync(await readFile(filePath));
    const content: SerializedRecorderRuntimeState<string> = JSON.parse(
      await zip.file("project.json")!.async("text"),
    );
    expect(content).toMatchObject({
      title: `Legacy v${version}`,
      tempo: 98,
      timeSignature: { numerator: 3, denominator: 4 },
      masterGain: 0.75,
      metronomeGain: 0.25,
      locators: [{ id: "verse", beat: 4, label: "Verse" }],
      midiTracks: [
        {
          notes: LEGACY_MUSICAL_DATA.notes,
          program: 24,
          gain: 0.4,
          muted: false,
          soloed: false,
          tabAnnotationEnabled: true,
          tabOpenStringPitches: [43, 38, 33, 28],
          keySignature: { fifths: -1, mode: "major" },
        },
      ],
      audioTracks: [
        {
          gain: 0.65,
          muted: false,
          soloed: version === 2,
          timelineOffset: 0.5,
          clip: { name: "legacy-audio.wav", pcm: { sampleRate: 48000 } },
        },
      ],
    });
    expect(content.audioTracks).toHaveLength(1);
    expect(content.midiTracks).toHaveLength(1);
    const track = content.audioTracks[0];
    const channels = track.clip!.pcm.channels;
    expect(channels).toHaveLength(1);
    const samples = new Float32Array(
      await zip.file(channels[0])!.async("arraybuffer"),
    );
    expect(samples.length).toBe(3 * 48000);
    expect(samples.some((sample) => Math.abs(sample) > 0.01)).toBe(true);
    expect(track.trimStart).toBe(0);
    expect(track.trimEnd).toBe(3);
  });
}

// Keep the historical file layout independent of application serializers and stores.
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
};

async function createLegacyArchive(version: 1 | 2) {
  const zip = new JSZip();
  const audioPath = "audio/legacy-audio.wav";
  zip.file(
    "manifest.json",
    JSON.stringify({
      formatVersion: version,
      name: `Legacy v${version}`,
      exportedAt: "2025-01-01T00:00:00.000Z",
      files: {
        project: "project.json",
        audio:
          version === 1 ? audioPath : [{ trackId: "backing", path: audioPath }],
      },
    }),
  );
  zip.file(
    "project.json",
    JSON.stringify({
      ...LEGACY_MUSICAL_DATA,
      version,
      ...(version === 1
        ? {
            audioFileName: "legacy-audio.wav",
            audioAssetKey: null,
            audioDuration: 3,
            audioOffset: 0.5,
            audioVolume: 0.65,
            audioMuted: false,
          }
        : {
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
          }),
    }),
  );
  zip.file(
    audioPath,
    await readFile(new URL("./fixtures/test-audio.wav", import.meta.url)),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}
