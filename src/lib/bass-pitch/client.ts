import { resampleToModelRate } from "../basic-pitch/audio.ts";
import type { RpcClient } from "../rpc/core.ts";
import { createWorkerRpc } from "../rpc/worker.ts";
import type {
  GridTranscribedNote,
  GridTranscribeParams,
} from "./transcription.ts";
import type { BassPitchWorkerHandlers } from "./worker.ts";

// Client for grid-guided monophonic bass transcription (crates/bass-pitch,
// compiled to wasm). Unlike Basic Pitch there is no separate analyze stage: a
// single call runs pYIN plus the grid decisions, roughly a few seconds per
// song minute, reporting per-chunk progress along the way.

export const CONVERSION_CANCELLED_MESSAGE = "Conversion cancelled";

class BassPitchClient {
  private rpc: RpcClient<BassPitchWorkerHandlers> | undefined;
  private worker: Worker | undefined;
  private rejectPending: ((error: Error) => void) | undefined;

  // Spawning the worker and fetching/compiling the wasm take noticeable time
  // on a cold cache, so the panel warms them up on mount instead of paying
  // that inside the first conversion's "Converting 0%" phase.
  warmUp(): void {
    this.getRpc()
      .initialize()
      .catch((error) => {
        console.error("Failed to warm up bass pitch worker:", error);
      });
  }

  async transcribe(
    audioBuffer: AudioBuffer,
    params: GridTranscribeParams,
    onProgress: (fraction: number) => void,
  ): Promise<GridTranscribedNote[]> {
    const pcm = await resampleToModelRate(audioBuffer);
    const rpc = this.getRpc();
    // Terminating the worker does not settle its in-flight rpc promise, so
    // cancel() races it against an explicit rejection instead.
    const cancelled = new Promise<never>((_, reject) => {
      this.rejectPending = reject;
    });
    try {
      return await Promise.race([
        rpc.transcribe({ pcm, params, onProgress }),
        cancelled,
      ]);
    } finally {
      this.rejectPending = undefined;
    }
  }

  private getRpc(): RpcClient<BassPitchWorkerHandlers> {
    if (!this.rpc) {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.rpc = createWorkerRpc<BassPitchWorkerHandlers>(this.worker);
    }
    return this.rpc;
  }

  // The worker holds no cache, so killing it mid-conversion loses nothing;
  // the next transcribe creates a fresh worker. An in-band cancel message
  // would not work anyway because the single-threaded worker only processes
  // queued messages after the wasm call returns.
  cancel(): void {
    if (!this.rejectPending) {
      return;
    }
    this.worker?.terminate();
    this.worker = undefined;
    this.rpc = undefined;
    this.rejectPending(new Error(CONVERSION_CANCELLED_MESSAGE));
  }
}

export const bassPitchClient = new BassPitchClient();
