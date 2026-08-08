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

class BassPitchClient {
  private rpc: RpcClient<BassPitchWorkerHandlers> | undefined;

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
  ): Promise<GridTranscribedNote[]> {
    const pcm = await resampleToModelRate(audioBuffer);
    const rpc = this.getRpc();
    return await rpc.transcribe({ pcm, params, onProgress });
  }

  private getRpc(): RpcClient<BassPitchWorkerHandlers> {
    if (!this.rpc) {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.rpc = createWorkerRpc<BassPitchWorkerHandlers>(worker);
    }
    return this.rpc;
  }
}

export const bassPitchClient = new BassPitchClient();
