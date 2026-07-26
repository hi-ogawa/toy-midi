import type { RpcClient } from "../rpc/core.ts";
import { createWorkerRpc } from "../rpc/worker.ts";
import { resampleToModelRate } from "./audio.ts";
import type { TranscribedNote, TranscribeParams } from "./transcription.ts";
import type { BasicPitchWorkerHandlers } from "./worker.ts";

// Client for Basic Pitch (https://github.com/spotify/basic-pitch) audio→MIDI
// transcription. The worker exposes the two inherent
// stages separately: `analyze` runs model inference once per audio asset and
// caches the raw activations worker-side, `decode` reruns only the
// activations→notes extraction with new parameters. Decode is cheaper than
// analyze but not instant. Example for a 3min song: ~12s analyze, then 1-5s
// per decode depending on how many notes the params yield (and likely more for
// exotic configs), so treat decode as a deliberate action rather than
// something to rerun live on every parameter change.

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
    const rpc = this.getRpc();
    const expectedBackend = import.meta.env.VITE_BASIC_PITCH_BACKEND;
    const { backend } = await rpc.initialize({
      backend: expectedBackend,
    });
    if (expectedBackend !== undefined && expectedBackend !== backend) {
      throw new Error(
        `Expected tfjs backend ${expectedBackend}, got ${backend}`,
      );
    }
    if (!(await rpc.hasAnalysis({ cacheKey }))) {
      const pcm = await resampleToModelRate(audioBuffer);
      await rpc.analyze({ cacheKey, pcm, onProgress });
    }
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
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
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
