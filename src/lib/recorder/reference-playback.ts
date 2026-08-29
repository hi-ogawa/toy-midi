import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

interface ReferencePlayer {
  play(time: number): void;
  pause(time: number): void;
}

export class ReferencePlayback implements TransportParticipant {
  private timelineStart = 0;
  private boundaryTimer?: ReturnType<typeof setTimeout>;
  private readonly unregister: () => void;

  constructor({
    transport,
    player,
    duration,
  }: {
    transport: AudioContextTransport;
    player: ReferencePlayer;
    duration: number;
  }) {
    this.transport = transport;
    this.player = player;
    this.duration = duration;
    this.unregister = transport.register(this);
  }

  private readonly transport: AudioContextTransport;
  private readonly player: ReferencePlayer;
  private readonly duration: number;

  setTimelineStart(timelineStart: number): void {
    this.timelineStart = timelineStart;
    const transport = this.transport.store.get();
    this.reconcile(transport.position, transport.isPlaying);
  }

  start(): void {
    this.reconcile(this.transport.store.get().position, true);
  }

  stop(): void {
    this.reconcile(this.transport.store.get().position, false);
  }

  seek(): void {
    this.reconcile(this.transport.store.get().position, false);
  }

  dispose(): void {
    this.clearBoundaryTimer();
    this.unregister();
  }

  private reconcile(position: number, isPlaying: boolean): void {
    this.clearBoundaryTimer();
    const referencePosition = position - this.timelineStart;
    if (referencePosition < 0) {
      this.player.pause(0);
      if (isPlaying) {
        this.boundaryTimer = setTimeout(() => {
          this.boundaryTimer = undefined;
          this.player.play(0);
        }, -referencePosition * 1000);
      }
      return;
    }
    if (referencePosition >= this.duration) {
      this.player.pause(this.duration);
      return;
    }
    if (isPlaying) {
      this.player.play(referencePosition);
    } else {
      this.player.pause(referencePosition);
    }
  }

  private clearBoundaryTimer(): void {
    if (this.boundaryTimer !== undefined) {
      clearTimeout(this.boundaryTimer);
      this.boundaryTimer = undefined;
    }
  }
}
