import type { CaptureChunk } from "./capture-worklet.ts";

// Search forward far enough to cover expected hardware and driver latency.
const SEARCH_AFTER = 0.32;

export type LatencyMeasurement = {
  offsetSamples: number;
  score: number;
};

export type CalibrationAnalysis = {
  measurements: LatencyMeasurement[];
  recording: Float32Array;
};

export type CalibrationPlayback = {
  clickOffsets: number[];
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
    clickOffsets,
    samples,
    startFrame,
  };
}

/**
 * Reconstructs captured PCM and locates the template near every scheduled click.
 *
 * Captured chunks and expected frames use absolute AudioContext coordinates.
 * Assembly discards samples before `playbackStartFrame`, so recording index zero
 * corresponds to playback sample zero. Measurements report each detected
 * position as a signed sample offset from its scheduled click.
 */
export function analyzeCalibration({
  chunks,
  playback,
  sampleRate,
  template,
}: {
  chunks: CaptureChunk[];
  playback: CalibrationPlayback;
  sampleRate: number;
  template: Float32Array;
}): CalibrationAnalysis {
  const recording = assembleChunks({
    chunks,
    playbackStartFrame: playback.startFrame,
  });
  const measurements = playback.clickOffsets.map((expectedOffset) =>
    findTemplate({
      expectedOffset,
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
 * Assembles capture from playback start into one contiguous sample array.
 *
 * Samples before playback are discarded. Missing ranges remain zero-filled, and
 * later chunks replace overlapping samples. Output index zero corresponds to
 * `playbackStartFrame`.
 */
function assembleChunks({
  chunks,
  playbackStartFrame,
}: {
  chunks: CaptureChunk[];
  playbackStartFrame: number;
}): Float32Array {
  if (chunks.length === 0) {
    throw new Error("No PCM arrived from the selected input.");
  }
  const maxFrame = Math.max(
    ...chunks.map((chunk) => chunk.frameStart + chunk.samples.length),
  );
  const samples = new Float32Array(Math.max(0, maxFrame - playbackStartFrame));
  // Gaps stay zero-filled; later chunks replace overlapping samples.
  for (const chunk of chunks) {
    setArrayClipped(
      samples,
      chunk.samples,
      chunk.frameStart - playbackStartFrame,
    );
  }
  return samples;
}

/**
 * Finds the strongest normalized correlation with `template` near one expected
 * playback-relative offset.
 *
 * Normalization makes the score independent of capture gain. The absolute dot
 * product permits polarity-inverted routes. Only candidate positions containing
 * a complete template are considered, and the search window covers normal
 * hardware latency after the scheduled onset.
 */
function findTemplate({
  expectedOffset,
  recording,
  template,
  sampleRate,
}: {
  expectedOffset: number;
  recording: Float32Array;
  template: Float32Array;
  sampleRate: number;
}): LatencyMeasurement {
  const searchStart = expectedOffset;
  const searchEnd = Math.min(
    recording.length - template.length,
    Math.round(expectedOffset + SEARCH_AFTER * sampleRate),
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
      const value = recording[start + index];
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
  return {
    offsetSamples: bestIndex - expectedOffset,
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

  const raw = new Float32Array(length);
  setArrayClipped(raw, recording, preRoll);
  const compensated = new Float32Array(length);
  setArrayClipped(compensated, raw, -compensationSamples);
  return { reference, raw, compensated };
}

/** Performs `target.set(source, offset)` while clipping either array boundary. */
function setArrayClipped(
  target: Float32Array,
  source: Float32Array,
  offset: number,
) {
  const sourceStart = Math.max(0, -offset);
  const targetStart = Math.max(0, offset);
  const length = Math.min(
    source.length - sourceStart,
    target.length - targetStart,
  );
  if (length > 0) {
    target.set(source.subarray(sourceStart, sourceStart + length), targetStart);
  }
}
