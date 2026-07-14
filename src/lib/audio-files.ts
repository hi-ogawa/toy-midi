import JSZip from "jszip";

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
