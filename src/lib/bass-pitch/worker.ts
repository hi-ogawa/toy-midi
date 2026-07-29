import initBassPitchWasm, { transcribe } from "@hiogawa/bass-pitch-wasm";
import { registerWorkerRpcHandlers } from "../rpc/worker.ts";
import type {
  GridTranscribedNote,
  GridTranscribeParams,
} from "./transcription.ts";

function main(): void {
  registerWorkerRpcHandlers(new BassPitchWorkerHandlers());
}

let wasmReady: Promise<unknown> | undefined;

export class BassPitchWorkerHandlers {
  async initialize(_params: Record<string, never>): Promise<void> {
    wasmReady ??= initBassPitchWasm();
    await wasmReady;
  }

  async transcribe({
    pcm,
    params,
    onProgress,
  }: {
    pcm: Float32Array;
    params: GridTranscribeParams;
    onProgress: (fraction: number) => void;
  }): Promise<GridTranscribedNote[]> {
    wasmReady ??= initBassPitchWasm();
    await wasmReady;
    return JSON.parse(transcribe(pcm, JSON.stringify(params), onProgress));
  }
}

main();
