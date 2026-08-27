import { describe, expect, it } from "vitest";
import { renderTakeComp } from "./take-comp.ts";
import { deriveTakeRegions } from "./take-regions.ts";
import type { TakeState } from "./take.ts";

describe(renderTakeComp, () => {
  it("renders newer overlapping samples over an older take", () => {
    const context = createContext(4);
    const takes: TakeState[] = [
      {
        id: "old",
        number: 1,
        timelineOffset: 0,
        duration: 2,
        trimStart: 0,
        trimEnd: 2,
        buffer: createBuffer({ sampleRate: 4, samples: Array(8).fill(1) }),
      },
      {
        id: "new",
        number: 2,
        timelineOffset: 0.75,
        duration: 0.5,
        trimStart: 0,
        trimEnd: 0.5,
        buffer: createBuffer({ sampleRate: 4, samples: [2, 2] }),
      },
    ];
    const result = renderTakeComp({
      context,
      regions: deriveTakeRegions(takes),
    });

    expect(Array.from(result!.getChannelData(0))).toEqual([
      1, 1, 1, 2, 2, 1, 1, 1,
    ]);
  });

  it("resamples take audio to the context sample rate", () => {
    const takes: TakeState[] = [
      {
        id: "take",
        number: 1,
        timelineOffset: 0,
        duration: 1,
        trimStart: 0,
        trimEnd: 1,
        buffer: createBuffer({ sampleRate: 2, samples: [0, 1] }),
      },
    ];
    const result = renderTakeComp({
      context: createContext(4),
      regions: deriveTakeRegions(takes),
    });

    expect(Array.from(result!.getChannelData(0))).toEqual([0, 0.5, 1, 1]);
  });

  it("includes silence before a positive timeline offset", () => {
    const takes: TakeState[] = [
      {
        id: "take",
        number: 1,
        timelineOffset: 1,
        duration: 1,
        trimStart: 0,
        trimEnd: 1,
        buffer: createBuffer({ sampleRate: 2, samples: [1, 1] }),
      },
    ];
    const result = renderTakeComp({
      context: createContext(2),
      regions: deriveTakeRegions(takes),
    });

    expect(Array.from(result!.getChannelData(0))).toEqual([0, 0, 1, 1]);
  });
});

function createContext(sampleRate: number): BaseAudioContext {
  return {
    sampleRate,
    createBuffer: (_channels, length, nextSampleRate) =>
      createBuffer({
        sampleRate: nextSampleRate,
        samples: Array(length).fill(0),
      }),
  } as BaseAudioContext;
}

function createBuffer({
  sampleRate,
  samples,
}: {
  sampleRate: number;
  samples: number[];
}): AudioBuffer {
  const data = Float32Array.from(samples);
  return {
    duration: data.length / sampleRate,
    length: data.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}
