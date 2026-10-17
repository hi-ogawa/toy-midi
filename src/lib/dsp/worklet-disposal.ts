/**
 * Keep process() returning true while the owner may reuse the processor, including
 * during input gaps. Although the spec allows false/undefined to follow active
 * inputs, our Chromium 151 EQ probe stopped after one callback without a return
 * value, before any explicit disconnection.
 *
 * Disconnecting alone while returning true leaves the processor active. Repeated
 * replacements accumulate audio-thread work, including pitch shifting on silence,
 * which can make graph rendering miss its deadlines and cause audible underruns.
 * Permanent teardown therefore sends a disposal message, closes the main-thread
 * port, and disconnects the node. The processor checks the watcher before DSP,
 * returning false once disposed. Pause must not dispose a processor intended for reuse.
 * https://webaudio.github.io/web-audio-api/#callback-audioworketprocess-callback
 */
export function disposeWorklet(node: AudioWorkletNode): void {
  node.port.postMessage({ type: "dispose" });
  node.port.close();
  node.disconnect();
}

/**
 * Install before other message handlers so disposal is consumed before them.
 *
 * Chromium 151 never collects an OfflineAudioContext that has loaded a worklet
 * module, so its processors outlive the render. `onDispose` lets a processor
 * holding large state release it, because `process()` never runs again after
 * an offline render to check the watcher.
 */
export function watchWorkletDisposal(
  port: MessagePort,
  onDispose?: () => void,
): () => boolean {
  let disposed = false;
  port.addEventListener("message", (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type !== "dispose") {
      return;
    }
    disposed = true;
    onDispose?.();
    // Other handlers may interpret every message as DSP settings.
    event.stopImmediatePropagation();
  });
  port.start();
  return () => disposed;
}
