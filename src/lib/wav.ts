const HEADER_SIZE = 44;
const BYTES_PER_SAMPLE = 2;

export function encodeWav(buffer: AudioBuffer): Blob {
  const channelCount = buffer.numberOfChannels;
  const dataSize = buffer.length * channelCount * BYTES_PER_SAMPLE;
  const bytes = new ArrayBuffer(HEADER_SIZE + dataSize);
  const view = new DataView(bytes);

  writeText(view, 0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channelCount * BYTES_PER_SAMPLE, true);
  view.setUint16(32, channelCount * BYTES_PER_SAMPLE, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  writeText(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let offset = HEADER_SIZE;
  for (let frame = 0; frame < buffer.length; frame++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      );
      offset += BYTES_PER_SAMPLE;
    }
  }

  return new Blob([bytes], { type: "audio/wav" });
}

function writeText(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index++) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
