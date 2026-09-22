export type AudioPlayback = {
  finished: Promise<void>;
  stop(): void;
};

export function playAudioBuffers({
  buffers,
  context,
  when,
}: {
  buffers: AudioBuffer[];
  context: AudioContext;
  when: number;
}): AudioPlayback {
  const sources: AudioBufferSourceNode[] = [];
  const finished = Promise.withResolvers<void>();
  const stop = () => {
    for (const source of sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    sources.length = 0;
    finished.resolve();
  };
  let remaining = buffers.length;
  try {
    for (const buffer of buffers) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (--remaining === 0) {
          stop();
        }
      };
      source.start(when);
      sources.push(source);
    }
  } catch (error) {
    stop();
    throw error;
  }
  return { finished: finished.promise, stop };
}

export function createAudioBuffer(
  context: AudioContext,
  samples: Float32Array,
  sampleRate: number,
) {
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}
