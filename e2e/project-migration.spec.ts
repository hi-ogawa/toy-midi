import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import type { SavedProjectV1 } from "../src/stores/project-store";
import { evaluateStore } from "./helpers";

const TEST_AUDIO_PATH = path.join(
  import.meta.dirname,
  "../public/test-audio.wav",
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
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      localStorage.clear();
      await indexedDB.deleteDatabase("toy-midi");
    });
    await page.reload();
  });

  test("migrates v1 localStorage project with audio track", async ({
    page,
  }) => {
    const audioBytes = await readFile(TEST_AUDIO_PATH);
    const assetKey = `${LEGACY_PROJECT.audioFileName}-${audioBytes.byteLength}-12345`;

    await page.evaluate(
      async ({ project, assetKey, audioBytes }) => {
        const projectId = "project-legacy";
        const now = Date.now();
        localStorage.setItem(
          "toy-midi-project-list",
          JSON.stringify([
            {
              id: projectId,
              name: "Legacy Project",
              createdAt: now,
              updatedAt: now,
            },
          ]),
        );
        localStorage.setItem("toy-midi-last-project-id", projectId);
        localStorage.setItem(
          `toy-midi-project-${projectId}`,
          JSON.stringify({ ...project, audioAssetKey: assetKey }),
        );

        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("toy-midi", 1);
          request.onupgradeneeded = () => {
            request.result.createObjectStore("assets", { keyPath: "key" });
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const blob = new Blob([new Uint8Array(audioBytes)], {
              type: "audio/wav",
            });
            const tx = request.result.transaction("assets", "readwrite");
            tx.objectStore("assets").put({
              key: assetKey,
              blob,
              name: project.audioFileName,
              size: blob.size,
              type: "audio/wav",
              addedAt: now,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      {
        project: LEGACY_PROJECT,
        assetKey,
        audioBytes: [...audioBytes],
      },
    );

    await page.reload();
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
        hasAudioViewSlot: "audioView" in track,
      }));
    });

    expect(audioTracks).toEqual([
      {
        id: "audio-1",
        fileName: LEGACY_PROJECT.audioFileName,
        assetKey,
        duration: LEGACY_PROJECT.audioDuration,
        offset: LEGACY_PROJECT.audioOffset,
        volume: LEGACY_PROJECT.audioVolume,
        muted: LEGACY_PROJECT.audioMuted,
        hasAudioViewSlot: true,
      },
    ]);
    await expect(page.getByTestId("audio-track-region")).toHaveCount(1);
  });

  test("imports v1 .toymidi project with legacy audio manifest", async ({
    page,
  }) => {
    const audioBytes = await readFile(TEST_AUDIO_PATH);
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        name: "Legacy Import",
        files: {
          project: "project.json",
          audio: "audio/legacy-audio.wav",
        },
      }),
    );
    zip.file(
      "project.json",
      JSON.stringify({
        ...LEGACY_PROJECT,
        audioAssetKey: null,
      }),
    );
    zip.file("audio/legacy-audio.wav", audioBytes);
    const projectFile = await zip.generateAsync({ type: "nodebuffer" });

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
