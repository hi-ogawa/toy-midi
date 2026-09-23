import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioTrackPlayback } from "./audio-track-playback";
import { CaptureInput, CapturedAudio } from "./capture-input";
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

// Inspect output controls at the mocked audio boundary without replacing state logic.
function monitorOutput(input: CaptureInput) {
  const output = vi.mocked(input.setMonitorOutput).mock.lastCall![0];
  return output;
}

describe("armed recorder destination", () => {
  it("routes the shared input when arming and after loading recreated playbacks", async () => {
    const runtime = new RecorderRuntime();
    const first = runtime.store.get().armedTrackId;
    const second = runtime.addAudioTrack();
    const input = await openInput(runtime);
    const originalOutput = monitorOutput(input);
    runtime.setArmedTrack(second);
    expect(monitorOutput(input)).not.toBe(originalOutput);
    expect(runtime.store.get().armedTrackId).toBe(second);
    expect(() => runtime.setArmedTrack("missing")).toThrow(
      "Audio track state is missing",
    );
    expect(runtime.store.get().armedTrackId).toBe(second);
    const armedOutput = monitorOutput(input);
    await runtime.deserializeProject(runtime.serializeProject());
    expect(monitorOutput(input)).not.toBe(armedOutput);
    expect(runtime.store.get().armedTrackId).toBe(second);
    runtime.removeAudioTrack(first);
    expect(runtime.store.get().audioTracks.map((track) => track.id)).toEqual([
      second,
    ]);
    expect(() => runtime.removeAudioTrack(second)).toThrow(
      "recording destination",
    );
  });

  it("uses the latest destination if arming changes while input is opening", async () => {
    const runtime = new RecorderRuntime();
    const second = runtime.addAudioTrack();
    const opening = Promise.withResolvers<{
      input: CaptureInput;
      channelCount: number;
    }>();
    vi.mocked(CaptureInput.open).mockReturnValue(opening.promise);
    const started = runtime.startInput({ deviceId: "fake" });
    const initialOutput = vi.mocked(CaptureInput.open).mock.lastCall![0].output;
    runtime.setArmedTrack(second);
    const input = inputStub();
    opening.resolve({ input, channelCount: 1 });
    await started;
    expect(monitorOutput(input)).not.toBe(initialOutput);
  });

  it("locks startup through processing and appends with undo/redo to the captured track", async () => {
    const runtime = new RecorderRuntime();
    const first = runtime.store.get().armedTrackId;
    const second = runtime.addAudioTrack();
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
    const input = await openInput(runtime);
    runtime.setArmedTrack(second);
    const startup = Promise.withResolvers<number>();
    vi.mocked(input.startCapture).mockReturnValueOnce(startup.promise);
    const started = runtime.startRecording();
    expect(() => runtime.setArmedTrack(first)).toThrow("while recording");
    expect(() => runtime.removeAudioTrack(second)).toThrow(
      "recording destination",
    );
    await expect(runtime.startRecording()).rejects.toThrow(
      "already in progress",
    );
    await expect(
      runtime.deserializeProject(runtime.serializeProject()),
    ).rejects.toThrow("while recording");
    startup.resolve(0);
    await started;
    expect(runtime.store.get().pendingRecording?.trackId).toBe(second);
    expect(() => runtime.setArmedTrack(first)).toThrow("while recording");
    const stopping = Promise.withResolvers<CapturedAudio>();
    vi.mocked(input.stopCapture).mockReturnValueOnce(stopping.promise);
    const stopped = runtime.stopRecording();
    expect(runtime.store.get().captureStatus).toBe("processing");
    expect(() => runtime.setArmedTrack(first)).toThrow("while recording");
    stopping.resolve(
      new CapturedAudio({
        startFrame: 0,
        stopFrame: 8000,
        chunks: [{ frameStart: 0, samples: new Float32Array(8000).fill(0.5) }],
      }),
    );
    await stopped;
    const destination = () =>
      runtime.store.get().audioTracks.find((track) => track.id === second)!;
    expect(destination().clips).toHaveLength(2);
    expect(destination()).toMatchObject({
      nextTakeNumber: 2,
      clips: [{ name: "Backing" }, { name: "Take 1" }],
    });
    expect(runtime.store.get().audioTracks[0].clips).toEqual([]);
    runtime.setArmedTrack(first);
    await runtime.undo();
    expect(destination().clips.map((clip) => clip.id)).toEqual(["imported"]);
    await runtime.redo();
    expect(destination().clips).toHaveLength(2);
    runtime.pause();
  });

  it("suppresses only the armed comp through processing and restores it after capture", async () => {
    const runtime = new RecorderRuntime();
    const first = runtime.store.get().armedTrackId;
    const second = runtime.addAudioTrack();
    const input = await openInput(runtime);
    const backingPlayback = playbacks[0];
    runtime.setArmedTrack(second);
    const capturePlayback = playbacks[1];
    await runtime.startRecording();
    runtime.setTrackMix(first, { gain: 0.4 });
    runtime.setTrackMix(second, { gain: 0.7 });
    expect(backingPlayback.setPlaybackGain).toHaveBeenLastCalledWith(1);
    expect(capturePlayback.setPlaybackGain).toHaveBeenLastCalledWith(0);
    expect(capturePlayback.channel.setGain).toHaveBeenLastCalledWith(0.7);
    const stopping = Promise.withResolvers<CapturedAudio>();
    vi.mocked(input.stopCapture).mockReturnValueOnce(stopping.promise);
    const stopped = runtime.stopRecording();
    runtime.setTrackMix(second, { muted: true });
    runtime.setTrackMix(second, { muted: false });
    expect(capturePlayback.setPlaybackGain).toHaveBeenLastCalledWith(0);
    expect(backingPlayback.setPlaybackGain).toHaveBeenLastCalledWith(1);
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

  it("releases the destination lock when capture startup fails", async () => {
    const runtime = new RecorderRuntime();
    const second = runtime.addAudioTrack();
    const input = await openInput(runtime);
    vi.mocked(input.startCapture).mockRejectedValueOnce(
      new Error("startup failed"),
    );
    await expect(runtime.startRecording()).rejects.toThrow("startup failed");
    runtime.setArmedTrack(second);
    expect(runtime.store.get().armedTrackId).toBe(second);
  });
});
