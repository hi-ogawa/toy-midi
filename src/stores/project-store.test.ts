import { describe, expect, it } from "vitest";
import {
  fromSavedProject,
  migrateSavedAudioTracks,
  type SavedProject,
  toSavedProject,
  useProjectStore,
} from "./project-store";

describe("migrateSavedAudioTracks", () => {
  it("passes through an existing audioTracks array", () => {
    const tracks = [
      {
        id: "audio-1",
        fileName: "a.wav",
        assetKey: "k1",
        duration: 10,
        offset: 0,
        volume: 0.8,
        muted: false,
      },
      {
        id: "audio-2",
        fileName: "b.wav",
        assetKey: "k2",
        duration: 12,
        offset: 1,
        volume: 0.5,
        muted: true,
      },
    ];
    expect(migrateSavedAudioTracks({ audioTracks: tracks })).toEqual(tracks);
  });

  it("migrates legacy singleton audio fields into a one-element array", () => {
    const result = migrateSavedAudioTracks({
      audioFileName: "song.mp3",
      audioAssetKey: "asset-123",
      audioDuration: 42,
      audioOffset: 2.5,
      audioVolume: 0.6,
      audioMuted: true,
    });
    expect(result).toEqual([
      {
        id: "audio-1",
        fileName: "song.mp3",
        assetKey: "asset-123",
        duration: 42,
        offset: 2.5,
        volume: 0.6,
        muted: true,
      },
    ]);
  });

  it("returns an empty array when there is no audio", () => {
    expect(migrateSavedAudioTracks({})).toEqual([]);
    expect(migrateSavedAudioTracks({ audioFileName: null })).toEqual([]);
  });
});

describe("fromSavedProject", () => {
  it("loads tracks with reset transient state", () => {
    const partial = fromSavedProject({
      version: 2,
      audioTracks: [
        {
          id: "audio-3",
          fileName: "x.wav",
          assetKey: "k",
          duration: 5,
          offset: 0,
          volume: 0.8,
          muted: false,
        },
      ],
    } as SavedProject);

    expect(partial.audioTracks).toEqual([
      {
        id: "audio-3",
        fileName: "x.wav",
        assetKey: "k",
        duration: 5,
        offset: 0,
        volume: 0.8,
        muted: false,
        audioView: null,
      },
    ]);
    expect(partial.selectedAudioTrackId).toBeNull();
  });

  it("migrates a legacy saved project", () => {
    const partial = fromSavedProject({
      version: 1,
      audioFileName: "legacy.wav",
      audioAssetKey: "legacy-key",
      audioDuration: 30,
      audioOffset: 0,
      audioVolume: 0.7,
      audioMuted: false,
    } as SavedProject);

    expect(partial.audioTracks).toHaveLength(1);
    expect(partial.audioTracks?.[0]).toMatchObject({
      fileName: "legacy.wav",
      assetKey: "legacy-key",
      duration: 30,
      volume: 0.7,
      audioView: null,
    });
  });
});

describe("toSavedProject", () => {
  it("strips transient audioView from saved tracks", () => {
    useProjectStore.setState({
      audioTracks: [
        {
          id: "audio-9",
          fileName: "y.wav",
          assetKey: "k9",
          duration: 8,
          offset: 0,
          volume: 0.9,
          muted: false,
          audioView: { data: [], samplesPerPoint: 0, sampleRate: 0 },
        },
      ],
    });
    const saved = toSavedProject(useProjectStore.getState());
    expect(saved.audioTracks).toEqual([
      {
        id: "audio-9",
        fileName: "y.wav",
        assetKey: "k9",
        duration: 8,
        offset: 0,
        volume: 0.9,
        muted: false,
      },
    ]);
    expect(saved.audioTracks[0]).not.toHaveProperty("audioView");
  });
});
