import { dbToGain } from "../music";
import type { CaptureInput } from "../recorder/capture-input";
import {
  analyzeCalibration,
  type CalibrationResult,
  createCalibrationPlayback,
  createClickTemplate,
  createPlaybackBuffers,
} from "./calibration";

const CLICK_COUNT = 7;
const CLICK_INTERVAL = 0.7;
// Begin capture before playback so the worklet is active at the first onset.
const LEAD_TIME = 0.55;
// Leave 200 ms before the next probe and capture through the final tail.
const MAX_LATENCY = 0.5;

export type PreviewVariant = "raw" | "compensated";

/** Run one calibration against an input already owned by an audio runtime. */
export async function measureLatency({
  context,
  input,
  outputLevel,
}: {
  context: AudioContext;
  input: CaptureInput;
  outputLevel: number;
}): Promise<CalibrationResult> {
  await context.resume();
  const chunks: Parameters<typeof analyzeCalibration>[0]["chunks"] = [];
  const unsubscribe = input.subscribeSamples((chunk) => chunks.push(chunk));
  let stopped = false;
  try {
    await input.startCapture();
    const template = createClickTemplate(context.sampleRate);
    const playback = createCalibrationPlayback({
      amplitude: dbToGain(outputLevel),
      clickCount: CLICK_COUNT,
      clickInterval: CLICK_INTERVAL,
      sampleRate: context.sampleRate,
      startTime: context.currentTime + LEAD_TIME,
      tailTime: MAX_LATENCY,
      template,
    });
    await playBuffers({
      context,
      buffers: [toAudioBuffer(context, playback.samples, context.sampleRate)],
      when: playback.startFrame / context.sampleRate,
    });
    await input.stopCapture();
    stopped = true;
    return {
      analysis: analyzeCalibration({
        chunks,
        maxLatency: MAX_LATENCY,
        playback,
        sampleRate: context.sampleRate,
        template,
      }),
      playback,
      sampleRate: context.sampleRate,
    };
  } finally {
    try {
      if (!stopped) {
        await input.stopCapture();
      }
    } finally {
      unsubscribe();
    }
  }
}

export async function auditionLatency({
  compensationMs,
  context,
  result,
  signal,
  variant,
}: {
  compensationMs: number;
  context: AudioContext;
  result: CalibrationResult;
  signal: AbortSignal;
  variant: PreviewVariant;
}) {
  signal.throwIfAborted();
  await context.resume();
  signal.throwIfAborted();
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
      for (let index = 0; index < data.length; index++) {
        data[index] *= 0.58;
      }
      return buffer;
    }),
    signal,
    when: context.currentTime + 0.08,
  });
}

function playBuffers({
  buffers,
  context,
  signal,
  when,
}: {
  buffers: AudioBuffer[];
  context: AudioContext;
  signal?: AbortSignal;
  when: number;
}) {
  return new Promise<void>((resolve, reject) => {
    const sources: AudioBufferSourceNode[] = [];
    const finish = () => {
      signal?.removeEventListener("abort", finish);
      for (const source of sources) {
        source.onended = null;
        try {
          source.stop();
        } catch {}
        source.disconnect();
      }
      resolve();
    };
    if (signal?.aborted) {
      resolve();
      return;
    }
    signal?.addEventListener("abort", finish, { once: true });
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
      signal?.removeEventListener("abort", finish);
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
