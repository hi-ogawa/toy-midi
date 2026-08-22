import { createStore } from "../../utils/store.ts";

const PLAYBACK_LEAD_SECONDS = 0.03;

export type TransportAnchor = {
  contextTime: number;
  position: number;
};

export interface TransportParticipant {
  start(anchor: TransportAnchor): void;
  stop(): void;
}

type TransportSnapshot = {
  position: number;
  running: boolean;
};

export class AudioContextTransport {
  readonly store = createStore<TransportSnapshot>(() => ({
    position: 0,
    running: false,
  }));
  private contextTime?: number;
  private timelineTime = 0;
  private readonly participants = new Set<TransportParticipant>();
  private disposeTicking?: () => void;

  constructor(readonly context: AudioContext) {}

  register(participant: TransportParticipant): () => void {
    this.participants.add(participant);
    return () => {
      participant.stop();
      this.participants.delete(participant);
    };
  }

  play(): void {
    if (this.store.get().running) {
      return;
    }
    const anchor = {
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position: this.store.get().position,
    };
    this.contextTime = anchor.contextTime;
    this.timelineTime = anchor.position;
    for (const participant of this.participants) {
      participant.start(anchor);
    }
    this.store.update({ running: true });
    this.startTicking();
  }

  pause(): void {
    if (!this.store.get().running) {
      return;
    }
    const position = this.getPosition(this.context.currentTime);
    for (const participant of this.participants) {
      participant.stop();
    }
    this.contextTime = undefined;
    this.timelineTime = position;
    this.stopTicking();
    this.store.update({ position, running: false });
  }

  seek(position: number): void {
    const wasRunning = this.store.get().running;
    if (wasRunning) {
      this.pause();
    }
    const nextPosition = Math.max(0, position);
    this.timelineTime = nextPosition;
    this.store.update({ position: nextPosition });
    if (wasRunning) {
      this.play();
    }
  }

  getPositionAtContextTime(contextTime: number): number {
    if (this.contextTime === undefined) {
      return this.store.get().position;
    }
    return this.timelineTime + contextTime - this.contextTime;
  }

  getPositionAtContextFrame(frame: number): number {
    return this.getPositionAtContextTime(frame / this.context.sampleRate);
  }

  private getPosition(contextTime: number): number {
    // A future scheduled start must not move the visible playhead backward.
    return Math.max(
      this.timelineTime,
      this.getPositionAtContextTime(contextTime),
    );
  }

  private startTicking(): void {
    if (this.disposeTicking) {
      return;
    }
    this.disposeTicking = startAnimationFrameLoop(() => {
      this.store.update({
        position: this.getPosition(this.context.currentTime),
      });
    });
  }

  private stopTicking(): void {
    this.disposeTicking?.();
    this.disposeTicking = undefined;
  }
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
