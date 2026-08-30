import { clamp } from "../music.ts";
import type { YouTubePlayerApi } from "../youtube.ts";
import type { AudioContextTransport } from "./transport.ts";

type PlaybackMode = "paused" | "before" | "playing" | "after";

export class YouTubePlayerPlayback {
  private readonly transport: AudioContextTransport;
  private readonly player: YouTubePlayerApi;
  private readonly duration: number;
  private timelineStart = 0;
  private mode?: PlaybackMode;
  private readonly unsubscribe: () => void;

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
    this.unsubscribe = transport.store.subscribe(() => this.sync());
  }

  setTimelineStart(timelineStart: number): void {
    this.timelineStart = timelineStart;
    this.sync();
  }

  dispose(): void {
    this.unsubscribe();
    this.player.pauseVideo();
  }

  private sync(): void {
    const transport = this.transport.store.get();
    const expectedTime = transport.position - this.timelineStart;
    if (!transport.isPlaying) {
      this.mode = "paused";
      this.pause(clamp(expectedTime, 0, this.duration));
      return;
    }

    const mode: PlaybackMode =
      expectedTime < 0
        ? "before"
        : expectedTime >= this.duration
          ? "after"
          : "playing";
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    switch (mode) {
      case "before": {
        this.pause(0);
        break;
      }
      case "playing": {
        this.play(expectedTime);
        break;
      }
      case "after": {
        this.pause(this.duration);
        break;
      }
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
}
