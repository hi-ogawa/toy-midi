import { dbToGain } from "../music";
import {
  analyzeCalibration,
  type CalibrationResult,
  createCalibrationPlayback,
  createClickTemplate,
  createPlaybackBuffers,
} from "./calibration";
import type { CaptureChunk } from "./capture-worklet";

/** Uses an existing input and context; owns only this run's capture and sources. */
export async function measureLatency({
  context,
  capture,
  outputLevel,
  signal,
}: {
  context: AudioContext;
  capture: {
    start: () => Promise<unknown>;
    stop: () => Promise<unknown>;
    subscribe: (listener: (chunk: CaptureChunk) => void) => () => void;
  };
  outputLevel: number;
  signal: AbortSignal;
}): Promise<CalibrationResult> {
  signal.throwIfAborted();
  await context.resume();
  signal.throwIfAborted();
  const chunks: CaptureChunk[] = [];
  const unsubscribe = capture.subscribe((chunk) => chunks.push(chunk));
  let stopped = false;
  try {
    // Start capture before scheduling the first probe, and retain the stop flush.
    await capture.start();
    signal.throwIfAborted();
    const template = createClickTemplate(context.sampleRate);
    const playback = createCalibrationPlayback({
      amplitude: dbToGain(outputLevel),
      clickCount: 7,
      clickInterval: 0.7,
      sampleRate: context.sampleRate,
      startTime: context.currentTime + 0.55,
      tailTime: 0.5,
      template,
    });
    await playBuffers({
      context,
      buffers: [toAudioBuffer(context, playback.samples, context.sampleRate)],
      when: playback.startFrame / context.sampleRate,
      signal,
    });
    signal.throwIfAborted();
    await capture.stop();
    stopped = true;
    signal.throwIfAborted();
    return {
      analysis: analyzeCalibration({
        chunks,
        maxLatency: 0.5,
        playback,
        sampleRate: context.sampleRate,
        template,
      }),
      playback,
      sampleRate: context.sampleRate,
    };
  } finally {
    // Stop also on cancellation/start failure, and keep the listener until the
    // worklet acknowledges the final batch. A disposed input may reject stop.
    try {
      if (!stopped) {
        await capture.stop();
      }
    } finally {
      unsubscribe();
    }
  }
}

export async function auditionCalibration({
  context,
  result,
  variant,
  compensationMs,
  signal,
}: {
  context: AudioContext;
  result: CalibrationResult;
  variant: "raw" | "compensated";
  compensationMs: number;
  signal: AbortSignal;
}) {
  if (signal.aborted) {
    return;
  }
  await context.resume();
  if (signal.aborted) {
    return;
  }
  const buffers = createPlaybackBuffers({
    result,
    compensationSamples: Math.round(
      (compensationMs * result.sampleRate) / 1000,
    ),
  });
  await playBuffers({
    context,
    buffers: [
      buffers.reference,
      variant === "raw" ? buffers.raw : buffers.compensated,
    ].map((samples) => {
      const buffer = toAudioBuffer(context, samples, result.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] *= 0.58;
      }
      return buffer;
    }),
    when: context.currentTime + 0.08,
    signal,
  });
}

function playBuffers({
  context,
  buffers,
  when,
  signal,
}: {
  context: AudioContext;
  buffers: AudioBuffer[];
  when: number;
  signal: AbortSignal;
}) {
  return new Promise<void>((resolve, reject) => {
    const sources: AudioBufferSourceNode[] = [];
    const finish = () => {
      signal.removeEventListener("abort", finish);
      for (const source of sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
      resolve();
    };
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", finish, { once: true });
    let remaining = buffers.length;
    try {
      for (const buffer of buffers) {
        const source = context.createBufferSource();
        sources.push(source);
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => {
          if (--remaining === 0) {
            finish();
          }
        };
        source.start(when);
      }
    } catch (error) {
      // Clean up partial playback before rejecting the caller.
      signal.removeEventListener("abort", finish);
      for (const source of sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
      reject(error);
    }
  });
}

function toAudioBuffer(
  context: AudioContext,
  samples: Float32Array,
  sampleRate: number,
) {
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}
