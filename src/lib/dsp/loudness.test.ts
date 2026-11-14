import { describe, expect, it } from "vitest";
import { dbToGain } from "../music";
import { LoudnessMeter } from "./loudness";

const SAMPLE_RATE = 48000;

// Cases from EBU Tech 3341 (integrated loudness and true peak) and EBU Tech
// 3342 (loudness range), with stereo sines whose levels are peak dBFS.
describe(LoudnessMeter, () => {
  it.each([
    { name: "a steady sine at -23 dBFS", sections: [[-23, 20]], expected: -23 },
    { name: "a steady sine at -33 dBFS", sections: [[-33, 20]], expected: -33 },
    {
      name: "quiet sections under the relative gate",
      sections: [
        [-36, 10],
        [-23, 60],
        [-36, 10],
      ],
      expected: -23,
    },
    {
      name: "silence under the absolute gate",
      sections: [
        [-72, 10],
        [-36, 10],
        [-23, 60],
        [-36, 10],
        [-72, 10],
      ],
      expected: -23,
    },
    {
      name: "sections above the relative gate",
      sections: [
        [-26, 20],
        [-20, 20.1],
        [-26, 20],
      ],
      expected: -23,
    },
  ])("measures integrated loudness of $name", ({ sections, expected }) => {
    const { integrated } = measure(createSineSections(sections));
    expect(integrated).toBeGreaterThan(expected - 0.1);
    expect(integrated).toBeLessThan(expected + 0.1);
  });

  it.each([
    { levels: [-20, -30], expected: 10 },
    { levels: [-20, -15], expected: 5 },
    { levels: [-40, -20], expected: 20 },
    { levels: [-50, -35, -20, -35, -50], expected: 15 },
  ])("measures a loudness range of $expected LU", ({ levels, expected }) => {
    const { loudnessRange } = measure(
      createSineSections(levels.map((level) => [level, 20])),
    );
    expect(loudnessRange).toBeGreaterThan(expected - 1);
    expect(loudnessRange).toBeLessThan(expected + 1);
  });

  it("finds the true peak between samples", () => {
    // At a quarter of the sample rate with a 45° phase, every sample lands
    // 3 dB below the crest.
    const channels = createSineSections([[-6, 1]], {
      frequency: SAMPLE_RATE / 4,
      phase: Math.PI / 4,
    });
    expect(Math.max(...channels[0]!)).toBeCloseTo(dbToGain(-9), 2);
    const { truePeak } = measure(channels);
    expect(truePeak).toBeGreaterThan(-6.4);
    expect(truePeak).toBeLessThan(-5.8);
  });

  it("reports silence as -Infinity loudness and peak", () => {
    expect(measure(createSineSections([[-Infinity, 5]]))).toEqual({
      integrated: -Infinity,
      truePeak: -Infinity,
      loudnessRange: 0,
    });
  });

  it("measures the same whether the signal arrives at once or in render quanta", () => {
    const channels = createSineSections([
      [-30, 4],
      [-18, 3.05],
    ]);
    const meter = new LoudnessMeter({
      sampleRate: SAMPLE_RATE,
      channelCount: 2,
    });
    for (let start = 0; start < channels[0]!.length; start += 128) {
      meter.process(
        channels.map((channel) => channel.subarray(start, start + 128)),
      );
    }
    expect(meter.measure()).toEqual(measure(channels));
  });
});

function measure(channels: Float32Array[]) {
  const meter = new LoudnessMeter({ sampleRate: SAMPLE_RATE, channelCount: 2 });
  meter.process(channels);
  return meter.measure();
}

/** Stereo sine, one [peak dBFS, seconds] pair per section, continuous in phase. */
function createSineSections(
  sections: number[][],
  { frequency = 1000, phase = 0 }: { frequency?: number; phase?: number } = {},
): Float32Array[] {
  const frameCount = sections.reduce(
    (sum, [, seconds]) => sum + Math.round(seconds! * SAMPLE_RATE),
    0,
  );
  const samples = new Float32Array(frameCount);
  let frame = 0;
  for (const [levelDb, seconds] of sections) {
    const amplitude = dbToGain(levelDb!);
    const end = frame + Math.round(seconds! * SAMPLE_RATE);
    for (; frame < end; frame++) {
      samples[frame] =
        amplitude *
        Math.sin((2 * Math.PI * frequency * frame) / SAMPLE_RATE + phase);
    }
  }
  return [samples, samples.slice()];
}
