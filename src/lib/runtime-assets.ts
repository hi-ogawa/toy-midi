import { toast } from "sonner";
import wasmUrl from "../assets/oxisynth/oxisynth.wasm?url";
import workletUrl from "../assets/oxisynth/worklet.js?url";

// The shared HTTP cache evicts the large soundfont under unrelated browsing, so
// keep it in origin-scoped Cache Storage. The stable public URL is the cache key,
// so rename the file when its contents change.
const soundfontUrl = "/soundfonts/A320U.sf2";
const SOUNDFONT_CACHE = "midi-soundfont";

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

// Warm the caches silently. Synth initialization still handles asset failures.
function preloadMidiAssets(): Promise<void> {
  return (preloadPromise ??= Promise.allSettled([
    preloadAsset(wasmUrl),
    preloadAsset(workletUrl),
    ensureSoundfontCached(),
  ]).then(() => {}));
}

export async function fetchSoundfont(): Promise<ArrayBuffer> {
  const cache = await ensureSoundfontCached();
  const response = await cache.match(soundfontUrl);
  if (!response) {
    throw new Error(`Missing cached ${soundfontUrl}`);
  }
  return response.arrayBuffer();
}

async function ensureSoundfontCached(): Promise<Cache> {
  const cache = await caches.open(SOUNDFONT_CACHE);
  if (!(await cache.match(soundfontUrl))) {
    await cache.add(soundfontUrl);
  }
  return cache;
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
