import { expect, it, vi } from "vitest";
import { AudioBufferPlayback } from "./audio-buffer-playback";
import type { AudioContextTransport, TransportParticipant } from "./transport";

it("updates scheduled playback gain without restarting its source and retains it across starts", () => {
  const source = {
    buffer: undefined,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  };
  const gain = {
    gain: { value: 1, setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const transport = {
    context: {
      currentTime: 2,
      createGain: () => gain,
      createBufferSource: () => source,
    },
    playbackAnchor: { position: 0, contextTime: 2 },
    playbackRate: 1,
    register: (participant: TransportParticipant) => () => participant.stop(),
  } as unknown as AudioContextTransport;
  const playback = new AudioBufferPlayback({
    transport,
    output: {} as AudioNode,
  });
  playback.setSource({
    clipId: "take",
    gain: 0.5,
    buffer: {} as AudioBuffer,
    timelineOffset: 0,
    timelineStart: 4,
    timelineEnd: 6,
  });
  playback.start();
  expect(gain.gain.value).toBe(0.5);
  expect(source.start).toHaveBeenCalledExactlyOnceWith(6, 4, 2);
  expect(source.connect).toHaveBeenCalledWith(gain);

  playback.setGain(0.25);
  expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0.25, 2, 0.01);
  expect(source.stop).not.toHaveBeenCalled();
  expect(source.start).toHaveBeenCalledTimes(1);

  playback.stop();
  playback.start();
  expect(source.start).toHaveBeenCalledTimes(2);
  expect(gain.gain.setTargetAtTime).toHaveBeenCalledTimes(1);
  playback.dispose();
  expect(gain.disconnect).toHaveBeenCalledTimes(1);
});
