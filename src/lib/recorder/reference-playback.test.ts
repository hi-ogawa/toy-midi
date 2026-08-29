import { describe, expect, test, vi } from "vitest";
import { ReferencePlayback, type ReferencePlayer } from "./reference-playback";

function setup() {
  const player: ReferencePlayer = { play: vi.fn(), pause: vi.fn() };
  let participant: Parameters<
    ConstructorParameters<typeof ReferencePlayback>[0]["register"]
  >[0];
  const transport = {
    store: { get: () => ({ position: 0, isPlaying: false }) },
    register: (next: typeof participant) => {
      participant = next;
      return () => {};
    },
  };
  const playback = new ReferencePlayback(transport as never, player);
  return { participant: participant!, playback, player };
}

describe("ReferencePlayback", () => {
  test("maps play, pause, and seek through timelineStart", () => {
    const { participant, playback, player } = setup();
    playback.setState({ timelineStart: -10, duration: 30 });
    participant.onPlay({ contextTime: 0, position: 5 });
    expect(player.play).toHaveBeenLastCalledWith(15);
    participant.onPause(8);
    expect(player.pause).toHaveBeenLastCalledWith(18);
    participant.onSeek(50, true);
    expect(player.pause).toHaveBeenLastCalledWith(30);
  });

  test("starts at a delayed positive timeline boundary", () => {
    vi.useFakeTimers();
    const { participant, playback, player } = setup();
    playback.setState({ timelineStart: 5, duration: 30 });
    participant.onPlay({ contextTime: 0, position: 2 });
    expect(player.pause).toHaveBeenLastCalledWith(0);
    vi.advanceTimersByTime(2999);
    expect(player.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(player.play).toHaveBeenLastCalledWith(0);
    vi.useRealTimers();
  });

  test("cancels delayed playback on pause", () => {
    vi.useFakeTimers();
    const { participant, playback, player } = setup();
    playback.setState({ timelineStart: 5 });
    participant.onPlay({ contextTime: 0, position: 0 });
    participant.onPause(2);
    vi.runAllTimers();
    expect(player.play).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
