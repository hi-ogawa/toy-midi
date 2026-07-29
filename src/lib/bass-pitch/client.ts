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
// song minute.

class BassPitchClient {
  private rpc: RpcClient<BassPitchWorkerHandlers> | undefined;

  async transcribe(
    audioBuffer: AudioBuffer,
    params: GridTranscribeParams,
  ): Promise<GridTranscribedNote[]> {
    const pcm = await resampleToModelRate(audioBuffer);
    if (!this.rpc) {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      this.rpc = createWorkerRpc<BassPitchWorkerHandlers>(worker);
    }
    return this.rpc.transcribe({ pcm, params });
  }
}

export const bassPitchClient = new BassPitchClient();
