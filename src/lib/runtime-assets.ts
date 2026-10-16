import { toast } from "sonner";
import workletUrl from "./midi-synth-worklet.ts?worker&url";
import { createWorkerRpc } from "./rpc/worker.ts";
import type { SoundfontDecoderWorkerHandlers } from "./soundfont-decoder-worker.ts";

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

export interface DecodedSoundfont {
  soundfont: ArrayBuffer;
  /** Every sample decoded, in the file's order */
  samples: Float32Array[];
}

const downloads = new Map<string, Promise<ArrayBuffer>>();
const demands = new Map<string, Promise<DecodedSoundfont>>();

/**
 * Resolves to the SoundFont with its samples decoded, showing one loading
 * indicator per SoundFont across tracks while it downloads and decodes. Each
 * call resolves to its own copy, because posting it to a synth transfers it.
 */
export async function loadSoundfont({
  name,
  url,
}: Soundfont): Promise<DecodedSoundfont> {
  let demand = demands.get(url);
  if (!demand) {
    demand = (async () => {
      let toastId: string | number | undefined;
      const timer = setTimeout(() => {
        toastId = toast.loading(`Loading ${name} SoundFont…`);
      }, 300);
      try {
        const soundfont = await downloadSoundfont(url);
        // The worker takes the bytes it is sent, so it gets a copy.
        const samples = await decodeSamples(soundfont.slice(0));
        return { soundfont, samples };
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
  const { soundfont, samples } = await demand;
  return {
    soundfont: soundfont.slice(0),
    samples: samples.map((sample) => sample.slice()),
  };
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

// Decoding a large SoundFont takes seconds, which on the audio thread would stall
// every track, so a worker decodes it.
async function decodeSamples(soundfont: ArrayBuffer): Promise<Float32Array[]> {
  const worker = new Worker(
    new URL("./soundfont-decoder-worker.ts", import.meta.url),
    { type: "module" },
  );
  try {
    return await createWorkerRpc<SoundfontDecoderWorkerHandlers>(
      worker,
    ).decodeSamples({ soundfont });
  } finally {
    worker.terminate();
  }
}

function preloadAsset(href: string): void {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "fetch";
  link.crossOrigin = "anonymous";
  link.href = href;
  document.head.appendChild(link);
}
