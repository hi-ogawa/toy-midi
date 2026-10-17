/**
 * Renders in a temporary iframe and returns the result copied into this page.
 * Chromium never collects an OfflineAudioContext that has loaded an AudioWorklet
 * module, so its render target would stay in memory for the life of the page.
 * Removing the iframe tears the context down with it.
 */
export async function renderOfflineInFrame(
  options: OfflineAudioContextOptions,
  setup: (context: OfflineAudioContext) => Promise<void>,
): Promise<AudioBuffer> {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  document.body.append(frame);
  try {
    const frameWindow = frame.contentWindow as Window & typeof globalThis;
    const context = new frameWindow.OfflineAudioContext(options);
    await setup(context);
    const rendered = await context.startRendering();
    const buffer = new AudioBuffer({
      numberOfChannels: rendered.numberOfChannels,
      length: rendered.length,
      sampleRate: rendered.sampleRate,
    });
    for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
      buffer.copyToChannel(rendered.getChannelData(channel), channel);
    }
    return buffer;
  } finally {
    frame.remove();
  }
}
