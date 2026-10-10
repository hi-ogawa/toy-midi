import { createStore } from "../../utils/store.ts";
import { startAnimationFrameLoop, startInterval } from "../../utils/timing.ts";

/** Gives every participant time to schedule against the same future audio frame. */
const PLAYBACK_LEAD_SECONDS = 0.03;
/** Must exceed main-thread timer jitter so the audio clock never outruns scheduling. */
const SCHEDULE_AHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;

/** A playback object whose lifecycle follows this transport. */
export interface TransportParticipant {
  start(): void;
  stop(): void;
}

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
 * One pass of a run through the timeline. Timeline `start` sounds at
 * `contextTime`, and the pass ends where it would reach `end`. Segment 0 begins
 * at the run's position and every later segment covers the loop range.
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

type TransportState = {
  position: number;
  isPlaying: boolean;
};

/**
 * Owns recorder position and synchronizes registered playback objects to one
 * AudioContext timeline. The audio clock is the ground truth: a run fixes how
 * it maps to timeline position, including every loop wrap, and participants
 * schedule ahead in audio-clock order. Position is only published from it.
 */
export class AudioContextTransport {
  /** Published transport state consumed by recorder runtime and UI. */
  readonly store = createStore<TransportState>(() => ({
    position: 0,
    isPlaying: false,
  }));

  /**
   * Maps the AudioContext clock to recorder position for the current run. It is
   * available to participants during start.
   */
  playbackRun?: PlaybackRun;
  playbackRate = 1;
  private readonly participants = new Set<TransportParticipant>();
  private disposeTicking?: () => void;
  private loopRange?: LoopRange;

  constructor(readonly context: AudioContext) {}

  /** Joins a participant to future transport starts and returns its disposer. */
  register(participant: TransportParticipant): () => void {
    this.participants.add(participant);
    return () => {
      participant.stop();
      this.participants.delete(participant);
    };
  }

  /** Schedules every participant against one shared future playback anchor. */
  play(): void {
    if (this.store.get().isPlaying) {
      return;
    }
    const currentPosition = this.store.get().position;
    // Allow preroll before loop-in and starts within the loop, but a playhead at
    // or after loop-out begins again from loop-in.
    const position =
      this.loopRange && currentPosition >= this.loopRange.end
        ? this.loopRange.start
        : currentPosition;
    this.startParticipants(position);
    this.startTicking();
  }

  /** Stops participants and preserves the position reached by the audio clock. */
  pause(): void {
    if (!this.store.get().isPlaying) {
      return;
    }
    for (const participant of this.participants) {
      participant.stop();
    }
    const finalPosition = this.getPublishedPlaybackPosition();
    this.playbackRun = undefined;
    this.stopTicking();
    this.store.update({ isPlaying: false, position: finalPosition });
  }

  /** Moves the playhead, restarting participants when playback is running. */
  seek(position: number): void {
    const wasPlaying = this.store.get().isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const nextPosition = Math.max(0, position);
    this.store.update({ position: nextPosition });
    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Changes the loop range. The run has already scheduled ahead with the old
   * wraps, so an actual change restarts it from the current position.
   */
  setLoopRange(loopRange?: LoopRange): void {
    if (
      loopRange?.start === this.loopRange?.start &&
      loopRange?.end === this.loopRange?.end
    ) {
      return;
    }
    this.loopRange = loopRange;
    if (this.store.get().isPlaying) {
      const position = this.getPublishedPlaybackPosition();
      this.restartParticipants(
        loopRange && position >= loopRange.end ? loopRange.start : position,
      );
    }
  }

  /** Changes timeline speed and re-anchors active participants at that rate. */
  setPlaybackRate(playbackRate: number): void {
    if (playbackRate === this.playbackRate) {
      return;
    }
    const wasPlaying = this.store.get().isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    this.playbackRate = playbackRate;
    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Projects the current AudioContext time to published playback position,
   * holding the run's start position during the scheduling lead.
   */
  getPublishedPlaybackPosition(): number {
    const playbackRun = this.playbackRun!;
    const contextTime = this.context.currentTime;
    return contextTime < playbackRun.contextTime
      ? playbackRun.position
      : getPlaybackPosition(playbackRun, contextTime);
  }

  /**
   * Projects an absolute AudioContext time to its exact position in the active
   * run. This intentionally includes playback warmup lead time.
   */
  getPlaybackPositionByContextTime(contextTime: number): number {
    return getPlaybackPosition(this.playbackRun!, contextTime);
  }

  /** Publishes audio-clock position on animation frames while playing. */
  private startTicking(): void {
    if (this.disposeTicking) {
      return;
    }
    this.disposeTicking = startAnimationFrameLoop(() => {
      this.store.update({
        position: this.getPublishedPlaybackPosition(),
      });
    });
  }

  private restartParticipants(position: number): void {
    for (const participant of this.participants) {
      participant.stop();
    }
    this.startParticipants(position);
  }

  private startParticipants(position: number): void {
    this.playbackRun = {
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position,
      playbackRate: this.playbackRate,
      loopRange: this.loopRange,
    };
    this.store.update({ position, isPlaying: true });
    for (const participant of this.participants) {
      participant.start();
    }
  }

  /** Stops publishing position updates. */
  private stopTicking(): void {
    this.disposeTicking?.();
    this.disposeTicking = undefined;
  }
}

/**
 * Hands `schedule` consecutive audio-clock windows starting at `from`, each
 * reaching a little past the current time, until the returned disposer runs.
 * The main-thread timer only decides when events are queued, while the times
 * they are queued at stay exact on the audio clock.
 */
export function startLookaheadScheduler({
  context,
  from,
  schedule,
}: {
  context: BaseAudioContext;
  from: number;
  schedule: (window: ContextTimeWindow) => void;
}): () => void {
  let scheduledUntil = from;
  const tick = () => {
    const to = context.currentTime + SCHEDULE_AHEAD_SECONDS;
    if (to <= scheduledUntil) {
      return;
    }
    schedule({ from: scheduledUntil, to });
    scheduledUntil = to;
  };
  tick();
  return startInterval(tick, SCHEDULER_INTERVAL_MS);
}

/** Projects an audio-clock time to timeline position, extrapolating before the run starts. */
export function getPlaybackPosition(
  run: PlaybackRun,
  contextTime: number,
): number {
  return getSegmentPosition(
    getPlaybackSegmentAt(run, contextTime),
    contextTime,
  );
}

/** Lists the segments that overlap an audio-clock window, in order. */
export function getPlaybackSegments(
  run: PlaybackRun,
  window: ContextTimeWindow,
): PlaybackSegment[] {
  const segments: PlaybackSegment[] = [];
  let segment = getPlaybackSegmentAt(run, window.from);
  while (segment.contextTime < window.to) {
    segments.push(segment);
    if (!run.loopRange) {
      break;
    }
    segment = getNextLoopSegment(segment, run.loopRange);
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

/** The segment sounding at an audio-clock time, or segment 0 before the run starts. */
function getPlaybackSegmentAt(
  run: PlaybackRun,
  contextTime: number,
): PlaybackSegment {
  const { loopRange, playbackRate } = run;
  const first: PlaybackSegment = {
    index: 0,
    contextTime: run.contextTime,
    start: run.position,
    end: loopRange?.end ?? Infinity,
    playbackRate,
  };
  if (!loopRange) {
    return first;
  }
  const firstWrapTime = getSegmentContextTime(first, loopRange.end);
  if (contextTime < firstWrapTime) {
    return first;
  }
  // Later segments sit at arithmetic offsets from the first wrap, so the audio
  // clock never needs a new anchor.
  const loopSeconds = (loopRange.end - loopRange.start) / playbackRate;
  const index = 1 + Math.floor((contextTime - firstWrapTime) / loopSeconds);
  return {
    index,
    contextTime: firstWrapTime + (index - 1) * loopSeconds,
    start: loopRange.start,
    end: loopRange.end,
    playbackRate,
  };
}

function getNextLoopSegment(
  segment: PlaybackSegment,
  loopRange: LoopRange,
): PlaybackSegment {
  return {
    index: segment.index + 1,
    contextTime: getSegmentContextTime(segment, segment.end),
    start: loopRange.start,
    end: loopRange.end,
    playbackRate: segment.playbackRate,
  };
}
