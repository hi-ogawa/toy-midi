import { describe, expect, test } from "vitest";
import {
  getPlaybackPosition,
  getPlaybackSegments,
  getSegmentContextTime,
  getSegmentRange,
  type PlaybackRun,
} from "./transport.ts";

// Loop 3s-8s with the playhead at 4s, starting at audio-clock time 10s.
const loopRun: PlaybackRun = {
  contextTime: 10,
  position: 4,
  playbackRate: 1,
  loopRange: { start: 3, end: 8 },
};

describe(getPlaybackSegments, () => {
  test("splits a window that crosses loop-out at the wrap", () => {
    const segments = getPlaybackSegments(loopRun, { from: 13.9, to: 14.1 });
    expect(segments).toEqual([
      { index: 0, contextTime: 10, start: 4, end: 8, playbackRate: 1 },
      { index: 1, contextTime: 14, start: 3, end: 8, playbackRate: 1 },
    ]);
  });

  test("places later passes one loop length apart", () => {
    const segments = getPlaybackSegments(loopRun, { from: 23.5, to: 24.5 });
    expect(
      segments.map(({ index, contextTime }) => [index, contextTime]),
    ).toEqual([
      [2, 19],
      [3, 24],
    ]);
  });

  test("lists every pass of a loop shorter than the window", () => {
    const segments = getPlaybackSegments(
      { ...loopRun, position: 3, loopRange: { start: 3, end: 3.04 } },
      { from: 10, to: 10.1 },
    );
    expect(segments.map(({ contextTime }) => contextTime)).toEqual([
      10,
      expect.closeTo(10.04),
      expect.closeTo(10.08),
    ]);
  });

  test("keeps one unbounded segment without a loop", () => {
    const segments = getPlaybackSegments(
      { contextTime: 10, position: 4, playbackRate: 2 },
      { from: 100, to: 100.1 },
    );
    expect(segments).toEqual([
      { index: 0, contextTime: 10, start: 4, end: Infinity, playbackRate: 2 },
    ]);
  });

  test("scales loop passes on the audio clock by playback rate", () => {
    const segments = getPlaybackSegments(
      { ...loopRun, playbackRate: 0.5 },
      { from: 27.9, to: 28.1 },
    );
    expect(segments.map(({ contextTime }) => contextTime)).toEqual([18, 28]);
  });
});

describe(getPlaybackPosition, () => {
  test("projects the audio clock to a sawtooth inside the loop", () => {
    expect(getPlaybackPosition(loopRun, 12)).toBeCloseTo(6);
    expect(getPlaybackPosition(loopRun, 14)).toBeCloseTo(3);
    expect(getPlaybackPosition(loopRun, 18.5)).toBeCloseTo(7.5);
    expect(getPlaybackPosition(loopRun, 19.5)).toBeCloseTo(3.5);
  });

  test("extrapolates the first pass before the run starts", () => {
    expect(getPlaybackPosition(loopRun, 9.5)).toBeCloseTo(3.5);
  });
});

describe(getSegmentRange, () => {
  test("gives each beat at a wrap to exactly one pass", () => {
    // Clicks every 0.5s, loop 1s-2s, scheduled through consecutive windows
    // whose edges fall exactly on the wrap.
    const run: PlaybackRun = {
      contextTime: 0,
      position: 1,
      playbackRate: 1,
      loopRange: { start: 1, end: 2 },
    };
    const clickTimes: number[] = [];
    for (let from = 0; from < 3; from += 0.25) {
      const window = { from, to: from + 0.25 };
      for (const segment of getPlaybackSegments(run, window)) {
        const range = getSegmentRange(segment, window);
        for (
          let index = Math.ceil(range.start / 0.5);
          index * 0.5 < range.end;
          index++
        ) {
          clickTimes.push(getSegmentContextTime(segment, index * 0.5));
        }
      }
    }
    expect(clickTimes).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
  });
});
