import { describe, expect, it } from "vitest";
import { WsolaProcessor } from "./wsola.ts";

const SAMPLE_RATE = 1_000;
const SOURCE_FRAMES = 400;

describe(WsolaProcessor, () => {
  // Different periods and envelopes per channel exercise linked stereo search.
  // Pulling in 7- and 64-frame blocks crosses the 10-frame internal hop at
  // different boundaries, so exact equality also checks pull-size independence.
  it.each([0.75, 1.5])(
    "renders deterministic finite output at %sx",
    (playbackRate) => {
      const source = createSource();
      const smallBlocks = render({ source, playbackRate, blockSize: 7 });
      const largeBlocks = render({ source, playbackRate, blockSize: 64 });

      expect(smallBlocks[0]).toHaveLength(
        Math.ceil(SOURCE_FRAMES / playbackRate),
      );
      expect(smallBlocks).toEqual(largeBlocks);
      expect(
        smallBlocks.every((channel) =>
          channel.every((sample) => Number.isFinite(sample)),
        ),
      ).toBe(true);
      expect(
        smallBlocks.some((channel) =>
          channel.some((sample) => Math.abs(sample) > 0.01),
        ),
      ).toBe(true);
    },
  );
});

function render({
  source,
  playbackRate,
  blockSize,
}: {
  source: readonly Float32Array[];
  playbackRate: number;
  blockSize: number;
}): Float32Array[] {
  const processor = new WsolaProcessor({
    channelData: source,
    sampleRate: SAMPLE_RATE,
    playbackRate,
    windowSeconds: 0.02,
    searchSeconds: 0.03,
  });
  const output = source.map(() => new Float32Array(processor.outputFrames));
  const block = source.map(() => new Float32Array(blockSize));
  let offset = 0;
  while (!processor.isFinished()) {
    const written = processor.render(block);
    for (let channel = 0; channel < output.length; channel++) {
      output[channel].set(block[channel].subarray(0, written), offset);
    }
    offset += written;
  }
  return output;
}

function createSource(): Float32Array[] {
  return [
    Float32Array.from(
      { length: SOURCE_FRAMES },
      (_, frame) =>
        Math.sin((2 * Math.PI * frame) / 25) *
        (0.6 + 0.3 * Math.sin((2 * Math.PI * frame) / 137)),
    ),
    Float32Array.from(
      { length: SOURCE_FRAMES },
      (_, frame) =>
        Math.sin((2 * Math.PI * frame) / 31 + 0.4) *
        (0.5 + 0.2 * Math.sin((2 * Math.PI * frame) / 113)),
    ),
  ];
}
