import type { BasicPitchWorkerHandlers } from "./basic-pitch-worker.ts";
import type { RpcClient } from "./rpc/core.ts";
import { createWorkerRpc } from "./rpc/worker.ts";

// Client for Basic Pitch (https://github.com/spotify/basic-pitch) audio→MIDI
// transcription. The worker (basic-pitch-worker.ts) exposes the two inherent
// stages separately: `analyze` runs model inference once per audio asset and
// caches the raw activations worker-side, `decode` reruns only the cheap
// activations→notes extraction with new parameters.

export interface TranscribeParams {
  onsetThreshold: number; // 0-1, higher = fewer note splits
  frameThreshold: number; // 0-1, higher = fewer detected notes
  minNoteLengthMs: number; // drop detections shorter than this
  minPitchMidi: number;
  maxPitchMidi: number;
}

export interface TranscribedNote {
  startSeconds: number; // relative to the source audio, not the timeline
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number; // model confidence 0-1, not musical velocity
}

// Matches the Basic Pitch reference decoder defaults: onset 0.5, frame 0.3,
// min length 5 frames (~58 ms), and the model's full pitch range (MIDI 21-108)
export const DEFAULT_TRANSCRIBE_PARAMS: TranscribeParams = {
  onsetThreshold: 0.5,
  frameThreshold: 0.3,
  minNoteLengthMs: 58,
  minPitchMidi: 21, // A0
  maxPitchMidi: 108, // C8
};

const MODEL_SAMPLE_RATE = 22050;

class BasicPitchClient {
  private rpc: RpcClient<BasicPitchWorkerHandlers> | undefined;
  private analyzedCacheKey: string | null = null;

  async analyze(
    cacheKey: string,
    audioBuffer: AudioBuffer,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    if (import.meta.env.VITE_FAKE_BASIC_PITCH === "true") {
      onProgress(1);
      this.analyzedCacheKey = cacheKey;
      return;
    }
    const pcm =
      this.analyzedCacheKey === cacheKey
        ? undefined
        : await resampleToModelRate(audioBuffer);
    const expectedBackend = import.meta.env.VITE_BASIC_PITCH_BACKEND;
    const { backend } = await this.getRpc().analyze({
      cacheKey,
      backend: expectedBackend,
      pcm,
      onProgress,
    });
    if (expectedBackend !== undefined && expectedBackend !== backend) {
      throw new Error(
        `Expected tfjs backend ${expectedBackend}, got ${backend}`,
      );
    }
    this.analyzedCacheKey = cacheKey;
  }

  async decode(
    cacheKey: string,
    params: TranscribeParams,
  ): Promise<TranscribedNote[]> {
    if (import.meta.env.VITE_FAKE_BASIC_PITCH === "true") {
      if (this.analyzedCacheKey !== cacheKey) {
        throw new Error("Audio not analyzed");
      }
      return FAKE_TRANSCRIBED_NOTES.filter(
        (note) =>
          note.pitchMidi >= params.minPitchMidi &&
          note.pitchMidi <= params.maxPitchMidi,
      );
    }
    return this.getRpc().decode({ cacheKey, params });
  }

  private getRpc(): RpcClient<BasicPitchWorkerHandlers> {
    if (!this.rpc) {
      const worker = new Worker(
        new URL("./basic-pitch-worker.ts", import.meta.url),
        { type: "module" },
      );
      this.rpc = createWorkerRpc<BasicPitchWorkerHandlers>(worker);
    }
    return this.rpc;
  }
}

const FAKE_TRANSCRIBED_NOTES: TranscribedNote[] = [60, 64, 67, 72].map(
  (pitchMidi, index) => ({
    startSeconds: index,
    durationSeconds: 0.8,
    pitchMidi,
    amplitude: 0.8,
  }),
);

export const basicPitchClient = new BasicPitchClient();

// The model requires mono 22,050 Hz PCM. OfflineAudioContext is unavailable
// in workers, so downmix/resample on the main thread and transfer the result.
async function resampleToModelRate(buffer: AudioBuffer): Promise<Float32Array> {
  const context = new OfflineAudioContext(
    1,
    Math.ceil(buffer.duration * MODEL_SAMPLE_RATE),
    MODEL_SAMPLE_RATE,
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return (await context.startRendering()).getChannelData(0);
}
