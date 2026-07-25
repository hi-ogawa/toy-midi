import {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} from "@spotify/basic-pitch";
import modelWeightsUrl from "@spotify/basic-pitch/model/group1-shard1of1.bin?url";
import modelJsonUrl from "@spotify/basic-pitch/model/model.json?url";
import * as tf from "@tensorflow/tfjs";
import type {
  BasicPitchRequest,
  BasicPitchResponse,
  TranscribedNote,
  TranscribeParams,
} from "./basic-pitch";

// Model output frame rate: 22,050 Hz sample rate / 256 FFT hop
const FRAME_DURATION_MS = 1000 / (22050 / 256);

// tfjs 3.x PlatformBrowser.setTimeoutCustom references the undeclared
// `window` before it can take its own setTimeout fallback, which throws in
// workers and stalls the WebGL backend's fence polling (inference hangs at
// 0%). Shadow the prototype method with the fallback it meant to use.
tf.env().platform.setTimeoutCustom = (fn: () => void, delay: number) => {
  setTimeout(fn, delay);
};

// The npm package ships the model files, but Vite fingerprints them as
// separate assets, which breaks model.json's relative reference to the
// weight shard. weightUrlConverter remaps it to the emitted asset URL.
const basicPitch = new BasicPitch(
  tf.loadGraphModel(modelJsonUrl, {
    weightUrlConverter: async () => modelWeightsUrl,
  }),
);

// Raw activations for the most recently analyzed audio asset, so decode
// requests rerun only the cheap extraction below. Kept worker-side because
// the matrices are large (~7 MB per song minute); a single entry bounds
// memory. Contours are dropped since pitch bends are not imported.
let cache: {
  cacheKey: string;
  frames: number[][];
  onsets: number[][];
} | null = null;

self.onmessage = async (event: MessageEvent<BasicPitchRequest>) => {
  const request = event.data;
  const { requestId } = request;
  const respond = (response: BasicPitchResponse) => self.postMessage(response);
  try {
    if (request.type === "analyze") {
      if (cache?.cacheKey !== request.cacheKey) {
        if (!request.pcm) {
          throw new Error("Missing PCM for unanalyzed audio");
        }
        const frames: number[][] = [];
        const onsets: number[][] = [];
        await basicPitch.evaluateModel(
          request.pcm,
          (chunkFrames, chunkOnsets) => {
            frames.push(...chunkFrames);
            onsets.push(...chunkOnsets);
          },
          (percent) => respond({ type: "progress", requestId, percent }),
        );
        cache = { cacheKey: request.cacheKey, frames, onsets };
      }
      respond({ type: "analyzed", requestId });
    } else {
      if (cache?.cacheKey !== request.cacheKey) {
        throw new Error("Audio not analyzed");
      }
      respond({
        type: "notes",
        requestId,
        notes: decodeNotes(cache, request.params),
      });
    }
  } catch (error) {
    respond({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

function decodeNotes(
  { frames, onsets }: NonNullable<typeof cache>,
  params: TranscribeParams,
): TranscribedNote[] {
  // outputToNotesPoly mutates its inputs when constraining the pitch range,
  // so decode from copies to keep the cached activations reusable
  const notes = noteFramesToTime(
    outputToNotesPoly(
      frames.map((row) => row.slice()),
      onsets.map((row) => row.slice()),
      params.onsetThreshold,
      params.frameThreshold,
      Math.round(params.minNoteLengthMs / FRAME_DURATION_MS),
      true,
      midiToHz(params.maxPitchMidi),
      midiToHz(params.minPitchMidi),
    ),
  );
  return notes.map((note) => ({
    startSeconds: note.startTimeSeconds,
    durationSeconds: note.durationSeconds,
    pitchMidi: note.pitchMidi,
    amplitude: note.amplitude,
  }));
}

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
