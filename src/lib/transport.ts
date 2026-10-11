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
 * Event times and the playhead are converted from beats separately, so an event
 * meant to sit exactly on the playhead can land a rounding error before it.
 * Scheduled passes shift both ends back by this much, so such an event still
 * plays and consecutive ones still share their boundary.
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

/**
 * The part of the run's pass that one scheduling tick covers, as a half-open
 * timeline range `[start, end)` of point events such as clicks and note starts.
 * Each event belongs to exactly one scheduled pass.
 */
export type ScheduledPass = {
  start: number;
  end: number;
  anchor: PlaybackAnchor;
};

type LoopRange = {
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

  setLoopRange(loopRange?: LoopRange): void {
    this.loopRange = loopRange;
    if (
      loopRange &&
      this.store.get().isPlaying &&
      this.getPublishedPlaybackPosition() >= loopRange.end
    ) {
      this.restartParticipants(loopRange.start);
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
    return Math.max(
      playbackAnchor.position,
      playbackAnchor.getPositionAt(this.context.currentTime),
    );
  }

  /**
   * Hands `schedule` consecutive scheduled passes of the current run, each
   * reaching a little past the current audio time, until the returned disposer
   * runs. The timer only decides when events are queued, while the times they
   * are queued at stay exact on the audio clock.
   */
  startScheduleLoop(schedule: (pass: ScheduledPass) => void): () => void {
    const anchor = this.playbackAnchor!;
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
      schedule({
        start: anchor.getPositionAt(from) - BOUNDARY_EPSILON,
        end: anchor.getPositionAt(to) - BOUNDARY_EPSILON,
        anchor,
      });
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
      const position = this.getPublishedPlaybackPosition();
      if (this.loopRange && position >= this.loopRange.end) {
        // Looping currently follows the UI tick and restarts participants with
        // fresh scheduling lead, so it is not a gapless audio-clock boundary.
        // Gapless Web Audio playback would schedule each participant's next
        // segment ahead of loop-out and use animation frames only for position.
        this.restartParticipants(this.loopRange.start);
        return;
      }
      this.store.update({
        position,
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
 * Maps the audio clock to the timeline for one playback run. Timeline `position` sounds at
 * `contextTime` and advances at `playbackRate`.
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
