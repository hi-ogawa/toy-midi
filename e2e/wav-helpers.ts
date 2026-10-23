/** Decode a 16-bit PCM WAV into its format, duration in seconds, and interleaved samples. */
export function decodeWav(bytes: Buffer) {
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Not a WAV file.");
  }
  let format: Buffer | undefined;
  let data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = bytes.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") {
      format = body;
    } else if (id === "data") {
      data = body;
    }
    // Chunks are padded to an even size.
    offset += 8 + size + (size % 2);
  }
  if (!format || !data) {
    throw new Error("WAV is missing its format or data chunk.");
  }
  const PCM = 1;
  if (format.readUInt16LE(0) !== PCM || format.readUInt16LE(14) !== 16) {
    throw new Error("Only 16-bit PCM WAV is supported.");
  }
  const channelCount = format.readUInt16LE(2);
  const sampleRate = format.readUInt32LE(4);
  const samples = new Int16Array(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.length),
  );
  return {
    channelCount,
    sampleRate,
    duration: samples.length / channelCount / sampleRate,
    samples,
  };
}
