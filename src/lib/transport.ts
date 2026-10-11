import { createStore } from "../utils/store.ts";
import { startAnimationFrameLoop, startInterval } from "../utils/timing.ts";

/** Gives every participant time to schedule against the same future audio frame. */
const PLAYBACK_LEAD_SECONDS = 0.03;
/**
 * A timer loop ticking every `SCHEDULER_INTERVAL_MS` queues audio events against
 * future audio frames up to this far ahead. Main-thread timers fire late and
 * unevenly while the page is busy, so the lookahead leaves headroom over the
 * interval. Both values are practical choices, not derived limits.
 */
const SCHEDULE_AHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;
/**
 * Event times, the playhead, and loop boundaries are converted from beats
 * separately, so an event meant to sit exactly on one of them can land a
 * rounding error to either side of it. Scheduled passes shift both ends back by
 * this much, so such an event still falls on its intended side and consecutive
 * ones still share their boundary.
 */
const BOUNDARY_EPSILON = 1e-9;

/** A playback object whose lifecycle follows this transport. */
export interface TransportParticipant {
  start(): void;
  stop(): void;
}

type TransportState = {
  /** Playhead in seconds. Convert from beats with `beats * 60 / tempo`. */
  position: number;
  isPlaying: boolean;
};

/** Half-open audio-clock window `[start, end)`. */
type ContextTimeWindow = {
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

type LoopSecondsRange = {
  start: number;
  end: number;
};

/**
 * Owns the playhead position and synchronizes registered playback objects to one
 * AudioContext timeline.
 */
export class AudioContextTransport {
  /** Published transport state consumed by the editor runtime and UI. */
  readonly store = createStore<TransportState>(() => ({
    position: 0,
    isPlaying: false,
  }));

  /** The current playback run. It is available to participants during start. */
  playbackRun?: PlaybackRun;
  playbackRate = 1;
  private readonly participants = new Set<TransportParticipant>();
  private disposeTicking?: () => void;
  private loopRange?: LoopSecondsRange;

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
   * Changes the loop range. Participants have already scheduled ahead with the
   * old wraps, so an actual change restarts playback from the current position.
   */
  setLoopRange(loopRange?: LoopSecondsRange): void {
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
   * The playhead position on the audio clock, holding at the run's start during
   * the scheduling lead before it.
   */
  getPublishedPlaybackPosition(): number {
    const run = this.playbackRun!;
    const contextTime = this.context.currentTime;
    return contextTime < run.first.contextTime
      ? run.first.start
      : run.getPositionAt(contextTime);
  }

  /**
   * Hands `schedule` the ranges sounding in consecutive windows of the current
   * run, each reaching a little past the current audio time, until the disposer
   * runs. The timer only decides when events are queued, while the times they
   * are queued at stay exact on the audio clock.
   */
  startScheduleLoop(schedule: (range: ScheduledRange) => void): () => void {
    const run = this.playbackRun!;
    let scheduledUntil = run.first.contextTime;
    const tick = () => {
      const to = this.context.currentTime + SCHEDULE_AHEAD_SECONDS;
      if (to <= scheduledUntil) {
        return;
      }
      // A restart mid-run, such as a tempo change, or a stalled timer can leave
      // part of the window in the past. Skip it rather than queue events to play
      // late.
      const from = Math.max(scheduledUntil, this.context.currentTime);
      for (const range of run.getScheduledRanges({ start: from, end: to })) {
        schedule(range);
      }
      scheduledUntil = to;
    };
    tick();
    return startInterval(tick, SCHEDULER_INTERVAL_MS);
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
    this.playbackRun = new PlaybackRun({
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position,
      playbackRate: this.playbackRate,
      loopRange: this.loopRange,
    });
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
 * One playback run as a sequence of passes. Pass 0 runs from the playhead to
 * loop-out, or forever without a loop. Each later pass runs from loop-in to
 * loop-out and begins the instant the previous one ends.
 */
class PlaybackRun {
  readonly first: PlaybackPass;
  private readonly firstEnd: number;
  private readonly loopRange?: LoopSecondsRange;

  constructor({
    contextTime,
    position,
    playbackRate,
    loopRange,
  }: {
    contextTime: number;
    position: number;
    playbackRate: number;
    loopRange?: LoopSecondsRange;
  }) {
    this.first = new PlaybackPass({
      index: 0,
      start: position,
      end: loopRange?.end ?? Infinity,
      contextTime,
      playbackRate,
    });
    this.firstEnd = this.first.getContextTimeAt(this.first.end);
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
      pass = this.getPass(pass.index + 1)
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
    if (contextTime < this.firstEnd) {
      return this.first;
    }
    // Pass 0 ends only at loop-out, so from here on the run is looping.
    const sinceFirstEnd = contextTime - this.firstEnd;
    return this.getPass(1 + Math.floor(sinceFirstEnd / this.getLoopSeconds()))!;
  }

  /** Pass `index`, or undefined past the last one. */
  private getPass(index: number): PlaybackPass | undefined {
    if (index === 0) {
      return this.first;
    }
    if (!this.loopRange) {
      return undefined;
    }
    return new PlaybackPass({
      index,
      start: this.loopRange.start,
      end: this.loopRange.end,
      contextTime: this.firstEnd + (index - 1) * this.getLoopSeconds(),
      playbackRate: this.first.playbackRate,
    });
  }

  private getLoopSeconds(): number {
    const loopRange = this.loopRange!;
    return (loopRange.end - loopRange.start) / this.first.playbackRate;
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
