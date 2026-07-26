import JSZip from "jszip";
import { toast } from "sonner";
import * as Tone from "tone";
import { type AudioView, createAudioView } from "./audio-view";

const AUDIO_MIME_TYPES: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
};

export async function resolveAudioFiles(file: File): Promise<File[]> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return [file];
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("Could not read ZIP file.");
  }

  const files: File[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) {
      continue;
    }
    const name = entry.name.split("/").at(-1) ?? "";
    const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
    const type = AUDIO_MIME_TYPES[extension];
    if (name && type) {
      files.push(new File([await entry.async("blob")], name, { type }));
    }
  }
  if (files.length === 0) {
    throw new Error("ZIP does not contain a supported audio file.");
  }
  return files;
}

// Derive this from the max supported zoom: one point per pixel with four beats
// visible in a 1920px viewport at 100 BPM.
const POINTS_PER_SECOND = 800;
const MAX_AUDIO_DURATION_SECONDS = 600;

// Decode an audio file and prepare its waveform. Long files remain playable,
// but skip waveform extraction to avoid blocking the main thread.
export async function loadAudioFile(file: File): Promise<{
  buffer: Tone.ToneAudioBuffer;
  audioView?: AudioView;
  duration: number;
}> {
  const url = URL.createObjectURL(file);
  try {
    const buffer = await Tone.ToneAudioBuffer.fromUrl(url);
    if (buffer.duration > MAX_AUDIO_DURATION_SECONDS) {
      toast.warning(
        `Audio too long (${Math.round(buffer.duration / 60)} min). Waveform disabled.`,
      );
      return { buffer, duration: buffer.duration };
    }

    const audioView = createAudioView(
      buffer.getChannelData(0),
      buffer.sampleRate,
      POINTS_PER_SECOND,
    );
    return { buffer, audioView, duration: buffer.duration };
  } finally {
    URL.revokeObjectURL(url);
  }
}
