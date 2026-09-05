import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { YouTubePlayerApi } from "../youtube.ts";
import { AudioContextTransport } from "./transport.ts";
import { YouTubePlayerPlayback } from "./youtube-player-playback.ts";

describe(YouTubePlayerPlayback, () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies the transport playback rate when playback starts", () => {
    const player = createPlayer();
    const transport = new AudioContextTransport({
      currentTime: 0,
    } as AudioContext);
    transport.setPlaybackRate(0.75);
    const playback = new YouTubePlayerPlayback({
      transport,
      player,
      duration: 60,
    });

    transport.play();

    expect(player.setPlaybackRate).toHaveBeenCalledWith(0.75);
    playback.dispose();
  });
});

function createPlayer(): YouTubePlayerApi {
  return {
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    mute: vi.fn(),
    unMute: vi.fn(),
    setPlaybackRate: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 60),
    getVideoData: vi.fn(() => ({})),
    destroy: vi.fn(),
  };
}
