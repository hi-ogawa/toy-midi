import { BasicSoundBank, SoundBankLoader } from "spessasynth_core";
import { registerWorkerRpcHandlers } from "./rpc/worker.ts";

function main(): void {
  registerWorkerRpcHandlers(new SoundfontDecoderWorkerHandlers());
}

export class SoundfontDecoderWorkerHandlers {
  /** Returns every sample of the SoundFont decoded, in the file's order. */
  async decodeSamples({
    soundfont,
  }: {
    soundfont: ArrayBuffer;
  }): Promise<Float32Array[]> {
    // SF3 samples need the Vorbis decoder, which loads asynchronously.
    await BasicSoundBank.isSF3DecoderReady;
    const bank = SoundBankLoader.fromArrayBuffer(soundfont);
    return bank.samples.map((sample) => sample.getAudioData());
  }
}

main();
