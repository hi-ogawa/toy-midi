/**
 * Event times, the playhead, and loop boundaries are converted from beats
 * separately, so an event meant to sit exactly on one of them can land a
 * rounding error to either side of it. Scheduled passes shift both ends back by
 * this much, so such an event still falls on its intended side and consecutive
 * ones still share their boundary.
 */
const BOUNDARY_EPSILON = 1e-9;

/** Half-open audio-clock window `[start, end)`. */
export type ContextTimeWindow = {
  start: number;
  end: number;
};

/**
 * The part of one pass inside a scheduling window, as a half-open timeline range
 * `[start, end)` of point events such as clicks and note starts. Each event
 * belongs to exactly one range.
 */
export type ScheduledRange = {
  pass: PlaybackPass;
  start: number;
  end: number;
};

export type LoopSecondsRange = {
  start: number;
  end: number;
};

/** Plain data that defines a run, so it can cross to an audio worklet. */
export type PlaybackRunOptions = {
  /** Audio-clock time at which `position` sounds. */
  contextTime: number;
  position: number;
  playbackRate: number;
  loopRange?: LoopSecondsRange;
};

/**
 * One playback run as a sequence of passes. Pass 0 runs from the playhead to
 * loop-out, or forever without a loop. Each later pass runs from loop-in to
 * loop-out and begins the instant the previous one ends.
 */
export class PlaybackRun {
  readonly options: PlaybackRunOptions;
  readonly firstPass: PlaybackPass;
  private readonly firstPassEnd: number;
  private readonly loopRange?: LoopSecondsRange;

  constructor(options: PlaybackRunOptions) {
    const { contextTime, position, playbackRate, loopRange } = options;
    this.options = options;
    this.firstPass = new PlaybackPass({
      index: 0,
      start: position,
      end: loopRange?.end ?? Infinity,
      contextTime,
      playbackRate,
    });
    this.firstPassEnd = this.firstPass.getContextTimeAt(this.firstPass.end);
    this.loopRange = loopRange;
  }

  /** Timeline position at an audio-clock time, wrapping at loop-out. */
  getPositionAt(contextTime: number): number {
    return this.getPassAt(contextTime).getPositionAt(contextTime);
  }

  /** The ranges sounding in an audio-clock window, in pass order. */
  getScheduledRanges(window: ContextTimeWindow): ScheduledRange[] {
    const ranges: ScheduledRange[] = [];
    for (
      let pass: PlaybackPass | undefined = this.getPassAt(window.start);
      pass && pass.contextTime < window.end;
      pass = this.getPassByIndex(pass.index + 1)
    ) {
      // The window may begin before the pass does, or end after it.
      ranges.push({
        pass,
        start:
          Math.max(pass.start, pass.getPositionAt(window.start)) -
          BOUNDARY_EPSILON,
        end:
          Math.min(pass.end, pass.getPositionAt(window.end)) - BOUNDARY_EPSILON,
      });
    }
    return ranges;
  }

  /** The pass sounding at an audio-clock time, or pass 0 before the run starts. */
  private getPassAt(contextTime: number): PlaybackPass {
    if (contextTime < this.firstPassEnd) {
      return this.firstPass;
    }
    // Pass 0 ends only at loop-out, so from here on the run is looping.
    const sinceFirstPassEnd = contextTime - this.firstPassEnd;
    const index = 1 + Math.floor(sinceFirstPassEnd / this.getLoopSeconds());
    return this.getPassByIndex(index)!;
  }

  /** Pass `index`, or undefined past the last one. */
  private getPassByIndex(index: number): PlaybackPass | undefined {
    if (index === 0) {
      return this.firstPass;
    }
    if (!this.loopRange) {
      return undefined;
    }
    return new PlaybackPass({
      index,
      start: this.loopRange.start,
      end: this.loopRange.end,
      contextTime: this.firstPassEnd + (index - 1) * this.getLoopSeconds(),
      playbackRate: this.firstPass.playbackRate,
    });
  }

  private getLoopSeconds(): number {
    const loopRange = this.loopRange!;
    return (loopRange.end - loopRange.start) / this.firstPass.playbackRate;
  }
}

/**
 * A stretch of the timeline played straight through: `start` sounds at
 * `contextTime` and advances at `playbackRate` until `end`.
 */
class PlaybackPass {
  /** 0 for the pass from the playhead, then one more for each loop wrap. */
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly contextTime: number;
  readonly playbackRate: number;

  constructor({
    index,
    start,
    end,
    contextTime,
    playbackRate,
  }: {
    index: number;
    start: number;
    end: number;
    contextTime: number;
    playbackRate: number;
  }) {
    this.index = index;
    this.start = start;
    this.end = end;
    this.contextTime = contextTime;
    this.playbackRate = playbackRate;
  }

  /** Audio-clock time at which a timeline position sounds. */
  getContextTimeAt(position: number): number {
    return this.contextTime + (position - this.start) / this.playbackRate;
  }

  /** Timeline position at an audio-clock time, extrapolating outside the pass. */
  getPositionAt(contextTime: number): number {
    return this.start + (contextTime - this.contextTime) * this.playbackRate;
  }
}
