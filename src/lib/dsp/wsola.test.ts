import { describe, expect, it } from "vitest";
import { StreamingWsola, WsolaProcessor } from "./wsola.ts";

const SAMPLE_RATE = 1_000;
const SOURCE_FRAMES = 400;

describe(WsolaProcessor, () => {
  // Different periods and envelopes per channel exercise linked stereo search.
  it.each([0.75, 1.5])("renders finite output at %sx", (playbackRate) => {
    const source = createSource();
    const output = render({ source, playbackRate });

    expect(output[0]).toHaveLength(Math.ceil(SOURCE_FRAMES / playbackRate));
    expect(
      output.every((channel) =>
        channel.every((sample) => Number.isFinite(sample)),
      ),
    ).toBe(true);
    expect(
      output.some((channel) =>
        channel.some((sample) => Math.abs(sample) > 0.01),
      ),
    ).toBe(true);
  });
});

describe(StreamingWsola, () => {
  it.each([0.75, 1.5])(
    "matches finite-source rendering at %sx",
    (playbackRate) => {
      const source = createSource();

      expect(renderStreaming({ source, playbackRate })).toEqual(
        render({ source, playbackRate }),
      );
    },
  );
});

function render({
  source,
  playbackRate,
}: {
  source: readonly Float32Array[];
  playbackRate: number;
}): Float32Array[] {
  const processor = new WsolaProcessor({
    channelData: source,
    sampleRate: SAMPLE_RATE,
    playbackRate,
    windowSeconds: 0.02,
    searchSeconds: 0.03,
  });
  const output = source.map(() => new Float32Array(processor.outputFrames));
  const block = source.map(() => new Float32Array(64));
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

function renderStreaming({
  source,
  playbackRate,
}: {
  source: readonly Float32Array[];
  playbackRate: number;
}): Float32Array[] {
  const processor = new StreamingWsola({
    channelCount: source.length,
    sampleRate: SAMPLE_RATE,
    playbackRate,
    windowSeconds: 0.02,
    searchSeconds: 0.03,
  });
  const output = source.map(() => [] as number[]);
  const block = source.map(() => new Float32Array(17));
  const drain = () => {
    const written = processor.pull(block);
    for (let channel = 0; channel < output.length; channel++) {
      output[channel].push(...block[channel].subarray(0, written));
    }
    return written;
  };
  for (let offset = 0; offset < SOURCE_FRAMES; offset += 13) {
    processor.push(
      source.map((channel) => channel.subarray(offset, offset + 13)),
    );
    while (drain() > 0) {}
  }
  processor.finish();
  while (!processor.isFinished()) {
    expect(drain()).toBeGreaterThan(0);
  }
  return output.map((channel) => Float32Array.from(channel));
}
