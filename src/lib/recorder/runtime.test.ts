import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioTrackPlayback } from "./audio-track-playback";
import { CaptureInput, CapturedAudio } from "./capture-input";
import { RECORDING_TRACK_ID } from "./recording-track";
import { RecorderRuntime } from "./runtime";

const { playbacks } = vi.hoisted(() => {
  vi.stubGlobal("AudioWorkletNode", class {});
  return { playbacks: [] as AudioTrackPlayback[] };
});
vi.mock("./audio-track-playback", () => ({
  AudioTrackPlayback: class {
    constructor() {
      playbacks.push(this as unknown as AudioTrackPlayback);
    }
    channel = { input: {}, setGain: vi.fn(), setEq: vi.fn() };
    setSources = vi.fn();
    setPlaybackGain = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock("./metronome", () => ({
  RecorderMetronome: class {
    setGain() {}
    setTempo() {}
    setTimeSignature() {}
  },
}));
vi.mock("./capture-input", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capture-input")>()),
  CaptureInput: { open: vi.fn() },
}));

beforeEach(() => {
  playbacks.length = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "AudioContext",
    class {
      sampleRate = 8000;
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => {});
      createGain() {
        return { connect() {}, gain: { value: 1 } };
      }
      createBuffer(count: number, length: number, sampleRate: number) {
        const channels = Array.from(
          { length: count },
          () => new Float32Array(length),
        );
        return {
          sampleRate,
          length,
          numberOfChannels: count,
          duration: length / sampleRate,
          getChannelData: (channel: number) => channels[channel],
        };
      }
    },
  );
});

function inputStub() {
  return {
    startCapture: vi.fn(async () => 0),
    stopCapture: vi.fn(
      async () =>
        new CapturedAudio({
          startFrame: 0,
          stopFrame: 8000,
          chunks: [
            { frameStart: 0, samples: new Float32Array(8000).fill(0.25) },
          ],
        }),
    ),
    setMonitorOutput: vi.fn(),
    dispose: vi.fn(),
  } as unknown as CaptureInput;
}

async function openInput(runtime: RecorderRuntime) {
  const input = inputStub();
  vi.mocked(CaptureInput.open).mockResolvedValue({ input, channelCount: 1 });
  await runtime.startInput({ deviceId: "fake" });
  return input;
}

// Load a project with one ordinary track holding an imported clip.
async function addBackingTrack(runtime: RecorderRuntime) {
  const id = runtime.addAudioTrack();
  const project = runtime.serializeProject();
  project.audioTracks[1].clips = [
    {
      id: "imported",
      name: "Backing",
      timelineOffset: 0,
      pcm: { sampleRate: 8000, channels: [new Float32Array(16000)] },
    },
  ];
  await runtime.deserializeProject(project);
  return id;
}

// Inspect output controls at the mocked audio boundary without replacing state logic.
function monitorOutput(input: CaptureInput) {
  const output = vi.mocked(input.setMonitorOutput).mock.lastCall![0];
  return output;
}

describe("recorder Capture track", () => {
  it("lives in audioTracks, keeps its input route after loading, and cannot be removed", async () => {
    const runtime = new RecorderRuntime();
    expect(runtime.store.get().audioTracks.map((track) => track.id)).toEqual([
      RECORDING_TRACK_ID,
    ]);
    const backing = runtime.addAudioTrack();
    const input = await openInput(runtime);
    const originalOutput = vi.mocked(CaptureInput.open).mock.lastCall![0]
      .output;
    const project = runtime.serializeProject();
    expect(project.audioTracks.map((track) => track.id)).toEqual([
      RECORDING_TRACK_ID,
      backing,
    ]);
    project.audioTracks[0].height = 0;
    await runtime.deserializeProject(project);
    expect(monitorOutput(input)).not.toBe(originalOutput);
    expect(runtime.store.get().audioTracks[0].height).toBe(116);
    runtime.setTrackHeight(RECORDING_TRACK_ID, 0);
    runtime.setTrackHeight(backing, 0);
    expect(
      runtime.store.get().audioTracks.map((track) => track.height),
    ).toEqual([116, 72]);
    expect(() => runtime.removeAudioTrack(RECORDING_TRACK_ID)).toThrow(
      "cannot be removed",
    );
    runtime.removeAudioTrack(backing);
    expect(runtime.store.get().audioTracks.map((track) => track.id)).toEqual([
      RECORDING_TRACK_ID,
    ]);
  });

  it("appends numbered takes to the Capture track with undo/redo", async () => {
    const runtime = new RecorderRuntime();
    const backing = await addBackingTrack(runtime);
    const project = runtime.serializeProject();
    project.audioTracks[0].nextTakeNumber = 4;
    await runtime.deserializeProject(project);
    await openInput(runtime);
    await runtime.startRecording();
    expect(runtime.store.get().pendingRecording?.name).toBe("Take 4");
    await runtime.stopRecording();
    const track = (id: string) =>
      runtime.store.get().audioTracks.find((track) => track.id === id)!;
    expect(track(RECORDING_TRACK_ID)).toMatchObject({
      nextTakeNumber: 5,
      clips: [{ name: "Take 4" }],
      regions: [{ clip: { name: "Take 4" } }],
    });
    expect(track(backing).clips.map((clip) => clip.id)).toEqual(["imported"]);
    await runtime.undo();
    expect(track(RECORDING_TRACK_ID).clips).toEqual([]);
    await runtime.redo();
    expect(track(RECORDING_TRACK_ID).clips).toHaveLength(1);
    runtime.pause();
  });

  it("suppresses only the Capture comp through processing", async () => {
    const runtime = new RecorderRuntime();
    const backing = await addBackingTrack(runtime);
    const backingPlayback = playbacks[0];
    const input = await openInput(runtime);
    const capturePlayback = playbacks[1];
    await runtime.startRecording();
    runtime.setTrackMix(backing, { gain: 0.4 });
    runtime.setTrackMix(RECORDING_TRACK_ID, { gain: 0.7 });
    expect(capturePlayback.setPlaybackGain).toHaveBeenLastCalledWith(0);
    expect(capturePlayback.channel.setGain).toHaveBeenLastCalledWith(0.7);
    expect(backingPlayback.channel.setGain).toHaveBeenLastCalledWith(0.4);
    expect(backingPlayback.setPlaybackGain).not.toHaveBeenCalled();
    const stopping = Promise.withResolvers<CapturedAudio>();
    vi.mocked(input.stopCapture).mockReturnValueOnce(stopping.promise);
    const stopped = runtime.stopRecording();
    runtime.setTrackMix(RECORDING_TRACK_ID, { muted: true });
    runtime.setTrackMix(RECORDING_TRACK_ID, { muted: false });
    expect(capturePlayback.setPlaybackGain).toHaveBeenLastCalledWith(0);
    stopping.resolve(
      new CapturedAudio({
        startFrame: 0,
        stopFrame: 8000,
        chunks: [{ frameStart: 0, samples: new Float32Array(8000) }],
      }),
    );
    await stopped;
    expect(capturePlayback.setPlaybackGain).toHaveBeenLastCalledWith(1);
    runtime.pause();
  });
});
