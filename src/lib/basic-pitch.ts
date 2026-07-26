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

export type BasicPitchRequest =
  | {
      type: "analyze";
      requestId: number;
      cacheKey: string;
      pcm?: Float32Array; // present only when the worker lacks activations for cacheKey
    }
  | {
      type: "decode";
      requestId: number;
      cacheKey: string;
      params: TranscribeParams;
    };

export type BasicPitchResponse =
  | { type: "progress"; requestId: number; percent: number }
  | { type: "analyzed"; requestId: number }
  | { type: "notes"; requestId: number; notes: TranscribedNote[] }
  | { type: "error"; requestId: number; message: string };

const MODEL_SAMPLE_RATE = 22050;

class BasicPitchClient {
  private worker: Worker | null = null;
  private analyzedCacheKey: string | null = null;
  private nextRequestId = 1;

  async analyze(
    cacheKey: string,
    audioBuffer: AudioBuffer,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    const pcm =
      this.analyzedCacheKey === cacheKey
        ? undefined
        : await resampleToModelRate(audioBuffer);
    await this.sendRequest(
      { type: "analyze", requestId: this.nextRequestId++, cacheKey, pcm },
      pcm ? [pcm.buffer] : [],
      onProgress,
    );
    this.analyzedCacheKey = cacheKey;
  }

  async decode(
    cacheKey: string,
    params: TranscribeParams,
  ): Promise<TranscribedNote[]> {
    const response = await this.sendRequest(
      { type: "decode", requestId: this.nextRequestId++, cacheKey, params },
      [],
    );
    if (response.type !== "notes") {
      throw new Error(`Unexpected response: ${response.type}`);
    }
    return response.notes;
  }

  private sendRequest(
    request: BasicPitchRequest,
    transfer: Transferable[],
    onProgress?: (percent: number) => void,
  ): Promise<BasicPitchResponse> {
    this.worker ??= new Worker(
      new URL("./basic-pitch-worker.ts", import.meta.url),
      { type: "module" },
    );
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        worker.removeEventListener("messageerror", handleMessageError);
      };
      const handleMessage = (event: MessageEvent<BasicPitchResponse>) => {
        const response = event.data;
        if (response.requestId !== request.requestId) {
          return;
        }
        if (response.type === "progress") {
          onProgress?.(response.percent);
          return;
        }
        cleanup();
        if (response.type === "error") {
          reject(new Error(response.message));
        } else {
          resolve(response);
        }
      };
      const handleError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || "Basic Pitch worker failed"));
      };
      const handleMessageError = () => {
        cleanup();
        reject(new Error("Basic Pitch worker message could not be read"));
      };
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.addEventListener("messageerror", handleMessageError);
      worker.postMessage(request, transfer);
    });
  }
}

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
