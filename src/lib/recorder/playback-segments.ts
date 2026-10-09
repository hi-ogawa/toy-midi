/** Timeline seconds between loop-in and loop-out. */
export type LoopRange = {
  start: number;
  end: number;
};

/**
 * One transport run on the audio clock. Timeline `position` sounds at
 * `contextTime`, then advances at `playbackRate` and wraps from loop-out to
 * loop-in without ever re-anchoring.
 */
export type PlaybackRun = {
  contextTime: number;
  position: number;
  playbackRate: number;
  loopRange?: LoopRange;
};

/**
 * One pass through the timeline. Timeline `start` sounds at `contextTime`, and
 * the pass ends where it would reach `end`. Segment 0 begins at the run's
 * position and every later segment covers the loop range.
 */
export type PlaybackSegment = {
  index: number;
  contextTime: number;
  start: number;
  end: number;
  playbackRate: number;
};

/** Half-open audio-clock window `[from, to)` handed to lookahead schedulers. */
export type ContextTimeWindow = {
  from: number;
  to: number;
};

/**
 * Event timelines and loop boundaries are converted from beats separately, so
 * an event meant to sit exactly on a boundary can land a rounding error to
 * either side of it.
 */
const BOUNDARY_EPSILON = 1e-9;

/** Projects an audio-clock time to timeline position, extrapolating before the run starts. */
export function getPlaybackPosition(
  run: PlaybackRun,
  contextTime: number,
): number {
  const segment = getPlaybackSegment(
    run,
    getPlaybackSegmentIndex(run, contextTime),
  );
  return getSegmentPosition(segment, contextTime);
}

/** Lists the segments that overlap an audio-clock window, in order. */
export function getPlaybackSegments(
  run: PlaybackRun,
  window: ContextTimeWindow,
): PlaybackSegment[] {
  const segments: PlaybackSegment[] = [];
  // Step back one segment so float error in the index estimate cannot skip a
  // segment, then decide overlap from the same arithmetic as segment times.
  let index = Math.max(0, getPlaybackSegmentIndex(run, window.from) - 1);
  while (true) {
    const segment = getPlaybackSegment(run, index);
    if (segment.contextTime >= window.to) {
      break;
    }
    if (getSegmentContextTime(segment, segment.end) > window.from) {
      segments.push(segment);
    }
    if (!run.loopRange) {
      break;
    }
    index++;
  }
  return segments;
}

/**
 * Timeline range that a segment plays during an audio-clock window. Both ends
 * are shifted back by a tiny epsilon, so a point event that lands a rounding
 * error before a boundary still falls on its intended side. Consecutive windows
 * share their boundary, so each point event falls in exactly one window.
 */
export function getSegmentRange(
  segment: PlaybackSegment,
  window: ContextTimeWindow,
): { start: number; end: number } {
  return {
    start:
      Math.max(segment.start, getSegmentPosition(segment, window.from)) -
      BOUNDARY_EPSILON,
    end:
      Math.min(segment.end, getSegmentPosition(segment, window.to)) -
      BOUNDARY_EPSILON,
  };
}

export function getSegmentPosition(
  segment: PlaybackSegment,
  contextTime: number,
): number {
  return (
    segment.start + (contextTime - segment.contextTime) * segment.playbackRate
  );
}

export function getSegmentContextTime(
  segment: PlaybackSegment,
  position: number,
): number {
  return (
    segment.contextTime + (position - segment.start) / segment.playbackRate
  );
}

function getPlaybackSegment(run: PlaybackRun, index: number): PlaybackSegment {
  const { loopRange, playbackRate } = run;
  if (index === 0) {
    return {
      index,
      contextTime: run.contextTime,
      start: run.position,
      end: loopRange?.end ?? Infinity,
      playbackRate,
    };
  }
  // Later segments start at pure arithmetic offsets from the first wrap, so the
  // audio clock never needs a new anchor.
  const loop = loopRange!;
  return {
    index,
    contextTime:
      getFirstWrapTime(run, loop) +
      ((index - 1) * (loop.end - loop.start)) / playbackRate,
    start: loop.start,
    end: loop.end,
    playbackRate,
  };
}

function getPlaybackSegmentIndex(
  run: PlaybackRun,
  contextTime: number,
): number {
  const { loopRange } = run;
  if (!loopRange) {
    return 0;
  }
  const elapsed = contextTime - getFirstWrapTime(run, loopRange);
  if (elapsed < 0) {
    return 0;
  }
  return (
    1 +
    Math.floor((elapsed * run.playbackRate) / (loopRange.end - loopRange.start))
  );
}

function getFirstWrapTime(run: PlaybackRun, loopRange: LoopRange): number {
  return run.contextTime + (loopRange.end - run.position) / run.playbackRate;
}
