import { createStore } from "../utils/store.ts";
import { startAnimationFrameLoop, startInterval } from "../utils/timing.ts";
import {
  type LoopSecondsRange,
  PlaybackRun,
  type ScheduledRange,
} from "./playback-run.ts";

/** Gives every participant time to schedule against the same future audio frame. */
const PLAYBACK_LEAD_SECONDS = 0.03;
/**
 * A timer loop ticking every `SCHEDULER_INTERVAL_MS` queues audio events against
 * future audio frames up to this far ahead. Main-thread timers fire late and
 * unevenly while the page is busy, so the lookahead leaves headroom over the
 * interval. It does not cover a hidden tab whose audio has gone quiet, where
 * the browser throttles timers to about once a second. Both values are
 * practical choices, not derived limits.
 */
const SCHEDULE_AHEAD_SECONDS = 0.1;
const SCHEDULER_INTERVAL_MS = 25;

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

  /** Schedules every participant against one shared future playback run. */
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
    return contextTime < run.firstPass.contextTime
      ? run.firstPass.start
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
    let scheduledUntil = run.firstPass.contextTime;
    const tick = () => {
      const to = this.context.currentTime + SCHEDULE_AHEAD_SECONDS;
      if (to <= scheduledUntil) {
        return;
      }
      // A restart mid-run, such as a tempo change, or a stalled timer can leave
      // part of the window in the past. Skip it rather than queue events to play
      // late.
      const from = Math.max(scheduledUntil, this.context.currentTime);
      const window = { start: from, end: to };
      for (const range of run.getScheduledRanges(window)) {
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
