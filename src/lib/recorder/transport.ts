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
  private state: TransportSnapshot = { position: 0, running: false };
  private contextTime?: number;
  private timelineTime = 0;
  private readonly participants = new Set<TransportParticipant>();
  private playPromise?: Promise<void>;
  private disposeTicking?: () => void;

  constructor(readonly context: AudioContext) {}

  register(participant: TransportParticipant): () => void {
    this.participants.add(participant);
    return () => {
      participant.stop();
      this.participants.delete(participant);
    };
  }

  async play(): Promise<void> {
    if (this.state.running) {
      return;
    }
    if (this.playPromise) {
      return this.playPromise;
    }
    this.playPromise = this.start();
    try {
      await this.playPromise;
    } finally {
      this.playPromise = undefined;
    }
  }

  private async start(): Promise<void> {
    await this.context.resume();
    const anchor = {
      contextTime: this.context.currentTime + PLAYBACK_LEAD_SECONDS,
      position: this.state.position,
    };
    this.contextTime = anchor.contextTime;
    this.timelineTime = anchor.position;
    for (const participant of this.participants) {
      participant.start(anchor);
    }
    this.update({ running: true });
    this.startTicking();
  }

  pause(): void {
    if (!this.state.running) {
      return;
    }
    const position = this.getPosition(this.context.currentTime);
    for (const participant of this.participants) {
      participant.stop();
    }
    this.contextTime = undefined;
    this.timelineTime = position;
    this.stopTicking();
    this.update({ position, running: false });
  }

  seek(position: number): void {
    const wasRunning = this.state.running;
    if (wasRunning) {
      this.pause();
    }
    const nextPosition = Math.max(0, position);
    this.timelineTime = nextPosition;
    this.update({ position: nextPosition });
    if (wasRunning) {
      void this.play();
    }
  }

  getPositionAtContextTime(contextTime: number): number {
    if (this.contextTime === undefined) {
      return this.state.position;
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
      this.update({ position: this.getPosition(this.context.currentTime) });
    });
  }

  private stopTicking(): void {
    this.disposeTicking?.();
    this.disposeTicking = undefined;
  }

  // reactive state contract
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): TransportSnapshot => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(update: Partial<TransportSnapshot>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) {
      listener();
    }
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
