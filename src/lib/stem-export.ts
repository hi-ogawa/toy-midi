import JSZip from "jszip";
import { sanitizeFileName } from "./export-utils.ts";
import { encodeWav } from "./wav.ts";

/** Zip the mix with one WAV per stem, numbered in track order. */
export async function buildStemsArchive({
  mix,
  stems,
}: {
  mix: AudioBuffer;
  stems: AsyncIterable<{ name: string; buffer: AudioBuffer }>;
}): Promise<Blob> {
  const zip = new JSZip();
  zip.file("mix.wav", encodeWav(mix));
  let index = 0;
  for await (const stem of stems) {
    index++;
    zip.file(formatStemFileName(index, stem.name), encodeWav(stem.buffer));
  }
  // PCM barely compresses, so deflating only costs time.
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}

/** The index keeps track order when sorted by name and keeps duplicate track names apart. */
export function formatStemFileName(index: number, name: string): string {
  return `${String(index).padStart(2, "0")}-${sanitizeFileName(name)}.wav`;
}
