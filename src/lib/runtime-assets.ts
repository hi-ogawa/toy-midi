import { toast } from "sonner";
import workletUrl from "./midi-synth-worklet.ts?worker&url";

export interface Soundfont {
  /** Identifies the SoundFont among those a synth has loaded */
  id: string;
  name: string;
  url: string;
}

export const GENERAL_USER_SOUNDFONT: Soundfont = {
  id: "general-user",
  name: "GeneralUser GS",
  url: "/soundfonts/GeneralUserGS-2.0.3.sf3",
};

export const midiWorkletUrl = workletUrl;

const downloads = new Map<string, Promise<ArrayBuffer>>();
const demands = new Map<string, Promise<ArrayBuffer>>();

/**
 * Resolves to the SoundFont's bytes, showing one loading indicator per
 * SoundFont across tracks while it downloads. Each call resolves to its own
 * copy, because posting the bytes to a synth transfers them.
 */
export async function loadSoundfont({
  name,
  url,
}: Soundfont): Promise<ArrayBuffer> {
  let demand = demands.get(url);
  if (!demand) {
    demand = (async () => {
      let toastId: string | number | undefined;
      const timer = setTimeout(() => {
        toastId = toast.loading(`Loading ${name} SoundFont…`);
      }, 300);
      try {
        return await downloadSoundfont(url);
      } catch (error) {
        demands.delete(url);
        toast.error(`Failed to load the ${name} SoundFont`);
        throw error;
      } finally {
        clearTimeout(timer);
        if (toastId !== undefined) {
          toast.dismiss(toastId);
        }
      }
    })();
    demands.set(url, demand);
  }
  return (await demand).slice(0);
}

// Start the downloads after initial render on routes that lead to MIDI playback.
export function preloadMidiAssetsWhenIdle() {
  requestIdleCallback(() => {
    preloadAsset(midiWorkletUrl);
    downloadSoundfont(GENERAL_USER_SOUNDFONT.url).catch(() => {});
  });
}

// Tracks share one download, because Chromium fails some of several concurrent
// requests for the same large file with ERR_CACHE_WRITE_FAILURE.
function downloadSoundfont(url: string): Promise<ArrayBuffer> {
  let download = downloads.get(url);
  if (!download) {
    download = (async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }
      return await response.arrayBuffer();
    })();
    download.catch(() => downloads.delete(url));
    downloads.set(url, download);
  }
  return download;
}

function preloadAsset(href: string): void {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "fetch";
  link.crossOrigin = "anonymous";
  link.href = href;
  document.head.appendChild(link);
}
