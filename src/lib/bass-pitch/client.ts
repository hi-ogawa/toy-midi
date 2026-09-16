import type { RpcClient } from "../rpc/core.ts";
import { createWorkerRpc } from "../rpc/worker.ts";
import { resampleToModelRate } from "./audio.ts";
import type {
  GridTranscribedNote,
  GridTranscribeParams,
} from "./transcription.ts";
import type { BassPitchWorkerHandlers } from "./worker.ts";

// Client for grid-guided monophonic bass transcription (crates/bass-pitch,
// compiled to wasm). Unlike Basic Pitch there is no separate analyze stage: a
// single call runs pYIN plus the grid decisions, roughly a few seconds per
// song minute, reporting per-chunk progress along the way.

class BassPitchClient {
  private worker: Worker | undefined;
  private rpc: RpcClient<BassPitchWorkerHandlers> | undefined;
  private transcribing = false;

  // Spawning the worker and fetching/compiling the wasm take noticeable time
  // on a cold cache, so the panel warms them up on mount instead of paying
  // that inside the first conversion's "Converting 0%" phase.
  warmUp(): void {
    this.getRpc()
      .initialize({})
      .catch((error) => {
        console.error("Failed to warm up bass pitch worker:", error);
      });
  }

  async transcribe(
    audioBuffer: AudioBuffer,
    params: GridTranscribeParams,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<GridTranscribedNote[]> {
    if (this.transcribing) {
      throw new Error("Bass pitch transcription is already in progress");
    }
    signal?.throwIfAborted();
    this.transcribing = true;

    const aborted = Promise.withResolvers<never>();
    const handleAbort = () => {
      this.resetWorker();
      aborted.reject(signal?.reason);
    };

    try {
      signal?.addEventListener("abort", handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
      }
      const transcription = (async () => {
        const pcm = await resampleToModelRate(audioBuffer);
        signal?.throwIfAborted();
        const rpc = this.getRpc();
        return await rpc.transcribe({
          pcm,
          params,
          onProgress: (fraction) => {
            if (!signal?.aborted) {
              onProgress(fraction);
            }
          },
        });
      })();
      return await Promise.race([transcription, aborted.promise]);
    } finally {
      signal?.removeEventListener("abort", handleAbort);
      this.transcribing = false;
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

  private resetWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.rpc = undefined;
  }
}

export const bassPitchClient = new BassPitchClient();
