// Client for Basic Pitch (https://github.com/spotify/basic-pitch) audio→MIDI
// transcription. Inference and note decoding run in basic-pitch-worker.ts,
// which caches raw model output per audio asset, so re-running with different
// decode parameters skips the expensive inference pass.

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

export interface BasicPitchRequest {
  requestId: number;
  cacheKey: string;
  params: TranscribeParams;
  pcm?: Float32Array; // present only when the worker lacks activations for cacheKey
}

export type BasicPitchResponse =
  | { type: "progress"; requestId: number; percent: number }
  | { type: "result"; requestId: number; notes: TranscribedNote[] }
  | { type: "error"; requestId: number; message: string };

const MODEL_SAMPLE_RATE = 22050;

class BasicPitchClient {
  private worker: Worker | null = null;
  private workerCacheKey: string | null = null;
  private nextRequestId = 1;

  async transcribe(
    cacheKey: string,
    audioBuffer: AudioBuffer,
    params: TranscribeParams,
    onProgress: (percent: number) => void,
  ): Promise<TranscribedNote[]> {
    this.worker ??= new Worker(
      new URL("./basic-pitch-worker.ts", import.meta.url),
      { type: "module" },
    );
    const worker = this.worker;
    const requestId = this.nextRequestId++;
    const pcm =
      this.workerCacheKey === cacheKey
        ? undefined
        : await resampleToModelRate(audioBuffer);
    const request: BasicPitchRequest = { requestId, cacheKey, params, pcm };

    return new Promise((resolve, reject) => {
      const handleMessage = (event: MessageEvent<BasicPitchResponse>) => {
        const response = event.data;
        if (response.requestId !== requestId) {
          return;
        }
        if (response.type === "progress") {
          onProgress(response.percent);
          return;
        }
        worker.removeEventListener("message", handleMessage);
        if (response.type === "result") {
          this.workerCacheKey = cacheKey;
          resolve(response.notes);
        } else {
          reject(new Error(response.message));
        }
      };
      worker.addEventListener("message", handleMessage);
      worker.postMessage(request, pcm ? [pcm.buffer] : []);
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
