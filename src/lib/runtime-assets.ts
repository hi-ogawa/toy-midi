import { toast } from "sonner";
import { memo } from "../utils/memo.ts";
import { createWorkerRpc } from "./rpc/worker.ts";
import type { SoundfontDecoderWorkerHandlers } from "./soundfont-decoder-worker.ts";
import { GENERAL_USER_SOUNDFONT, type Soundfont } from "./soundfonts.ts";

export interface LoadedSoundfont {
  soundfont: ArrayBuffer;
  /** Every sample decoded, in the file's order, when decoded in a worker */
  samples?: Float32Array[];
}

/**
 * Resolves to the SoundFont, showing one loading indicator per SoundFont
 * across tracks while it loads. Each call resolves to its own copy, because
 * posting to a synth transfers the buffers.
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

const loadSharedSoundfont = memo(
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
      // The RPC call transfers the bytes to the worker, so send a copy.
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

// The idle preload and the loader share one download, because Chromium fails some of several concurrent
// requests for the same large file with ERR_CACHE_WRITE_FAILURE.
const downloadSoundfont = memo(async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.arrayBuffer();
});

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
