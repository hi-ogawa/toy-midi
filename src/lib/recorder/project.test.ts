import { describe, expect, it } from "vitest";
import { serializeAudioBuffer } from "./project.ts";

describe(serializeAudioBuffer, () => {
  it("copies every channel", () => {
    const channels = [
      new Float32Array([0.1, 0.2]),
      new Float32Array([0.3, 0.4]),
    ];
    const buffer = {
      sampleRate: 48_000,
      numberOfChannels: channels.length,
      getChannelData: (channel: number) => channels[channel],
    } as AudioBuffer;

    const result = serializeAudioBuffer(buffer);

    expect(result.sampleRate).toBe(48_000);
    expect(result.channels).toEqual(channels);
    expect(result.channels[0]).not.toBe(channels[0]);
    expect(result.channels[1]).not.toBe(channels[1]);
  });
});
