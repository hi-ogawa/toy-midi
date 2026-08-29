import { describe, expect, test, vi } from "vitest";
import { ReferencePlayback, type ReferencePlayer } from "./reference-playback";

function setup() {
  const player: ReferencePlayer = { play: vi.fn(), pause: vi.fn() };
  const transportState = { position: 0, isPlaying: false };
  let participant: Parameters<
    ConstructorParameters<typeof ReferencePlayback>[0]["register"]
  >[0];
  const transport = {
    store: { get: () => transportState },
    register: (next: typeof participant) => {
      participant = next;
      return () => {};
    },
  };
  const playback = new ReferencePlayback(transport as never, player);
  return { participant: participant!, playback, player, transportState };
}

describe("ReferencePlayback", () => {
  test("maps play, pause, and seek through timelineStart", () => {
    const { participant, playback, player, transportState } = setup();
    playback.setState({ timelineStart: -10, duration: 30 });
    transportState.position = 5;
    participant.start();
    expect(player.play).toHaveBeenLastCalledWith(15);
    transportState.position = 8;
    participant.stop();
    expect(player.pause).toHaveBeenLastCalledWith(18);
    transportState.position = 50;
    participant.seek();
    expect(player.pause).toHaveBeenLastCalledWith(30);
  });

  test("starts at a delayed positive timeline boundary", () => {
    vi.useFakeTimers();
    const { participant, playback, player, transportState } = setup();
    playback.setState({ timelineStart: 5, duration: 30 });
    transportState.position = 2;
    participant.start();
    expect(player.pause).toHaveBeenLastCalledWith(0);
    vi.advanceTimersByTime(2999);
    expect(player.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(player.play).toHaveBeenLastCalledWith(0);
    vi.useRealTimers();
  });

  test("cancels delayed playback on pause", () => {
    vi.useFakeTimers();
    const { participant, playback, player, transportState } = setup();
    playback.setState({ timelineStart: 5 });
    participant.start();
    transportState.position = 2;
    participant.stop();
    vi.runAllTimers();
    expect(player.play).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
