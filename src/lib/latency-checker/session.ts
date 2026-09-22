import { dbToGain } from "../music";
import type { RecorderRuntime } from "../recorder/runtime";
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
export async function measureLatency(
  runtime: RecorderRuntime,
  { outputLevel }: { outputLevel: number },
): Promise<CalibrationResult> {
  const { context, captureInput: input } = runtime;
  if (!input) {
    throw new Error("Start input monitoring before running the click test.");
  }
  await context.resume();
  await input.startCapture();
  let stopped = false;
  try {
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
    }).finished;
    stopped = true;
    const capture = await input.stopCapture();
    if (capture.chunks.length === 0) {
      throw new Error("No PCM arrived from the selected input.");
    }
    return {
      analysis: analyzeCalibration({
        recording: capture.getSamples({
          startFrame: playback.startFrame,
          endFrame: capture.stopFrame,
        }),
        maxLatency: MAX_LATENCY,
        playback,
        sampleRate: context.sampleRate,
        template,
      }),
      playback,
      sampleRate: context.sampleRate,
    };
  } finally {
    if (!stopped) {
      await input.stopCapture();
    }
  }
}

export function createLatencyPreview(context: AudioContext) {
  let playback: ReturnType<typeof playBuffers> | undefined;
  return {
    play({
      compensationMs,
      result,
      variant,
    }: {
      compensationMs: number;
      result: CalibrationResult;
      variant: PreviewVariant;
    }) {
      playback?.stop();
      const buffers = createPlaybackBuffers({
        result,
        compensationSamples: Math.round(
          (compensationMs * result.sampleRate) / 1000,
        ),
      });
      playback = playBuffers({
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
        when: context.currentTime + 0.08,
      });
      return Promise.all([context.resume(), playback.finished]);
    },
    stop() {
      playback?.stop();
      playback = undefined;
    },
  };
}

function playBuffers({
  buffers,
  context,
  when,
}: {
  buffers: AudioBuffer[];
  context: AudioContext;
  when: number;
}) {
  const sources: AudioBufferSourceNode[] = [];
  const finished = Promise.withResolvers<void>();
  const stop = () => {
    for (const source of sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    sources.length = 0;
    finished.resolve();
  };
  let remaining = buffers.length;
  try {
    for (const buffer of buffers) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (--remaining === 0) {
          stop();
        }
      };
      source.start(when);
      sources.push(source);
    }
  } catch (error) {
    stop();
    throw error;
  }
  return { finished: finished.promise, stop };
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
