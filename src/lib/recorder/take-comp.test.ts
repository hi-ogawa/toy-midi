import { describe, expect, it } from "vitest";
import { renderTakeComp } from "./take-comp.ts";

describe(renderTakeComp, () => {
  it("renders newer overlapping samples over an older take", () => {
    const context = createContext(4);
    const result = renderTakeComp({
      context,
      takes: [
        {
          id: "old",
          timelineOffset: 0,
          duration: 2,
          buffer: createBuffer({ sampleRate: 4, samples: Array(8).fill(1) }),
        },
        {
          id: "new",
          timelineOffset: 0.75,
          duration: 0.5,
          buffer: createBuffer({ sampleRate: 4, samples: [2, 2] }),
        },
      ],
    });

    expect(Array.from(result!.getChannelData(0))).toEqual([
      1, 1, 1, 2, 2, 1, 1, 1,
    ]);
  });

  it("resamples take audio to the context sample rate", () => {
    const result = renderTakeComp({
      context: createContext(4),
      takes: [
        {
          id: "take",
          timelineOffset: 0,
          duration: 1,
          buffer: createBuffer({ sampleRate: 2, samples: [0, 1] }),
        },
      ],
    });

    expect(Array.from(result!.getChannelData(0))).toEqual([0, 0.5, 1, 1]);
  });

  it("includes silence before a positive timeline offset", () => {
    const result = renderTakeComp({
      context: createContext(2),
      takes: [
        {
          id: "take",
          timelineOffset: 1,
          duration: 1,
          buffer: createBuffer({ sampleRate: 2, samples: [1, 1] }),
        },
      ],
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
