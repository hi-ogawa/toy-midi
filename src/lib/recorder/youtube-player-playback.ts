import { clamp } from "../music.ts";
import type { YouTubePlayerApi } from "../youtube.ts";
import type { AudioContextTransport } from "./transport.ts";

type PlaybackMode = "paused" | "before" | "playing" | "after";

const DRIFT_CHECK_INTERVAL_SECONDS = 1;
const DRIFT_TOLERANCE_SECONDS = 0.25;

export class YouTubePlayerPlayback {
  private readonly transport: AudioContextTransport;
  private readonly player: YouTubePlayerApi;
  private readonly duration: number;
  private timelineStart = 0;
  private mode?: PlaybackMode;
  private lastDriftCheckPosition?: number;
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
    this.lastDriftCheckPosition = this.transport.store.get().position;
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
      this.lastDriftCheckPosition = transport.position;
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
      if (mode === "playing") {
        this.correctDrift({
          expectedTime,
          transportPosition: transport.position,
        });
      }
      return;
    }
    this.mode = mode;
    this.lastDriftCheckPosition = transport.position;
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

  private correctDrift({
    expectedTime,
    transportPosition,
  }: {
    expectedTime: number;
    transportPosition: number;
  }): void {
    if (
      this.lastDriftCheckPosition !== undefined &&
      transportPosition - this.lastDriftCheckPosition <
        DRIFT_CHECK_INTERVAL_SECONDS
    ) {
      return;
    }
    this.lastDriftCheckPosition = transportPosition;
    if (
      Math.abs(this.player.getCurrentTime() - expectedTime) >
      DRIFT_TOLERANCE_SECONDS
    ) {
      this.player.seekTo(expectedTime, true);
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
