import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { exportProjectFileV1 } from "../src/lib/project-file";
import type { SavedProjectV1 } from "../src/stores/project-store";
import { evaluateStore } from "./helpers";

const TEST_AUDIO_PATH = path.join(
  import.meta.dirname,
  "fixtures/test-audio.wav",
);

const LEGACY_PROJECT: SavedProjectV1 = {
  version: 1,
  notes: [],
  tempo: 98,
  timeSignature: { numerator: 3, denominator: 4 },
  gridSnap: "1/8",
  locators: [],
  audioFileName: "legacy-audio.wav",
  audioAssetKey: "",
  audioDuration: 1.25,
  audioOffset: 0.5,
  audioVolume: 0.65,
  audioMuted: true,
  midiVolume: 0.8,
  midiMuted: false,
  midiProgram: 0,
  metronomeEnabled: false,
  metronomeVolume: 0.5,
  autoScrollEnabled: true,
  scrollX: 0,
  scrollY: 51,
  pixelsPerBeat: 80,
  pixelsPerKey: 20,
  waveformHeight: 60,
};

test.describe("Project Migration", () => {
  test("migrates v1 localStorage project with audio track", async ({
    page,
  }) => {
    await page.goto("/__e2e__/");
    const audio = new Uint8Array(await readFile(TEST_AUDIO_PATH));
    await page.evaluate(
      async ({ project, audio }) => {
        await window.__e2e!.seedProjectV1("Legacy Project", project, audio);
      },
      { project: LEGACY_PROJECT, audio },
    );

    await page.goto("/");
    await page.getByTestId("continue-button").click();
    await page.getByTestId("transport").waitFor({ state: "visible" });

    const audioTracks = await evaluateStore(page, (store) => {
      return store.getState().audioTracks.map((track) => ({
        id: track.id,
        fileName: track.fileName,
        assetKey: track.assetKey,
        duration: track.duration,
        offset: track.offset,
        volume: track.volume,
        muted: track.muted,
      }));
    });

    expect(audioTracks).toEqual([
      {
        id: "audio-1",
        fileName: LEGACY_PROJECT.audioFileName,
        assetKey: expect.any(String),
        duration: LEGACY_PROJECT.audioDuration,
        offset: LEGACY_PROJECT.audioOffset,
        volume: LEGACY_PROJECT.audioVolume,
        muted: LEGACY_PROJECT.audioMuted,
      },
    ]);
    expect(audioTracks[0].assetKey).not.toBe("");
    await expect(page.getByTestId("audio-track-region")).toHaveCount(1);
  });

  test("imports v1 .toymidi project with legacy audio manifest", async ({
    page,
  }) => {
    await page.goto("/");

    const projectBlob = await exportProjectFileV1(
      "Legacy Import",
      LEGACY_PROJECT,
      await readFile(TEST_AUDIO_PATH),
    );
    const projectFile = Buffer.from(await projectBlob.arrayBuffer());

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("import-project-button").click(),
    ]);
    await fileChooser.setFiles({
      name: "legacy-import.toymidi",
      mimeType: "application/zip",
      buffer: projectFile,
    });

    await expect(page.getByTestId("transport")).toBeVisible();
    await expect(page).toHaveTitle("Legacy Import - Toy MIDI");

    const audioTracks = await evaluateStore(page, (store) => {
      return store.getState().audioTracks.map((track) => ({
        id: track.id,
        fileName: track.fileName,
        assetKey: track.assetKey,
        duration: track.duration,
        offset: track.offset,
        volume: track.volume,
        muted: track.muted,
      }));
    });

    expect(audioTracks).toHaveLength(1);
    expect(audioTracks[0]).toMatchObject({
      id: "audio-1",
      fileName: LEGACY_PROJECT.audioFileName,
      duration: LEGACY_PROJECT.audioDuration,
      offset: LEGACY_PROJECT.audioOffset,
      volume: LEGACY_PROJECT.audioVolume,
      muted: LEGACY_PROJECT.audioMuted,
    });
    expect(audioTracks[0].assetKey).toEqual(expect.any(String));
    expect(audioTracks[0].assetKey).not.toBe("");
    await expect(page.getByTestId("audio-track-region")).toHaveCount(1);
  });
});
