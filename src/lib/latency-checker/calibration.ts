import type { CaptureChunk } from "./capture-worklet.ts";

// Search forward far enough to cover expected hardware and driver latency.
const SEARCH_AFTER = 0.32;

export type LatencyMeasurement = {
  detectedFrame: number;
  offsetSamples: number;
  score: number;
};

export type CalibrationRecording = {
  samples: Float32Array;
  startFrame: number;
};

export type CalibrationAnalysis = {
  measurements: LatencyMeasurement[];
  recording: CalibrationRecording;
};

export type CalibrationPlayback = {
  expectedFrames: number[];
  samples: Float32Array;
  startFrame: number;
};

export type CalibrationResult = {
  analysis: CalibrationAnalysis;
  playback: CalibrationPlayback;
  sampleRate: number;
};

/**
 * Builds a synthetic measurement probe, not a musical metronome click.
 *
 * Deterministic pseudo-random signs produce a narrow correlation peak, while the
 * sine envelope limits boundary discontinuities. The exact emitted samples are
 * retained in the capture result and reused as the detector template.
 */
export function createClickTemplate(sampleRate: number) {
  // A 2 ms click is brief but carries enough samples for a distinct correlation
  // peak. Keep at least 64 samples so low sample rates still have enough pattern.
  const length = Math.max(64, Math.round(sampleRate * 0.002));
  const samples = new Float32Array(length);
  // Numerical Recipes 32-bit LCG; a fixed seed makes the probe reproducible.
  let state = 0x51f15e;
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const sign = state & 0x80000000 ? 1 : -1;
    const envelope = Math.sin((Math.PI * (index + 0.5)) / length);
    samples[index] = sign * envelope;
  }
  return samples;
}

/**
 * Builds the emitted click signal and its expected AudioContext frame onsets.
 *
 * Relative click offsets drive both signal placement and expected frames, so
 * playback and analysis cannot disagree about rounding. The output continues
 * through the configured silence after the final click onset.
 */
export function createCalibrationPlayback({
  amplitude,
  clickCount,
  clickInterval,
  sampleRate,
  startTime,
  tailTime,
  template,
}: {
  amplitude: number;
  clickCount: number;
  clickInterval: number;
  sampleRate: number;
  startTime: number;
  tailTime: number;
  template: Float32Array;
}): CalibrationPlayback {
  // Round each onset independently to avoid accumulating interval error.
  const startFrame = Math.round(startTime * sampleRate);
  const clickOffsets = Array.from({ length: clickCount }, (_, index) =>
    Math.round(index * clickInterval * sampleRate),
  );
  const finalClickEnd = clickOffsets.at(-1)! + template.length;
  const tailEnd = clickOffsets.at(-1)! + Math.ceil(tailTime * sampleRate);
  const samples = new Float32Array(Math.max(tailEnd, finalClickEnd));
  for (const start of clickOffsets) {
    for (let index = 0; index < template.length; index++) {
      samples[start + index] += template[index] * amplitude;
    }
  }
  return {
    expectedFrames: clickOffsets.map((offset) => startFrame + offset),
    samples,
    startFrame,
  };
}

/**
 * Reconstructs captured PCM and locates the template near every scheduled click.
 *
 * Chunk and expected-frame coordinates are absolute AudioContext frame numbers.
 * The assembled recording retains its absolute start frame. Measurements remain
 * in absolute frames and report signed offsets relative to their corresponding
 * expected frame.
 */
export function analyzeCalibration({
  chunks,
  expectedFrames,
  sampleRate,
  template,
}: {
  chunks: CaptureChunk[];
  expectedFrames: number[];
  sampleRate: number;
  template: Float32Array;
}): CalibrationAnalysis {
  // Keep startFrame so contiguous array indices retain absolute meaning.
  const recording = assembleChunks(chunks);
  const measurements = expectedFrames.map((expectedFrame) =>
    findTemplate({
      expectedFrame,
      recording,
      template,
      sampleRate,
    }),
  );
  return {
    measurements,
    recording,
  };
}

/**
 * Assembles AudioWorklet render chunks into one contiguous sample array.
 *
 * Missing frame ranges remain zero-filled. If chunks overlap, later entries in
 * the input replace earlier samples. `startFrame` is the absolute AudioContext
 * frame represented by output index zero.
 */
function assembleChunks(chunks: CaptureChunk[]): CalibrationRecording {
  if (chunks.length === 0) {
    throw new Error("No PCM arrived from the selected input.");
  }
  const startFrame = Math.min(...chunks.map((chunk) => chunk.frameStart));
  const maxFrame = Math.max(
    ...chunks.map((chunk) => chunk.frameStart + chunk.samples.length),
  );
  const samples = new Float32Array(maxFrame - startFrame);
  // Gaps stay zero-filled; later chunks replace overlapping samples.
  for (const chunk of chunks) {
    samples.set(chunk.samples, chunk.frameStart - startFrame);
  }
  return { samples, startFrame };
}

/**
 * Finds the strongest normalized correlation with `template` near one expected
 * absolute frame.
 *
 * Normalization makes the score independent of capture gain. The absolute dot
 * product permits polarity-inverted routes. Only candidate positions containing
 * a complete template are considered, and the search window covers normal
 * hardware latency after the scheduled onset.
 */
function findTemplate({
  expectedFrame,
  recording,
  template,
  sampleRate,
}: {
  expectedFrame: number;
  recording: CalibrationRecording;
  template: Float32Array;
  sampleRate: number;
}): LatencyMeasurement {
  // Translate absolute frames into recording indices and require full windows.
  const searchStart = Math.max(0, expectedFrame - recording.startFrame);
  const searchEnd = Math.min(
    recording.samples.length - template.length,
    Math.round(
      expectedFrame + SEARCH_AFTER * sampleRate - recording.startFrame,
    ),
  );
  let templateEnergy = 0;
  for (const value of template) {
    templateEnergy += value * value;
  }
  let bestScore = -Infinity;
  let bestIndex = searchStart;
  // Normalize gain and accept polarity inversion through the absolute dot.
  for (let start = searchStart; start <= searchEnd; start++) {
    let dot = 0;
    let inputEnergy = 0;
    for (let index = 0; index < template.length; index++) {
      const value = recording.samples[start + index];
      dot += value * template[index];
      inputEnergy += value * value;
    }
    const score =
      inputEnergy > 1e-12
        ? Math.abs(dot) / Math.sqrt(inputEnergy * templateEnergy)
        : 0;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = start;
    }
  }
  const detectedFrame = recording.startFrame + bestIndex;
  return {
    detectedFrame,
    offsetSamples: detectedFrame - expectedFrame,
    score: bestScore,
  };
}

/**
 * Builds aligned mono buffers for audible comparison of calibration results.
 *
 * `reference` contains the emitted probe, `raw` aligns the captured recording to
 * playback, and `compensated` advances raw audio by `compensationSamples`.
 * Positive compensation therefore moves a late captured onset toward its
 * scheduled reference onset. Samples outside available capture data remain zero.
 */
export function createPlaybackBuffers({
  result,
  compensationSamples,
}: {
  result: CalibrationResult;
  compensationSamples: number;
}) {
  const {
    analysis: { recording },
    playback,
    sampleRate,
  } = result;
  const preRoll = Math.round(sampleRate * 0.1);
  const postRoll = Math.round(sampleRate * 0.35);
  const length = preRoll + playback.samples.length + postRoll;
  const reference = new Float32Array(length);
  reference.set(playback.samples, preRoll);

  const playbackStartIndex = playback.startFrame - recording.startFrame;
  const raw = shiftSamples({
    input: recording.samples,
    length,
    offset: playbackStartIndex - preRoll,
  });
  const compensated = shiftSamples({
    input: raw,
    length,
    offset: compensationSamples,
  });
  return { reference, raw, compensated };
}

/** Copies samples with an integer offset, leaving unavailable output as zero. */
function shiftSamples({
  input,
  length,
  offset,
}: {
  input: Float32Array;
  length: number;
  offset: number;
}) {
  const output = new Float32Array(length);
  const sourceStart = Math.max(0, offset);
  const outputStart = Math.max(0, -offset);
  const copyLength = Math.min(
    input.length - sourceStart,
    output.length - outputStart,
  );
  if (copyLength > 0) {
    output.set(
      input.subarray(sourceStart, sourceStart + copyLength),
      outputStart,
    );
  }
  return output;
}
