import { toast } from "sonner";
import { memoAsync } from "../utils/memo.ts";
import { createWorkerRpc } from "./rpc/worker.ts";
import type { SoundfontDecoderWorkerHandlers } from "./soundfont-decoder-worker.ts";

export interface Soundfont {
  /** Identifies the SoundFont among those a synth has loaded */
  id: string;
  name: string;
  url: string;
  /**
   * Decode every sample in a worker while the font loads, for a font whose
   * presets each use most of the file. Otherwise a synth decodes a preset's
   * samples on the audio thread when the preset is selected, which stalls
   * every track for as long as that takes.
   */
  decodeInWorker?: boolean;
}

export interface LoadedSoundfont {
  soundfont: ArrayBuffer;
  /** Every sample decoded, in the file's order, when decoded in a worker */
  samples?: Float32Array[];
}

export const GENERAL_USER_SOUNDFONT: Soundfont = {
  id: "general-user",
  name: "GeneralUser GS",
  url: "/soundfonts/GeneralUserGS-2.0.3.sf3",
};

/**
 * Resolves to the SoundFont, showing one loading indicator per SoundFont
 * across tracks while it loads. Each call resolves to its own copy, because
 * posting it to a synth transfers it.
 */
export async function loadSoundfont(
  soundfont: Soundfont,
): Promise<LoadedSoundfont> {
  const { soundfont: bytes, samples } = await loadSharedSoundfont(soundfont);
  return {
    soundfont: bytes.slice(0),
    samples: samples?.map((sample) => sample.slice()),
  };
}

const loadSharedSoundfont = memoAsync(
  async ({
    name,
    url,
    decodeInWorker,
  }: Soundfont): Promise<LoadedSoundfont> => {
    let toastId: string | number | undefined;
    const timer = setTimeout(() => {
      toastId = toast.loading(`Loading ${name} SoundFont…`);
    }, 300);
    try {
      const soundfont = await downloadSoundfont(url);
      // The worker takes the bytes it is sent, so it gets a copy.
      const samples = decodeInWorker
        ? await decodeSamples(soundfont.slice(0))
        : undefined;
      return { soundfont, samples };
    } catch (error) {
      toast.error(`Failed to load the ${name} SoundFont`);
      throw error;
    } finally {
      clearTimeout(timer);
      if (toastId !== undefined) {
        toast.dismiss(toastId);
      }
    }
  },
);

// Start the download after initial render on routes that lead to MIDI playback.
export function preloadMidiAssetsWhenIdle() {
  requestIdleCallback(() => {
    downloadSoundfont(GENERAL_USER_SOUNDFONT.url).catch(() => {});
  });
}

// Tracks share one download, because Chromium fails some of several concurrent
// requests for the same large file with ERR_CACHE_WRITE_FAILURE.
const downloadSoundfont = memoAsync(
  async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return await response.arrayBuffer();
  },
);

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
