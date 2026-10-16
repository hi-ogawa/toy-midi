import { toast } from "sonner";
import { memo } from "../utils/memo.ts";
import { GENERAL_USER_SOUNDFONT, type Soundfont } from "./soundfonts.ts";

/**
 * Resolves to the SoundFont's bytes, showing one loading indicator per
 * SoundFont across tracks while it downloads. Each call resolves to its own
 * copy, because posting the bytes to a synth transfers them.
 */
export async function loadSoundfont(
  soundfont: Soundfont,
): Promise<ArrayBuffer> {
  return (await loadSharedSoundfont(soundfont)).slice(0);
}

const loadSharedSoundfont = memo(
  async ({ name, url }: Soundfont): Promise<ArrayBuffer> => {
    let toastId: string | number | undefined;
    const timer = setTimeout(() => {
      toastId = toast.loading(`Loading ${name} SoundFont…`);
    }, 300);
    try {
      return await downloadSoundfont(url);
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
const downloadSoundfont = memo(async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.arrayBuffer();
});
