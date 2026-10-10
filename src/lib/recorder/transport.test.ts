import { describe, expect, it } from "vitest";
import {
  getPlaybackPosition,
  getPlaybackPasses,
  getPassEventRange,
  type PlaybackRun,
} from "./transport.ts";

// Loop 3s-8s with the playhead at 4s, starting at audio-clock time 10s.
const loopRun: PlaybackRun = {
  contextTime: 10,
  position: 4,
  playbackRate: 1,
  loopRange: { start: 3, end: 8 },
};

describe(getPlaybackPasses, () => {
  it("splits a window that crosses loop-out at the wrap", () => {
    const passes = getPlaybackPasses(loopRun, { from: 13.9, to: 14.1 });
    expect(passes).toEqual([
      { index: 0, contextTime: 10, start: 4, end: 8, playbackRate: 1 },
      { index: 1, contextTime: 14, start: 3, end: 8, playbackRate: 1 },
    ]);
  });

  it("places later passes one loop length apart", () => {
    const passes = getPlaybackPasses(loopRun, { from: 23.5, to: 24.5 });
    expect(
      passes.map(({ index, contextTime }) => [index, contextTime]),
    ).toEqual([
      [2, 19],
      [3, 24],
    ]);
  });

  it("lists every pass of a loop shorter than the window", () => {
    const passes = getPlaybackPasses(
      { ...loopRun, position: 3, loopRange: { start: 3, end: 3.04 } },
      { from: 10, to: 10.1 },
    );
    expect(passes.map(({ contextTime }) => contextTime)).toEqual([
      10,
      expect.closeTo(10.04),
      expect.closeTo(10.08),
    ]);
  });

  it("keeps one unbounded segment without a loop", () => {
    const passes = getPlaybackPasses(
      { contextTime: 10, position: 4, playbackRate: 2 },
      { from: 100, to: 100.1 },
    );
    expect(passes).toEqual([
      { index: 0, contextTime: 10, start: 4, end: Infinity, playbackRate: 2 },
    ]);
  });

  it("scales loop passes on the audio clock by playback rate", () => {
    const passes = getPlaybackPasses(
      { ...loopRun, playbackRate: 0.5 },
      { from: 27.9, to: 28.1 },
    );
    expect(passes.map(({ contextTime }) => contextTime)).toEqual([18, 28]);
  });
});

describe(getPlaybackPosition, () => {
  it("projects the audio clock to a sawtooth inside the loop", () => {
    expect(getPlaybackPosition(loopRun, 12)).toBeCloseTo(6);
    expect(getPlaybackPosition(loopRun, 14)).toBeCloseTo(3);
    expect(getPlaybackPosition(loopRun, 18.5)).toBeCloseTo(7.5);
    expect(getPlaybackPosition(loopRun, 19.5)).toBeCloseTo(3.5);
  });

  it("extrapolates the first pass before the run starts", () => {
    expect(getPlaybackPosition(loopRun, 9.5)).toBeCloseTo(3.5);
  });
});

describe(getPassEventRange, () => {
  // Loop 1s-2s from loop-in, so the first wrap is at audio-clock time 1s.
  const run: PlaybackRun = {
    contextTime: 0,
    position: 1,
    playbackRate: 1,
    loopRange: { start: 1, end: 2 },
  };
  const isInRange = (position: number, range: { start: number; end: number }) =>
    range.start <= position && position < range.end;

  it("gives an event on loop-out to the next pass's loop-in only", () => {
    // Two consecutive windows meet exactly at the wrap.
    const [beforePass] = getPlaybackPasses(run, { from: 0.75, to: 1 });
    const [afterPass] = getPlaybackPasses(run, { from: 1, to: 1.25 });
    const before = getPassEventRange(beforePass!, { from: 0.75, to: 1 });
    const after = getPassEventRange(afterPass!, { from: 1, to: 1.25 });
    expect(isInRange(2, before)).toBe(false);
    expect(isInRange(1, after)).toBe(true);
  });

  it("keeps an event a rounding error before a boundary on its intended side", () => {
    const [pass] = getPlaybackPasses(run, { from: 1, to: 1.25 });
    const range = getPassEventRange(pass!, { from: 1, to: 1.25 });
    expect(isInRange(1 - 1e-12, range)).toBe(true);
    expect(isInRange(1.25 - 1e-12, range)).toBe(false);
  });
});
