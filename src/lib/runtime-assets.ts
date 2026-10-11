import { toast } from "sonner";
import wasmUrl from "../assets/oxisynth/oxisynth.wasm?url";
import workletUrl from "../assets/oxisynth/worklet.js?url";
import soundfontUrl from "../assets/soundfonts/A320U.sf2?url";

export const midiAssetUrls = { wasmUrl, workletUrl, soundfontUrl };

let preloadPromise: Promise<void> | undefined;
let demandPromise: Promise<void> | undefined;

// Share one indicator across MIDI consumers, starting the delay at first demand.
export function waitForMidiAssets(): Promise<void> {
  return (demandPromise ??= (async () => {
    let toastId: string | number | undefined;
    const timer = setTimeout(() => {
      toastId = toast.loading("Loading MIDI soundfont…");
    }, 300);
    try {
      await preloadMidiAssets();
    } finally {
      clearTimeout(timer);
      if (toastId !== undefined) {
        toast.dismiss(toastId);
      }
    }
  })());
}

// Warm the cache after initial render on routes that lead to MIDI playback.
export function preloadMidiAssetsWhenIdle() {
  requestIdleCallback(() => {
    void preloadMidiAssets();
  });
}

// Warm the browser cache silently. Synth initialization still handles asset failures.
function preloadMidiAssets(): Promise<void> {
  return (preloadPromise ??= Promise.allSettled(
    Object.values(midiAssetUrls).map(preloadAsset),
  ).then(() => {}));
}

function preloadAsset(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "fetch";
    link.crossOrigin = "anonymous";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to preload ${href}`));
    document.head.appendChild(link);
  });
}
