const MODEL_SAMPLE_RATE = 22050;

// The model requires mono 22,050 Hz PCM. OfflineAudioContext is unavailable
// in workers, so downmix/resample on the main thread and transfer the result.
export async function resampleToModelRate(
  buffer: AudioBuffer,
): Promise<Float32Array> {
  const context = new OfflineAudioContext(
    1,
    Math.ceil(buffer.duration * MODEL_SAMPLE_RATE),
    MODEL_SAMPLE_RATE,
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return (await context.startRendering()).getChannelData(0);
}
