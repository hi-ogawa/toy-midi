import {
  playAudioBuffers,
  createAudioBuffer,
  type AudioPlayback,
} from "../audio-playback.ts";
import { dbToGain } from "../music.ts";
import type { RecorderRuntime } from "../recorder/runtime.ts";
import {
  analyzeCalibration,
  type CalibrationResult,
  createCalibrationPlayback,
  createClickTemplate,
  createPlaybackBuffers,
} from "./calibration.ts";

const CALIBRATION_CLICK_COUNT = 7;
const CALIBRATION_CLICK_INTERVAL = 0.7;
// Begin capture before playback so the worklet is active at the first onset.
const CALIBRATION_LEAD_TIME = 0.55;
// Leave 200 ms before the next probe so each latency search remains isolated.
const CALIBRATION_MAX_LATENCY = 0.5;
// Keep capture running after the final click to include delayed input.
const CALIBRATION_TAIL_TIME = CALIBRATION_MAX_LATENCY;

export type PreviewVariant = "raw" | "compensated";

/** Run one calibration against an input already owned by an audio runtime. */
export async function measureLatency(
  runtime: RecorderRuntime,
  { outputLevel }: { outputLevel: number },
): Promise<CalibrationResult> {
  const { context, captureInput } = runtime;
  if (!captureInput) {
    throw new Error("Start input monitoring before running the click test.");
  }
  await context.resume();
  await captureInput.startCapture();
  let stopped = false;
  try {
    const template = createClickTemplate(context.sampleRate);
    const amplitude = dbToGain(outputLevel);
    const startTime = context.currentTime + CALIBRATION_LEAD_TIME;
    const playback = createCalibrationPlayback({
      amplitude,
      clickCount: CALIBRATION_CLICK_COUNT,
      clickInterval: CALIBRATION_CLICK_INTERVAL,
      sampleRate: context.sampleRate,
      startTime,
      tailTime: CALIBRATION_TAIL_TIME,
      template,
    });
    await playAudioBuffers({
      context,
      buffers: [
        createAudioBuffer(context, playback.samples, context.sampleRate),
      ],
      when: playback.startFrame / context.sampleRate,
    }).finished;
    stopped = true;
    const capture = await captureInput.stopCapture();
    if (capture.chunks.length === 0) {
      throw new Error("No PCM arrived from the selected input.");
    }
    const analysis = analyzeCalibration({
      recording: capture.getSamples({
        startFrame: playback.startFrame,
        endFrame: capture.stopFrame,
      }),
      maxLatency: CALIBRATION_MAX_LATENCY,
      playback,
      sampleRate: context.sampleRate,
      template,
    });
    return {
      analysis,
      playback,
      sampleRate: context.sampleRate,
    };
  } finally {
    if (!stopped) {
      await captureInput.stopCapture();
    }
  }
}

export function createLatencyPreview(context: AudioContext) {
  let playback: AudioPlayback | undefined;
  return {
    async play({
      compensationMs,
      result,
      variant,
    }: {
      compensationMs: number;
      result: CalibrationResult;
      variant: PreviewVariant;
    }) {
      playback?.stop();
      await context.resume();
      const sampleRate = result.sampleRate;
      const compensationSamples = Math.round(
        (compensationMs * sampleRate) / 1000,
      );
      const buffers = createPlaybackBuffers({ result, compensationSamples });
      const audioBuffers = [
        buffers.reference,
        variant === "raw" ? buffers.raw : buffers.compensated,
      ].map((samples) => createAudioBuffer(context, samples, sampleRate));
      const when = context.currentTime + 0.08;
      playback = playAudioBuffers({
        context,
        buffers: audioBuffers,
        gain: 0.58,
        when,
      });
      await playback.finished;
    },
    stop() {
      playback?.stop();
      playback = undefined;
    },
  };
}
