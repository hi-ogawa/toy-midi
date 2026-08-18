type StartMessage = { type: "start"; sampleRate: number };
type ChunkMessage = { type: "chunk"; frame: number; samples: Float32Array };
type FinishMessage = { type: "finish" };

let sampleRate = 0;
let chunks: Float32Array[] = [];
let sampleCount = 0;
let firstFrame: number | undefined;
let nextFrame: number | undefined;
let discontinuityFrames = 0;

globalThis.onmessage = (
  event: MessageEvent<StartMessage | ChunkMessage | FinishMessage>,
) => {
  switch (event.data.type) {
    case "start": {
      sampleRate = event.data.sampleRate;
      chunks = [];
      sampleCount = 0;
      firstFrame = undefined;
      nextFrame = undefined;
      discontinuityFrames = 0;
      break;
    }
    case "chunk": {
      firstFrame ??= event.data.frame;
      if (nextFrame !== undefined) {
        discontinuityFrames += event.data.frame - nextFrame;
      }
      chunks.push(event.data.samples);
      sampleCount += event.data.samples.length;
      nextFrame = event.data.frame + event.data.samples.length;
      break;
    }
    case "finish": {
      const wav = encodeWav(chunks, sampleCount, sampleRate);
      globalThis.postMessage(
        {
          type: "result",
          wav,
          sampleCount,
          firstFrame,
          discontinuityFrames,
        },
        { transfer: [wav] },
      );
      break;
    }
  }
};

function encodeWav(
  sourceChunks: Float32Array[],
  totalSamples: number,
  sourceSampleRate: number,
): ArrayBuffer {
  const bytesPerSample = 2;
  const dataLength = totalSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeText(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeText(view, 8, "WAVE");
  writeText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sourceSampleRate, true);
  view.setUint32(28, sourceSampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const chunk of sourceChunks) {
    for (const sample of chunk) {
      const value = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}

function writeText(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index++) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
