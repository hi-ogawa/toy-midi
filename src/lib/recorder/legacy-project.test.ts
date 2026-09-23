import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSavedProject, type SavedProject } from "../project-store";
import { convertLegacyProject } from "./legacy-project";

vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
});

afterEach(() => vi.unstubAllGlobals());

function mockDecoder() {
  const channels = [
    new Float32Array([0.25, -0.5]),
    new Float32Array([0.75, 0]),
  ];
  const decode = async () => ({
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
  return { channels };
}

describe("legacy recorder conversion", () => {
  it("copies MIDI, annotations, timing, and mix", async () => {
    const project: SavedProject = {
      ...createDefaultSavedProject(),
      notes: [
        {
          id: "note",
          start: 1.5,
          duration: 0.5,
          pitch: 64,
          velocity: 0.7,
          tabString: 1,
        },
      ],
      tempo: 98,
      timeSignature: { numerator: 3, denominator: 4 },
      locators: [{ id: "verse", position: 4, label: "Verse" }],
      keySignature: { fifths: 2, mode: "minor" },
      tabAnnotationEnabled: true,
      tabOpenStringPitches: [40, 45, 50, 55, 59, 64],
      midiProgram: 24,
      midiMuted: true,
      midiSoloed: true,
      midiVolume: 0.4,
      masterVolume: 0.8,
      metronomeVolume: 0.2,
    };
    const result = await convertLegacyProject({
      name: "Song",
      project,
      loadAudio: async () => undefined,
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
      armedTrackId: expect.any(String),
      audioTracks: [{ id: result.armedTrackId, clips: [] }],
    });
  });

  it("decodes all channels and uses decoded duration while preserving offsets and gains", async () => {
    const { channels } = mockDecoder();
    const result = await convertLegacyProject({
      name: "Audio",
      project: {
        ...createDefaultSavedProject(),
        audioTracks: [
          {
            id: "backing",
            fileName: "backing.wav",
            assetKey: "original",
            duration: 9,
            offset: 1.25,
            volume: 0.6,
            muted: false,
            soloed: true,
          },
        ],
      },
      loadAudio: async () => new Blob(["encoded"]),
    });
    expect(result.audioTracks[1]).toMatchObject({
      id: "backing",
      gain: 0.6,
      soloed: true,
      clips: [
        {
          timelineOffset: 1.25,
          trimStart: 0,
          trimEnd: 2 / 48000,
          name: "backing.wav",
          pcm: { sampleRate: 48000, channels },
        },
      ],
    });
    expect(result.audioTracks[1].clips![0].pcm.channels[0]).not.toBe(
      channels[0],
    );
  });

  it("converts saved v1 data with legacy defaults", async () => {
    mockDecoder();
    const result = await convertLegacyProject({
      name: "Stored v1",
      project: {
        ...createDefaultSavedProject(),
        version: 1,
        audioFileName: "backing.wav",
        audioAssetKey: "stored-audio",
        audioDuration: 9,
        audioOffset: 1.25,
        audioVolume: 0.6,
      },
      loadAudio: async () => new Blob(["audio"]),
    });
    expect(result.audioTracks[1]).toMatchObject({
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
