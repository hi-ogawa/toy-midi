import { createStore } from "../../utils/store.ts";
import { startAnimationFrameLoop } from "../../utils/timing.ts";

/** Gives every participant time to schedule against the same future audio frame. */
const PLAYBACK_LEAD_SECONDS = 0.03;

/** A playback object whose lifecycle follows this transport. */
export interface TransportParticipant {
  start(): void;
  stop(): void;
}

type TransportState = {
  position: number;
  isPlaying: boolean;
};

type PlaybackAnchor = {
  contextTime: number;
  position: number;
};

type LoopRange = {
  start: number;
  end: number;
};

/**
 * Owns recorder position and synchronizes registered playback objects to one
 * AudioContext timeline.
 */
export class AudioContextTransport {
  /** Published transport state consumed by recorder runtime and UI. */
  readonly store = createStore<TransportState>(() => ({
    position: 0,
    isPlaying: false,
  }));

  /**
   * Maps an absolute AudioContext time to the recorder position at which the
   * current playback run begins. It is available to participants during start.
   */
  playbackAnchor?: PlaybackAnchor;
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

  /**
   * Converts an absolute AudioContext time to published playback position while
   * excluding the scheduling lead before the playback anchor.
   */
  private getPublishedPlaybackPosition(): number {
    const playbackAnchor = this.playbackAnchor!;
    return Math.max(
      playbackAnchor.position,
      this.getPlaybackPositionByContextTime(this.context.currentTime),
    );
  }

  /**
   * Converts an absolute AudioContext time to its exact position relative to the
   * active playback anchor. This intentionally includes playback warmup lead time.
   */
  getPlaybackPositionByContextTime(contextTime: number): number {
    const playbackAnchor = this.playbackAnchor!;
    return playbackAnchor.position + contextTime - playbackAnchor.contextTime;
  }

  /** Publishes audio-clock position on animation frames while playing. */
  private startTicking(): void {
    if (this.disposeTicking) {
      return;
    }
    this.disposeTicking = startAnimationFrameLoop(() => {
      const position = this.getPublishedPlaybackPosition();
      if (this.loopRange && position >= this.loopRange.end) {
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
    this.playbackAnchor = {
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position,
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
