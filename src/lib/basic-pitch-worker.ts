import {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
} from "@spotify/basic-pitch";
import modelWeightsUrl from "@spotify/basic-pitch/model/group1-shard1of1.bin?url";
import modelJsonUrl from "@spotify/basic-pitch/model/model.json?url";
import * as tf from "@tensorflow/tfjs";
import type { TranscribedNote, TranscribeParams } from "./basic-pitch";
import { registerWorkerRpcHandlers } from "./rpc/worker.ts";

function main(): void {
  registerWorkerRpcHandlers(new BasicPitchWorkerHandlers());
}

// Model output frame rate: 22,050 Hz sample rate / 256 FFT hop
const FRAME_DURATION_MS = 1000 / (22050 / 256);

// tfjs 3.x PlatformBrowser.setTimeoutCustom references the undeclared
// `window` before it can take its own setTimeout fallback, which throws in
// workers and stalls the WebGL backend's fence polling (inference hangs at
// 0%). Shadow the prototype method with the fallback it meant to use.
// CI investigation: browser inference consistently hangs at "Analyzing 0%"
// in headless Chromium on standard GitHub Actions Ubuntu runners, while the
// same Playwright test finishes in roughly 8-10 seconds locally. The 0% is a
// real Basic Pitch progress callback emitted immediately before its first
// model frame. By that point the worker started, received the transferred PCM,
// prepared the input tensor, and posted a message back to the main thread.
//
// Basic Pitch then runs GraphModel.execute and downloads the output tensors
// with Tensor.array(). A browser worker is considered a browser environment by
// tfjs, so WebGL has a higher backend priority than CPU when OffscreenCanvas
// can create a context. Standard GitHub-hosted runners have no hardware GPU;
// Chromium therefore uses a software graphics path. tfjs 3.21 waits for output
// through a WebGL fence and polls it without a deadline. On the CI runner that
// fence can remain unsignaled indefinitely, so the tensor promise never
// resolves or rejects. This is why the try/catch below, the client's Worker
// "error"/"messageerror" handlers, and the panel's mutation error UI receive
// nothing. Increasing the Playwright timeout only delays the same failure.
//
// Upstream Basic Pitch 1.0.1 does not test browser workers or headless WebGL;
// its CI runs under Node with tfjs-node. Upstream reports also describe WebGL
// inference remaining stuck on other software/driver combinations. Moving
// inference to a worker protects the UI thread but does not isolate it from
// Chromium's shared GPU process.
//
// References:
// - Basic Pitch inference loop and first-frame progress callback:
//   https://github.com/spotify/basic-pitch-ts/blob/v1.0.1/src/inference.ts
// - Basic Pitch worker support discussion:
//   https://github.com/spotify/basic-pitch-ts/issues/19
// - Basic Pitch WebGL inference hang report and WASM workaround:
//   https://github.com/spotify/basic-pitch-ts/issues/22
// - tfjs WebGL worker/OffscreenCanvas support:
//   https://github.com/tensorflow/tfjs/issues/1506
// - tfjs worker WebGL still sharing GPU resources with the UI:
//   https://github.com/tensorflow/tfjs/issues/5454
// - Chromium headless GPU requirements:
//   https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/using-gpu-hardware-in-headless-chrome.md
// - Chromium SwiftShader modes and launch flags:
//   https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
//
// TODO: make CI inference deterministic instead of relying on implicit
// headless WebGL selection. Evaluated options, in reliability order:
// - select tfjs CPU before constructing BasicPitch (slow but deterministic);
// - add and select tfjs WASM, including explicit worker WASM asset paths;
// - launch CI Chromium with explicit SwANGLE/SwiftShader flags and verify the
//   active renderer, accepting that these flags are Chromium-version-sensitive;
// - mock browser inference in the regular E2E suite and separately verify the
//   real model through the Node Basic Pitch CLI.
// TODO: add an application-level analysis watchdog that terminates and clears
// the worker, then surfaces a timeout in the panel. It cannot repair the GPU
// stall, but it prevents users from seeing an infinite progress indicator and
// allows a retry to create a fresh worker.
tf.env().platform.setTimeoutCustom = (fn: () => void, delay: number) => {
  setTimeout(fn, delay);
};

// The npm package ships the model files, but Vite fingerprints them as
// separate assets, which breaks model.json's relative reference to the
// weight shard. weightUrlConverter remaps it to the emitted asset URL.
let basicPitch: Promise<BasicPitch> | undefined;

// Raw activations for the most recently analyzed audio asset, so decode
// requests rerun only the cheap extraction below. Kept worker-side because
// the matrices are large (~7 MB per song minute); a single entry bounds
// memory. Contours are dropped since pitch bends are not imported.
let cache: {
  cacheKey: string;
  frames: number[][];
  onsets: number[][];
} | null = null;

export class BasicPitchWorkerHandlers {
  async analyze({
    cacheKey,
    backend,
    pcm,
    onProgress,
  }: {
    cacheKey: string;
    backend?: string;
    pcm?: Float32Array;
    onProgress: (percent: number) => void;
  }): Promise<{
    backend: string;
  }> {
    basicPitch ??= initializeBasicPitch(backend);
    const initializedBasicPitch = await basicPitch;
    if (cache?.cacheKey !== cacheKey) {
      if (!pcm) {
        throw new Error("Missing PCM for unanalyzed audio");
      }
      const frames: number[][] = [];
      const onsets: number[][] = [];
      await initializedBasicPitch.evaluateModel(
        pcm,
        (chunkFrames, chunkOnsets) => {
          frames.push(...chunkFrames);
          onsets.push(...chunkOnsets);
        },
        onProgress,
      );
      cache = { cacheKey, frames, onsets };
    }
    return { backend: tf.getBackend() };
  }

  async decode({
    cacheKey,
    params,
  }: {
    cacheKey: string;
    params: TranscribeParams;
  }): Promise<TranscribedNote[]> {
    if (cache?.cacheKey !== cacheKey) {
      throw new Error("Audio not analyzed");
    }
    return decodeNotes(cache, params);
  }
}

async function initializeBasicPitch(backend?: string): Promise<BasicPitch> {
  if (backend) {
    if (!(await tf.setBackend(backend))) {
      throw new Error(`Failed to initialize tfjs backend: ${backend}`);
    }
  }
  await tf.ready();
  return new BasicPitch(
    tf.loadGraphModel(modelJsonUrl, {
      weightUrlConverter: async () => modelWeightsUrl,
    }),
  );
}

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

main();
