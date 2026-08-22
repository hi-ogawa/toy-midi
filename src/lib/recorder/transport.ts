import { createStore } from "../../utils/store.ts";

/** Gives every participant time to schedule against the same future audio frame. */
const PLAYBACK_LEAD_SECONDS = 0.03;

/** A playback object whose lifecycle follows this transport. */
export interface TransportParticipant {
  start(): void;
  stop(): void;
}

type TransportState = {
  position: number;
  running: boolean;
};

type PlaybackAnchor = {
  contextTime: number;
  position: number;
};

/**
 * Owns recorder position and synchronizes registered playback objects to one
 * AudioContext timeline.
 */
export class AudioContextTransport {
  /** Published transport state consumed by recorder runtime and UI. */
  readonly store = createStore<TransportState>(() => ({
    position: 0,
    running: false,
  }));

  /**
   * Maps an absolute AudioContext time to the recorder position at which the
   * current playback run begins. It is available to participants during start.
   */
  playbackAnchor?: PlaybackAnchor;
  private readonly participants = new Set<TransportParticipant>();
  private disposeTicking?: () => void;

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
    if (this.store.get().running) {
      return;
    }
    this.playbackAnchor = {
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position: this.store.get().position,
    };
    for (const participant of this.participants) {
      participant.start();
    }
    this.store.update({ running: true });
    this.startTicking();
  }

  /** Stops participants and preserves the position reached by the audio clock. */
  pause(): void {
    if (!this.store.get().running) {
      return;
    }
    for (const participant of this.participants) {
      participant.stop();
    }
    this.playbackAnchor = undefined;
    this.stopTicking();
    this.store.update({ running: false });
  }

  /** Moves the playhead, restarting participants when playback is running. */
  seek(position: number): void {
    const wasRunning = this.store.get().running;
    if (wasRunning) {
      this.pause();
    }
    const nextPosition = Math.max(0, position);
    this.store.update({ position: nextPosition });
    if (wasRunning) {
      this.play();
    }
  }

  /**
   * Places captured sample zero from its absolute AudioContext frame. Unlike
   * the published playhead, this preserves exact time during playback warmup so
   * the whole take remains aligned.
   */
  getCaptureOffset(startFrame: number): number {
    return getPositionAtContextTime(
      this.playbackAnchor!,
      startFrame / this.context.sampleRate,
    );
  }

  /** Publishes audio-clock position on animation frames while playing. */
  private startTicking(): void {
    if (this.disposeTicking) {
      return;
    }
    this.disposeTicking = startAnimationFrameLoop(() => {
      const playbackAnchor = this.playbackAnchor!;
      this.store.update({
        // Hold at the requested position until the future playback anchor arrives.
        position: Math.max(
          playbackAnchor.position,
          getPositionAtContextTime(playbackAnchor, this.context.currentTime),
        ),
      });
    });
  }

  /** Stops publishing position updates. */
  private stopTicking(): void {
    this.disposeTicking?.();
    this.disposeTicking = undefined;
  }
}

function getPositionAtContextTime(
  playbackAnchor: PlaybackAnchor,
  contextTime: number,
): number {
  return playbackAnchor.position + contextTime - playbackAnchor.contextTime;
}

function startAnimationFrameLoop(callback: () => void): () => void {
  let frame: number;
  const tick = () => {
    callback();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
