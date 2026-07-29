import { registerWorkerRpcHandlers } from "../rpc/worker.ts";
import initBassPitchWasm, { transcribe } from "./pkg/bass_pitch.js";
import wasmUrl from "./pkg/bass_pitch_bg.wasm?url";
import type {
  GridTranscribedNote,
  GridTranscribeParams,
} from "./transcription.ts";

function main(): void {
  registerWorkerRpcHandlers(new BassPitchWorkerHandlers());
}

let wasmReady: Promise<unknown> | undefined;

export class BassPitchWorkerHandlers {
  async transcribe({
    pcm,
    params,
    onProgress,
  }: {
    pcm: Float32Array;
    params: GridTranscribeParams;
    onProgress: (fraction: number) => void;
  }): Promise<GridTranscribedNote[]> {
    wasmReady ??= initBassPitchWasm({ module_or_path: wasmUrl });
    await wasmReady;
    return JSON.parse(transcribe(pcm, JSON.stringify(params), onProgress));
  }
}

main();
