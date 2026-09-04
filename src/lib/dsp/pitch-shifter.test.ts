import { describe, expect, it } from "vitest";
import { StreamingPitchShifter } from "./pitch-shifter.ts";

const SAMPLE_RATE = 8_000;
const TARGET_FREQUENCY = 200;

describe(StreamingPitchShifter, () => {
  it.each([4 / 3, 2])(
    "shifts pitch by %s while preserving duration",
    (pitchRatio) => {
      const input = Float32Array.from({ length: SAMPLE_RATE }, (_, frame) =>
        Math.sin(
          (2 * Math.PI * (TARGET_FREQUENCY / pitchRatio) * frame) / SAMPLE_RATE,
        ),
      );
      const output = render({ input, pitchRatio });

      expect(output).toHaveLength(input.length);
      expect(
        Math.abs(estimateFrequency(output) - TARGET_FREQUENCY),
      ).toBeLessThan(2);
    },
  );
});

function render({
  input,
  pitchRatio,
}: {
  input: Float32Array;
  pitchRatio: number;
}): Float32Array {
  const processor = new StreamingPitchShifter({
    channelCount: 1,
    sampleRate: SAMPLE_RATE,
    pitchRatio,
    windowSeconds: 0.02,
    searchSeconds: 0.03,
  });
  const output = new Float32Array(input.length);
  const block = [new Float32Array(128)];
  let outputOffset = 0;
  const drain = () => {
    const written = processor.pull(block);
    const copied = Math.min(written, output.length - outputOffset);
    output.set(block[0].subarray(0, copied), outputOffset);
    outputOffset += copied;
    return written;
  };
  for (let offset = 0; offset < input.length; offset += 128) {
    processor.push([input.subarray(offset, offset + 128)]);
    while (drain() > 0) {}
  }
  processor.push([new Float32Array(processor.lookaheadFrames)]);
  while (outputOffset < output.length) {
    expect(drain()).toBeGreaterThan(0);
  }
  return output;
}

function estimateFrequency(input: Float32Array): number {
  const start = Math.round(SAMPLE_RATE * 0.1);
  const end = input.length - start;
  let crossings = 0;
  for (let frame = start + 1; frame < end; frame++) {
    if (input[frame - 1] < 0 && 0 <= input[frame]) {
      crossings++;
    }
  }
  return (crossings * SAMPLE_RATE) / (end - start);
}
