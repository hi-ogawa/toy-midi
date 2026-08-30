import type { YouTubePlayerApi } from "../youtube.ts";
import type {
  AudioContextTransport,
  TransportParticipant,
} from "./transport.ts";

export class YouTubePlayerPlayback implements TransportParticipant {
  private readonly transport: AudioContextTransport;
  private readonly player: YouTubePlayerApi;
  private readonly duration: number;
  private timelineStart = 0;
  private boundaryTimer?: ReturnType<typeof setTimeout>;
  private readonly unregister: () => void;

  constructor({
    transport,
    player,
    duration,
  }: {
    transport: AudioContextTransport;
    player: YouTubePlayerApi;
    duration: number;
  }) {
    this.transport = transport;
    this.player = player;
    this.duration = duration;
    this.unregister = transport.register(this);
  }

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
      this.pause(0);
      if (isPlaying) {
        this.boundaryTimer = setTimeout(() => {
          this.boundaryTimer = undefined;
          this.play(0);
        }, -referencePosition * 1000);
      }
      return;
    }
    if (referencePosition >= this.duration) {
      this.pause(this.duration);
      return;
    }
    if (isPlaying) {
      this.play(referencePosition);
    } else {
      this.pause(referencePosition);
    }
  }

  private play(position: number): void {
    this.player.seekTo(position, true);
    this.player.playVideo();
  }

  private pause(position: number): void {
    this.player.seekTo(position, true);
    this.player.pauseVideo();
  }

  private clearBoundaryTimer(): void {
    if (this.boundaryTimer !== undefined) {
      clearTimeout(this.boundaryTimer);
      this.boundaryTimer = undefined;
    }
  }
}
