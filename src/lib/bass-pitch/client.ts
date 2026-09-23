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
  private connection?: {
    worker: Worker;
    rpc: RpcClient<BassPitchWorkerHandlers>;
  };
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
    this.transcribing = true;

    const aborted = Promise.withResolvers<never>();
    const handleAbort = () => {
      this.resetRpc();
      aborted.reject(signal?.reason);
    };

    const transcribeInner = async () => {
      signal?.throwIfAborted();
      const pcm = await resampleToModelRate(audioBuffer);
      signal?.throwIfAborted();
      return this.getRpc().transcribe({
        pcm,
        params,
        onProgress: (fraction) => {
          if (!signal?.aborted) {
            onProgress(fraction);
          }
        },
      });
    };

    try {
      signal?.addEventListener("abort", handleAbort, { once: true });
      return await Promise.race([transcribeInner(), aborted.promise]);
    } finally {
      signal?.removeEventListener("abort", handleAbort);
      this.transcribing = false;
    }
  }

  private getRpc(): RpcClient<BassPitchWorkerHandlers> {
    if (!this.connection) {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.connection = {
        worker,
        rpc: createWorkerRpc<BassPitchWorkerHandlers>(worker),
      };
    }
    return this.connection.rpc;
  }

  private resetRpc(): void {
    this.connection?.worker.terminate();
    this.connection = undefined;
  }
}

export const bassPitchClient = new BassPitchClient();
