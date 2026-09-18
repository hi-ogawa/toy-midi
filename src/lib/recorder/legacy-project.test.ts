import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultSavedProject,
  type SavedProjectV1,
} from "../project-store";
import { convertLegacyProject } from "./legacy-project";

vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
});
afterEach(() => vi.unstubAllGlobals());

const audioTrack = {
  id: "backing",
  fileName: "backing.wav",
  assetKey: "original",
  duration: 9,
  offset: 1.25,
  volume: 0.6,
  muted: false,
  soloed: true,
};
const projectV1: SavedProjectV1 = {
  ...createDefaultSavedProject(),
  version: 1,
  audioFileName: "backing.wav",
  audioAssetKey: null,
  audioDuration: 9,
  audioOffset: 1.25,
  audioVolume: 0.6,
};

function mockDecoder() {
  const channels = [
    new Float32Array([0.25, -0.5]),
    new Float32Array([0.75, 0]),
  ];
  const decode = vi.fn().mockResolvedValue({
    sampleRate: 48000,
    numberOfChannels: 2,
    duration: 2 / 48000,
    getChannelData: (channel: number) => channels[channel],
  });
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      decodeAudioData = decode;
    },
  );
  return { channels, decode };
}

describe("legacy recorder conversion", () => {
  it("copies MIDI, annotations, timing, and mix without mutating the source", async () => {
    const project = {
      ...createDefaultSavedProject(),
      notes: [
        {
          id: "note",
          start: 1.5,
          duration: 0.5,
          pitch: 64,
          velocity: 0.7,
          tabString: 1 as const,
        },
      ],
      tempo: 98,
      timeSignature: { numerator: 3, denominator: 4 },
      locators: [{ id: "verse", position: 4, label: "Verse" }],
      keySignature: { fifths: 2, mode: "minor" as const },
      tabAnnotationEnabled: true,
      tabOpenStringPitches: [40, 45, 50, 55, 59, 64],
      midiProgram: 24,
      midiMuted: true,
      midiSoloed: true,
      midiVolume: 0.4,
      masterVolume: 0.8,
      metronomeVolume: 0.2,
    };
    const original = structuredClone(project);
    const loadAudio = vi.fn();
    const result = await convertLegacyProject({
      name: "Song",
      project,
      loadAudio,
    });
    expect(result).toMatchObject({
      title: "Song",
      tempo: 98,
      timeSignature: project.timeSignature,
      locators: [{ id: "verse", beat: 4, label: "Verse" }],
      masterGain: 0.8,
      metronomeGain: 0.2,
      midiTracks: [
        {
          notes: project.notes,
          program: 24,
          muted: true,
          soloed: true,
          gain: 0.4,
          keySignature: project.keySignature,
          tabAnnotationEnabled: true,
          tabOpenStringPitches: project.tabOpenStringPitches,
        },
      ],
      audioTracks: [],
      recordingTrack: { takes: [] },
    });
    expect(loadAudio).not.toHaveBeenCalled();
    result.midiTracks![0].notes[0].pitch = 60;
    expect(project).toEqual(original);
  });

  it("decodes all channels and uses decoded duration while preserving offsets and gains", async () => {
    const { channels } = mockDecoder();
    const result = await convertLegacyProject({
      name: "Audio",
      project: { ...createDefaultSavedProject(), audioTracks: [audioTrack] },
      loadAudio: async () => new Blob(["encoded"]),
    });
    expect(result.audioTracks[0]).toMatchObject({
      id: "backing",
      gain: 0.6,
      soloed: true,
      timelineOffset: 1.25,
      trimStart: 0,
      trimEnd: 2 / 48000,
      clip: { name: "backing.wav", pcm: { sampleRate: 48000, channels } },
    });
    expect(result.audioTracks[0].clip!.pcm.channels[0]).not.toBe(channels[0]);
  });

  it("names missing or undecodable tracks and rejects the conversion", async () => {
    const { decode } = mockDecoder();
    const options = {
      name: "Broken",
      project: { ...createDefaultSavedProject(), audioTracks: [audioTrack] },
    };
    await expect(
      convertLegacyProject({ ...options, loadAudio: async () => undefined }),
    ).rejects.toThrow('Could not convert audio track "backing.wav"');
    decode.mockRejectedValue(new Error("Invalid encoding"));
    await expect(
      convertLegacyProject({
        ...options,
        loadAudio: async () => new Blob(["bad"]),
      }),
    ).rejects.toThrow('Could not convert audio track "backing.wav"');
  });

  it("converts saved v1 data with legacy defaults", async () => {
    mockDecoder();
    const loadAudio = vi.fn().mockResolvedValue(new Blob(["audio"]));
    const result = await convertLegacyProject({
      name: "Stored v1",
      project: { ...projectV1, audioAssetKey: "stored-audio" },
      loadAudio,
    });
    expect(loadAudio).toHaveBeenCalledWith(
      expect.objectContaining({ assetKey: "stored-audio" }),
    );
    expect(result.audioTracks[0]).toMatchObject({
      id: "audio-1",
      soloed: false,
    });
    expect(result.midiTracks![0]).toMatchObject({
      program: 0,
      gain: 0.8,
      muted: false,
    });
  });
});
