import { beforeEach, describe, expect, test } from "vitest";
import {
  fromSavedProject,
  toSavedProject,
  useProjectStore,
} from "./project-store";

describe("project-store audio track migration", () => {
  beforeEach(() => {
    useProjectStore.setState(fromSavedProject({ version: 1 }));
  });

  test("migrates legacy singleton audio fields to audioTracks", () => {
    const state = fromSavedProject({
      version: 1,
      audioFileName: "stem.wav",
      audioAssetKey: "asset-1",
      audioDuration: 12.5,
      audioOffset: 1.25,
      audioVolume: 0.6,
      audioMuted: true,
    });

    expect(state.audioTracks).toHaveLength(1);
    expect(state.audioTracks?.[0]).toMatchObject({
      fileName: "stem.wav",
      assetKey: "asset-1",
      duration: 12.5,
      offset: 1.25,
      volume: 0.6,
      muted: true,
      audioView: null,
    });
    expect(state.selectedAudioTrackId).toBeNull();
  });

  test("serializes audioTracks without transient audioView", () => {
    const store = useProjectStore.getState();
    store.addAudioTrack({
      id: "audio-track-1",
      fileName: "stem.wav",
      assetKey: "asset-1",
      duration: 8,
      offset: 0.5,
      volume: 0.9,
      muted: false,
    });
    store.setAudioView("audio-track-1", {
      data: [1],
      samplesPerPoint: 1,
      sampleRate: 1,
    });

    const saved = toSavedProject(useProjectStore.getState());

    expect(saved.audioTracks).toEqual([
      {
        id: "audio-track-1",
        fileName: "stem.wav",
        assetKey: "asset-1",
        duration: 8,
        offset: 0.5,
        volume: 0.9,
        muted: false,
      },
    ]);
  });

  test("audio track actions are id-based and keep phase-1 single-track limit", () => {
    const store = useProjectStore.getState();
    store.addAudioTrack({
      id: "audio-track-1",
      fileName: "a.wav",
      assetKey: "a",
      duration: 10,
      offset: 0,
      volume: 0.8,
      muted: false,
    });
    store.addAudioTrack({
      id: "audio-track-2",
      fileName: "b.wav",
      assetKey: "b",
      duration: 11,
      offset: 0,
      volume: 0.8,
      muted: false,
    });

    let state = useProjectStore.getState();
    expect(state.audioTracks).toHaveLength(1);

    store.updateAudioTrack("audio-track-1", { muted: true, volume: 0.4 });
    store.selectAudioTrack("audio-track-1");
    state = useProjectStore.getState();
    expect(state.audioTracks[0]).toMatchObject({ muted: true, volume: 0.4 });
    expect(state.selectedAudioTrackId).toBe("audio-track-1");

    store.deleteAudioTrack("audio-track-1");
    state = useProjectStore.getState();
    expect(state.audioTracks).toHaveLength(0);
    expect(state.selectedAudioTrackId).toBeNull();
  });
});
