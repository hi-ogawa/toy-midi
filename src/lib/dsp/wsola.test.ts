import { describe, expect, it } from "vitest";
import { StreamingWsola, WsolaProcessor } from "./wsola.ts";

const SAMPLE_RATE = 1_000;
const SOURCE_FRAMES = 400;
const WINDOW_SECONDS = 0.02;
const SEARCH_SECONDS = 0.03;

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
  it.each([0.5, 0.75, 1, 1.5, 2])(
    "keeps realtime output continuous after startup at %sx",
    (playbackRate) => {
      const sampleRate = 48_000;
      const inputFrames = 128;
      const outputFrames = Math.round(inputFrames / playbackRate);
      const processor = new StreamingWsola({
        channelCount: 1,
        sampleRate,
        playbackRate,
        windowSeconds: WINDOW_SECONDS,
        searchSeconds: SEARCH_SECONDS,
      });
      const output = [new Float32Array(outputFrames)];
      let started = false;
      const underruns: { timeMs: number; missingFrames: number }[] = [];

      // Feed fixed input chunks and request approximately the stretched output
      // due each callback. Rounding is sufficient for this short startup repro.
      // Unlike renderStreaming, do not concatenate short reads or retry the pull.
      for (let callback = 0; callback < 100; callback++) {
        processor.push([
          Float32Array.from({ length: inputFrames }, (_, frame) =>
            Math.sin(
              (2 * Math.PI * 440 * (callback * inputFrames + frame)) /
                sampleRate,
            ),
          ),
        ]);
        const written = processor.pull(output);
        started ||= written > 0;
        // Initial buffering is allowed, but shortages after audio starts
        // become inserted silence in realtime playback and can sound glitchy.
        if (started && written < outputFrames) {
          underruns.push({
            timeMs: (callback * inputFrames * 1000) / sampleRate,
            missingFrames: outputFrames - written,
          });
        }
      }

      expect(started, "Playback must start within the simulated 267 ms").toBe(
        true,
      );
      expect(underruns, "Silence inserted after playback has started").toEqual(
        [],
      );
    },
  );

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
    windowSeconds: WINDOW_SECONDS,
    searchSeconds: SEARCH_SECONDS,
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
  // StreamingWsola has no finite-source lifecycle. This helper owns the source
  // boundary so it can compare the endless processor with WsolaProcessor.
  const processor = new StreamingWsola({
    channelCount: source.length,
    sampleRate: SAMPLE_RATE,
    playbackRate,
    windowSeconds: WINDOW_SECONDS,
    searchSeconds: SEARCH_SECONDS,
  });

  let outputOffset = 0;
  const outputLength = Math.ceil(SOURCE_FRAMES / playbackRate);
  const output = source.map(() => new Float32Array(outputLength));
  const block = source.map(() => new Float32Array(17));

  // Pull until the processor needs more source input. Input and output block
  // sizes intentionally differ to exercise partial consumption of WSOLA hops.
  const drain = () => {
    const written = processor.pull(block);
    const copied = Math.min(written, outputLength - outputOffset);
    for (let channel = 0; channel < output.length; channel++) {
      output[channel].set(block[channel].subarray(0, copied), outputOffset);
    }
    outputOffset += copied;
    return written;
  };

  // Model a producer supplying small realtime blocks and a consumer draining
  // all output currently available after each push.
  for (let offset = 0; offset < SOURCE_FRAMES; offset += 13) {
    processor.push(
      source.map((channel) => channel.subarray(offset, offset + 13)),
    );
    while (drain() > 0) {}
  }

  // A finite caller supplies silence for the final reference window and
  // candidate search. WSOLA treats it as ordinary future input and remains
  // unaware of completion.
  processor.push(source.map(() => new Float32Array(processor.lookaheadFrames)));

  // Stop at the caller-owned finite boundary.
  while (outputOffset < outputLength) {
    expect(drain()).toBeGreaterThan(0);
  }
  return output;
}
