const SEARCH_BEFORE = 0.05;
const SEARCH_AFTER = 0.32;

export type CaptureChunk = {
  frameStart: number;
  samples: Float32Array;
};

export type LatencyMeasurement = {
  detectedFrame: number;
  offsetSamples: number;
  score: number;
};

export type CalibrationRecording = {
  amplitude: number;
  expectedFrames: number[];
  minFrame: number;
  recorded: Float32Array;
  sampleRate: number;
  template: Float32Array;
};

export function createClickTemplate(sampleRate: number) {
  const length = Math.max(64, Math.round(sampleRate * 0.002));
  const samples = new Float32Array(length);
  let state = 0x51f15e;
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const sign = state & 0x80000000 ? 1 : -1;
    const envelope = Math.sin((Math.PI * (index + 0.5)) / length);
    samples[index] = sign * envelope;
  }
  return samples;
}

export function assembleChunks(chunks: CaptureChunk[]) {
  if (chunks.length === 0) {
    throw new Error("No PCM arrived from the selected input.");
  }
  const minFrame = Math.min(...chunks.map((chunk) => chunk.frameStart));
  const maxFrame = Math.max(
    ...chunks.map((chunk) => chunk.frameStart + chunk.samples.length),
  );
  const samples = new Float32Array(maxFrame - minFrame);
  for (const chunk of chunks) {
    samples.set(chunk.samples, chunk.frameStart - minFrame);
  }
  return { minFrame, samples };
}

export function findTemplate({
  recorded,
  minFrame,
  expectedFrame,
  template,
  sampleRate,
}: {
  recorded: Float32Array;
  minFrame: number;
  expectedFrame: number;
  template: Float32Array;
  sampleRate: number;
}): LatencyMeasurement {
  const searchStart = Math.max(
    0,
    Math.round(expectedFrame - SEARCH_BEFORE * sampleRate - minFrame),
  );
  const searchEnd = Math.min(
    recorded.length - template.length,
    Math.round(expectedFrame + SEARCH_AFTER * sampleRate - minFrame),
  );
  let templateEnergy = 0;
  for (const value of template) {
    templateEnergy += value * value;
  }
  let bestScore = -Infinity;
  let bestIndex = searchStart;
  for (let start = searchStart; start <= searchEnd; start++) {
    let dot = 0;
    let inputEnergy = 0;
    for (let index = 0; index < template.length; index++) {
      const value = recorded[start + index];
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
  const detectedFrame = minFrame + bestIndex;
  return {
    detectedFrame,
    offsetSamples: detectedFrame - expectedFrame,
    score: bestScore,
  };
}

export function createPlaybackBuffers({
  result,
  compensationSamples,
}: {
  result: CalibrationRecording;
  compensationSamples: number;
}) {
  const {
    sampleRate,
    expectedFrames,
    minFrame,
    recorded,
    template,
    amplitude,
  } = result;
  const preRoll = Math.round(sampleRate * 0.1);
  const postRoll = Math.round(sampleRate * 0.35);
  const windowStart = expectedFrames[0] - preRoll;
  const windowEnd = expectedFrames.at(-1)! + template.length + postRoll;
  const length = windowEnd - windowStart;
  const reference = new Float32Array(length);
  const raw = new Float32Array(length);
  for (const expectedFrame of expectedFrames) {
    const start = expectedFrame - windowStart;
    for (let index = 0; index < template.length; index++) {
      reference[start + index] += template[index] * amplitude;
    }
  }
  for (let index = 0; index < length; index++) {
    const sourceIndex = windowStart + index - minFrame;
    if (sourceIndex >= 0 && sourceIndex < recorded.length) {
      raw[index] = recorded[sourceIndex];
    }
  }
  const compensated = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const sourceIndex = index + compensationSamples;
    if (sourceIndex >= 0 && sourceIndex < raw.length) {
      compensated[index] = raw[sourceIndex];
    }
  }
  return { reference, raw, compensated };
}
