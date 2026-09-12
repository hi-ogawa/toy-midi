import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PitchShifterCommand } from "./pitch-shifter-node.ts";

const SAMPLE_RATE = 48_000;
const BLOCK_FRAMES = 128;

interface Processor {
  port: { onmessage: (event: { data: PitchShifterCommand }) => void };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

let Processor: new (options: AudioWorkletNodeOptions) => Processor;

beforeAll(async () => {
  vi.stubGlobal("sampleRate", SAMPLE_RATE);
  vi.stubGlobal(
    "AudioWorkletProcessor",
    class {
      readonly port = {};
    },
  );
  vi.stubGlobal(
    "registerProcessor",
    (_name: string, processor: typeof Processor) => {
      Processor = processor;
    },
  );
  await import("./pitch-shifter-worklet.ts");
});

afterAll(() => vi.unstubAllGlobals());

describe("pitch-shifter worklet controls", () => {
  it("bypasses at unity without latency, including after a ratio change", () => {
    const processor = createProcessor(1);
    const input = [
      Float32Array.from(
        { length: BLOCK_FRAMES },
        (_, frame) => frame / BLOCK_FRAMES,
      ),
      Float32Array.from(
        { length: BLOCK_FRAMES },
        (_, frame) => -frame / BLOCK_FRAMES,
      ),
    ];
    expect(process(processor, input)).toEqual(input);
    processor.port.onmessage({
      data: { type: "setPitchRatio", pitchRatio: 0.75 },
    });
    renderTone(processor);
    processor.port.onmessage({
      data: { type: "setPitchRatio", pitchRatio: 1 },
    });
    expect(process(processor, input)).toEqual(input);
    expect(process(processor, [])).toEqual([
      new Float32Array(BLOCK_FRAMES),
      new Float32Array(BLOCK_FRAMES),
    ]);
  });

  it("changes pitch on the same processor", () => {
    const processor = createProcessor(1);
    for (const pitchRatio of [0.75, 1.5]) {
      processor.port.onmessage({ data: { type: "setPitchRatio", pitchRatio } });
      const output = renderTone(processor).slice(SAMPLE_RATE / 4);
      let crossings = 0;
      for (let frame = 1; frame < output.length; frame++) {
        if (output[frame - 1] <= 0 && output[frame] > 0) {
          crossings++;
        }
      }
      const frequency = (crossings * SAMPLE_RATE) / output.length;
      expect(frequency).toBeCloseTo(440 * pitchRatio, -1);
    }
  });

  it.each<PitchShifterCommand>([
    { type: "reset" },
    { type: "setPitchRatio", pitchRatio: 0.75 },
    { type: "setPitchRatio", pitchRatio: 1.5 },
  ])("clears buffered audio on $type", (command) => {
    const processor = createProcessor(0.75);
    renderTone(processor);
    // A running shifter has an audible tail before reset.
    expect(
      process(processor, [
        new Float32Array(BLOCK_FRAMES),
        new Float32Array(BLOCK_FRAMES),
      ])[0].some((value) => Math.abs(value) > 0.01),
    ).toBe(true);
    processor.port.onmessage({ data: command });
    for (let block = 0; block < 100; block++) {
      for (const channel of process(processor, [])) {
        expect(channel.every((value) => value === 0)).toBe(true);
      }
    }
  });
});

function createProcessor(pitchRatio: number): Processor {
  return new Processor({ processorOptions: { channelCount: 2, pitchRatio } });
}

function process(processor: Processor, input: Float32Array[]): Float32Array[] {
  const output = [
    new Float32Array(BLOCK_FRAMES),
    new Float32Array(BLOCK_FRAMES),
  ];
  processor.process([input], [output]);
  return output;
}

function renderTone(processor: Processor): Float32Array {
  const blocks = Math.ceil(SAMPLE_RATE / BLOCK_FRAMES);
  const result = new Float32Array(blocks * BLOCK_FRAMES);
  for (let block = 0; block < blocks; block++) {
    const input = Float32Array.from(
      { length: BLOCK_FRAMES },
      (_, frame) =>
        0.2 *
        Math.sin(
          (2 * Math.PI * 440 * (block * BLOCK_FRAMES + frame)) / SAMPLE_RATE,
        ),
    );
    result.set(process(processor, [input, input])[0], block * BLOCK_FRAMES);
  }
  return result;
}
