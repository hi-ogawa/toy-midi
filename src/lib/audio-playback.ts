export type AudioPlayback = {
  finished: Promise<void>;
  stop(): void;
};

export function playAudioBuffers({
  buffers,
  context,
  gain = 1,
  when,
}: {
  buffers: AudioBuffer[];
  context: AudioContext;
  gain?: number;
  when: number;
}): AudioPlayback {
  const output = context.createGain();
  output.gain.value = gain;
  output.connect(context.destination);
  const sources: AudioBufferSourceNode[] = [];
  const finished = Promise.withResolvers<void>();
  const stop = () => {
    for (const source of sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    sources.length = 0;
    output.disconnect();
    finished.resolve();
  };
  let remaining = buffers.length;
  try {
    for (const buffer of buffers) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
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
