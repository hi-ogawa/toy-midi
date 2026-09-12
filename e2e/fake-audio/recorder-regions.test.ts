import { expect, test } from "@playwright/test";

test("publishes track regions with clip edits and rebuilds them only when needed", async ({
  page,
}) => {
  // Load audio into an empty track and observe the runtime's published state.
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const moduleUrl = "/src/lib/recorder/runtime.ts";
    const { RecorderRuntime }: typeof import("../../src/lib/recorder/runtime") =
      await import(moduleUrl);
    const runtime = new RecorderRuntime();
    await runtime.init();
    const id = runtime.addAudioTrack();
    const track = () =>
      runtime.store.get().audioTracks.find((track) => track.id === id)!;
    const empty = track().regions.length;
    const inconsistent: string[] = [];
    const unsubscribe = runtime.store.subscribe(() => {
      const current = track();
      for (const region of current.regions) {
        if (
          !current.clips.includes(region.clip) ||
          region.timelineStart !==
            region.clip.timelineOffset + region.clip.trimStart ||
          region.timelineEnd !==
            region.clip.timelineOffset + region.clip.trimEnd
        ) {
          inconsistent.push("clip and region changed separately");
        }
      }
    });
    const buffer = await (
      await fetch("/e2e/fixtures/test-audio.wav")
    ).arrayBuffer();
    await runtime.setAudioTrack(id, new File([buffer], "import.wav"));
    const original = track().regions;

    // Keep the resolved snapshot when changing mixer settings or the playhead.
    runtime.setAudioTrackMix(id, { gain: 0.5, muted: true });
    runtime.seek(1);
    const retained = track().regions === original;

    // Move and trim the clip, then replace it while keeping its timeline position.
    runtime.moveClips([{ type: "audio", id, timelineOffset: 2 }]);
    const moved = track().regions[0]!.timelineStart;
    runtime.trimClip({ type: "audio", id, edge: "start", value: 0.1 });
    const trimmed = track().regions[0]!.timelineStart;
    await runtime.setAudioTrack(id, new File([buffer], "replacement.wav"));
    const replaced = {
      name: track().regions[0]!.clip.name,
      start: track().regions[0]!.timelineStart,
    };

    // Save only source clips and rebuild matching region references when loading.
    const saved = runtime.serializeProject();
    const persistedRegions = saved.audioTracks.some(
      (track) => "regions" in track,
    );
    const beforeLoad = track().regions;
    runtime.deserializeProject(saved);
    const loaded = {
      rebuilt: track().regions !== beforeLoad,
      start: track().regions[0]!.timelineStart,
      sameClip: track().regions[0]!.clip === track().clips[0],
    };

    // Remove the clip and publish an empty comp in the same update.
    runtime.removeClips([{ type: "audio", id }]);
    const removed = {
      clips: track().clips.length,
      regions: track().regions.length,
    };
    unsubscribe();
    return {
      empty,
      inconsistent,
      retained,
      moved,
      trimmed,
      replaced,
      persistedRegions,
      loaded,
      removed,
    };
  });
  expect(result).toEqual({
    empty: 0,
    inconsistent: [],
    retained: true,
    moved: 2,
    trimmed: 2.1,
    replaced: { name: "replacement.wav", start: 2 },
    persistedRegions: false,
    loaded: { rebuilt: true, start: 2, sameClip: true },
    removed: { clips: 0, regions: 0 },
  });
});
