import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

describe("encodeWav", () => {
  it("encodes interleaved 16-bit PCM with a WAV header", async () => {
    const channels = [
      new Float32Array([-2, -0.5, 0]),
      new Float32Array([0.5, 1, 2]),
    ];
    const buffer = {
      numberOfChannels: channels.length,
      length: channels[0].length,
      sampleRate: 48_000,
      getChannelData: (channel: number) => channels[channel],
    } as AudioBuffer;

    const blob = encodeWav(buffer);
    const bytes = await blob.arrayBuffer();
    const view = new DataView(bytes);

    expect(blob.type).toBe("audio/wav");
    expect(readText(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(readText(view, 8, 4)).toBe("WAVE");
    expect(readText(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(28, true)).toBe(192_000);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readText(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(12);
    expect(
      Array.from({ length: 6 }, (_, index) =>
        view.getInt16(44 + index * 2, true),
      ),
    ).toEqual([-32_768, 16_383, -16_384, 32_767, 0, 32_767]);
  });
});

function readText(view: DataView, offset: number, length: number): string {
  return String.fromCharCode(
    ...Array.from({ length }, (_, index) => view.getUint8(offset + index)),
  );
}
