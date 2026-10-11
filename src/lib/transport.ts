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
 * The part of the run's pass that one scheduling tick covers, as a half-open
 * timeline range `[start, end)` of point events such as clicks and note starts.
 * Each event belongs to exactly one scheduled pass.
 */
export type ScheduledPass = {
  start: number;
  end: number;
  /** Maps this pass to the audio clock. The pass begins at `anchor.position`. */
  anchor: PlaybackAnchor;
  /** 0 for the pass from the playhead, then one more for each loop wrap. */
  index: number;
  /** Timeline position where the pass ends, at loop-out or never without a loop. */
  passEnd: number;
  /** Timeline position where this tick enters the pass, without the boundary shift. */
  startPosition: number;
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

  /**
   * Maps an absolute AudioContext time to the playhead position at which the
   * current playback run begins. It is available to participants during start.
   */
  playbackAnchor?: PlaybackAnchor;
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
    this.playbackAnchor = undefined;
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
    // The running passes use the current loop, so read the position before
    // switching to the new one.
    const position = this.store.get().isPlaying
      ? this.getPublishedPlaybackPosition()
      : undefined;
    this.loopRange = loopRange;
    if (position !== undefined) {
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
   * Converts an absolute AudioContext time to published playback position while
   * excluding the scheduling lead before the playback anchor.
   */
  getPublishedPlaybackPosition(): number {
    const playbackAnchor = this.playbackAnchor!;
    const contextTime = this.context.currentTime;
    return contextTime < playbackAnchor.contextTime
      ? playbackAnchor.position
      : this.getPlaybackPositionAt(contextTime);
  }

  /**
   * Projects an audio-clock time to timeline position, wrapping at loop-out and
   * extrapolating before the run starts.
   */
  getPlaybackPositionAt(contextTime: number): number {
    return getPlaybackPassAt(
      this.playbackAnchor!,
      this.loopRange,
      contextTime,
    ).anchor.getPositionAt(contextTime);
  }

  /**
   * Hands `schedule` the passes sounding in consecutive windows of the current
   * run, each reaching a little past the current audio time, until the disposer
   * runs. The timer only decides when events are queued, while the times they
   * are queued at stay exact on the audio clock.
   */
  startScheduleLoop(schedule: (pass: ScheduledPass) => void): () => void {
    const anchor = this.playbackAnchor!;
    const loopRange = this.loopRange;
    let scheduledUntil = anchor.contextTime;
    const tick = () => {
      const to = this.context.currentTime + SCHEDULE_AHEAD_SECONDS;
      if (to <= scheduledUntil) {
        return;
      }
      // A restart mid-run, such as a tempo change, or a stalled timer can leave
      // part of the window in the past. Skip it rather than queue events to play
      // late.
      const from = Math.max(scheduledUntil, this.context.currentTime);
      for (const pass of getScheduledPasses(anchor, loopRange, {
        start: from,
        end: to,
      })) {
        schedule(pass);
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
    this.playbackAnchor = new PlaybackAnchor({
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position,
      playbackRate: this.playbackRate,
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
 * One pass through the timeline. Its anchor maps the pass from where it begins,
 * the playhead for pass 0 and loop-in for later passes, until `end`.
 */
type PlaybackPass = {
  index: number;
  anchor: PlaybackAnchor;
  end: number;
};

function getScheduledPasses(
  anchor: PlaybackAnchor,
  loopRange: LoopSecondsRange | undefined,
  window: ContextTimeWindow,
): ScheduledPass[] {
  return getPlaybackPasses(anchor, loopRange, window).map((pass) => {
    const startPosition = Math.max(
      pass.anchor.position,
      pass.anchor.getPositionAt(window.start),
    );
    const endPosition = Math.min(
      pass.end,
      pass.anchor.getPositionAt(window.end),
    );
    return {
      start: startPosition - BOUNDARY_EPSILON,
      end: endPosition - BOUNDARY_EPSILON,
      anchor: pass.anchor,
      index: pass.index,
      passEnd: pass.end,
      startPosition,
    };
  });
}

/** Lists the passes that overlap an audio-clock window, in order. */
function getPlaybackPasses(
  anchor: PlaybackAnchor,
  loopRange: LoopSecondsRange | undefined,
  window: ContextTimeWindow,
): PlaybackPass[] {
  const passes: PlaybackPass[] = [];
  let pass = getPlaybackPassAt(anchor, loopRange, window.start);
  while (pass.anchor.contextTime < window.end) {
    passes.push(pass);
    if (!loopRange) {
      break;
    }
    pass = getLoopPass(anchor, loopRange, pass.index + 1);
  }
  return passes;
}

/** The pass sounding at an audio-clock time, or pass 0 before the run starts. */
function getPlaybackPassAt(
  anchor: PlaybackAnchor,
  loopRange: LoopSecondsRange | undefined,
  contextTime: number,
): PlaybackPass {
  const sinceFirstWrap = loopRange
    ? contextTime - anchor.getContextTimeAt(loopRange.end)
    : -1;
  if (!loopRange || sinceFirstWrap < 0) {
    return { index: 0, anchor, end: loopRange?.end ?? Infinity };
  }
  const loopSeconds = (loopRange.end - loopRange.start) / anchor.playbackRate;
  return getLoopPass(
    anchor,
    loopRange,
    1 + Math.floor(sinceFirstWrap / loopSeconds),
  );
}

/**
 * Loop pass `index`, counting the first full pass after the first wrap as 1. It
 * sits at an arithmetic offset from the first wrap, so the audio clock never
 * needs a new anchor.
 */
function getLoopPass(
  anchor: PlaybackAnchor,
  loopRange: LoopSecondsRange,
  index: number,
): PlaybackPass {
  const loopSeconds = (loopRange.end - loopRange.start) / anchor.playbackRate;
  return {
    index,
    anchor: new PlaybackAnchor({
      contextTime:
        anchor.getContextTimeAt(loopRange.end) + (index - 1) * loopSeconds,
      position: loopRange.start,
      playbackRate: anchor.playbackRate,
    }),
    end: loopRange.end,
  };
}

/**
 * Maps the audio clock to the timeline linearly, for a playback run or one of
 * its loop passes. Timeline `position` sounds at `contextTime` and advances at
 * `playbackRate`.
 */
class PlaybackAnchor {
  readonly contextTime: number;
  readonly position: number;
  readonly playbackRate: number;

  constructor({
    contextTime,
    position,
    playbackRate,
  }: {
    contextTime: number;
    position: number;
    playbackRate: number;
  }) {
    this.contextTime = contextTime;
    this.position = position;
    this.playbackRate = playbackRate;
  }

  /** Audio-clock time at which a timeline position sounds. */
  getContextTimeAt(position: number): number {
    return this.contextTime + (position - this.position) / this.playbackRate;
  }

  /** Timeline position at an audio-clock time, extrapolating before the run starts. */
  getPositionAt(contextTime: number): number {
    return this.position + (contextTime - this.contextTime) * this.playbackRate;
  }
}
