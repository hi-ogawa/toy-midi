import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export interface ReferencePlayer {
  play(time: number): void;
  pause(time: number): void;
}

export interface ReferencePlaybackState {
  timelineStart: number;
  duration?: number;
}

export class ReferencePlayback implements TransportParticipant {
  private state?: ReferencePlaybackState;
  private boundaryTimer?: ReturnType<typeof setTimeout>;
  private readonly unregister: () => void;

  constructor(
    private readonly transport: AudioContextTransport,
    private readonly player: ReferencePlayer,
  ) {
    this.unregister = transport.register(this);
  }

  setState(state?: ReferencePlaybackState): void {
    this.state = state;
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
    const state = this.state;
    if (!state) {
      this.player.pause(0);
      return;
    }
    const videoTime = position - state.timelineStart;
    if (videoTime < 0) {
      this.player.pause(0);
      if (isPlaying) {
        this.boundaryTimer = setTimeout(() => {
          this.boundaryTimer = undefined;
          this.player.play(0);
        }, -videoTime * 1000);
      }
      return;
    }
    if (state.duration !== undefined && videoTime >= state.duration) {
      this.player.pause(state.duration);
      return;
    }
    if (isPlaying) {
      this.player.play(videoTime);
    } else {
      this.player.pause(videoTime);
    }
  }

  private clearBoundaryTimer(): void {
    if (this.boundaryTimer !== undefined) {
      clearTimeout(this.boundaryTimer);
      this.boundaryTimer = undefined;
    }
  }
}
