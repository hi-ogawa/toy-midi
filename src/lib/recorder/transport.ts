import { createStore } from "../../utils/store.ts";
import { startAnimationFrameLoop } from "../../utils/timing.ts";

/** Gives every participant time to schedule against the same future audio frame. */
const PLAYBACK_LEAD_SECONDS = 0.03;

/** A playback object whose lifecycle follows this transport. */
export interface TransportParticipant {
  onPlay(anchor: PlaybackAnchor): void;
  onPause(position: number): void;
  onSeek(event: TransportSeekEvent): void;
}

type TransportState = {
  position: number;
  isPlaying: boolean;
};

export type PlaybackAnchor = {
  contextTime: number;
  position: number;
};

export type TransportSeekEvent =
  | { position: number; isPlaying: false }
  | { position: number; isPlaying: true; anchor: PlaybackAnchor };

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

  private playbackAnchor?: PlaybackAnchor;
  private readonly participants = new Set<TransportParticipant>();
  private disposeTicking?: () => void;

  constructor(readonly context: AudioContext) {}

  /** Joins a participant to future transport starts and returns its disposer. */
  register(participant: TransportParticipant): () => void {
    this.participants.add(participant);
    const state = this.store.get();
    if (state.isPlaying) {
      participant.onPlay(this.getActivePlaybackAnchor());
    } else {
      participant.onPause(state.position);
    }
    return () => {
      participant.onPause(this.store.get().position);
      this.participants.delete(participant);
    };
  }

  /** Schedules every participant against one shared future playback anchor. */
  play(): void {
    if (this.store.get().isPlaying) {
      return;
    }
    const anchor: PlaybackAnchor = {
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position: this.store.get().position,
    };
    this.playbackAnchor = anchor;
    for (const participant of this.participants) {
      participant.onPlay(anchor);
    }
    this.store.update({ isPlaying: true });
    this.startTicking();
  }

  /** Stops participants and preserves the position reached by the audio clock. */
  pause(): void {
    if (!this.store.get().isPlaying) {
      return;
    }
    const finalPosition = this.getPublishedPlaybackPosition();
    for (const participant of this.participants) {
      participant.onPause(finalPosition);
    }
    this.playbackAnchor = undefined;
    this.stopTicking();
    this.store.update({ isPlaying: false, position: finalPosition });
  }

  /** Moves the playhead, restarting participants when playback is running. */
  seek(position: number): void {
    const wasPlaying = this.store.get().isPlaying;
    const nextPosition = Math.max(0, position);
    let event: TransportSeekEvent = {
      position: nextPosition,
      isPlaying: false,
    };
    if (wasPlaying) {
      const anchor: PlaybackAnchor = {
        contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
        position: nextPosition,
      };
      this.playbackAnchor = anchor;
      event = { position: nextPosition, isPlaying: true, anchor };
    }
    for (const participant of this.participants) {
      participant.onSeek(event);
    }
    this.store.update({ position: nextPosition });
  }

  /**
   * Converts an absolute AudioContext time to published playback position while
   * excluding the scheduling lead before the playback anchor.
   */
  private getPublishedPlaybackPosition(): number {
    const playbackAnchor = this.getActivePlaybackAnchor();
    return Math.max(
      playbackAnchor.position,
      this.getPositionAtContextTime(this.context.currentTime),
    );
  }

  /**
   * Converts an absolute AudioContext time to its exact position relative to the
   * active playback anchor. This intentionally includes playback warmup lead time.
   */
  getPositionAtContextTime(contextTime: number): number {
    const playbackAnchor = this.getActivePlaybackAnchor();
    return playbackAnchor.position + contextTime - playbackAnchor.contextTime;
  }

  getActiveStartContextTime(): number {
    return this.getActivePlaybackAnchor().contextTime;
  }

  private getActivePlaybackAnchor(): PlaybackAnchor {
    if (!this.playbackAnchor) {
      throw new Error("Recorder transport is not playing.");
    }
    return this.playbackAnchor;
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

  /** Stops publishing position updates. */
  private stopTicking(): void {
    this.disposeTicking?.();
    this.disposeTicking = undefined;
  }
}
