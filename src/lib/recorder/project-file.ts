import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "./persistence.ts";

interface RecorderProjectManifest {
  formatVersion: 1;
  projectType: "recorder";
  exportedAt: string;
  title: string;
  files: {
    project: "project.json";
  };
}

interface RecorderProjectFileContent extends Omit<
  SerializedRecorderRuntimeState,
  "audioTracks" | "recordingTrack"
> {
  audioTracks: Array<
    Omit<SerializedRecorderRuntimeState["audioTracks"][number], "clip"> & {
      clip?: {
        name: string;
        pcm: RecorderProjectPcm;
      };
    }
  >;
  recordingTrack: Omit<
    SerializedRecorderRuntimeState["recordingTrack"],
    "takes"
  > & {
    takes: Array<
      Omit<
        SerializedRecorderRuntimeState["recordingTrack"]["takes"][number],
        "pcm"
      > & {
        pcm: RecorderProjectPcm;
      }
    >;
  };
}

interface RecorderProjectPcm {
  sampleRate: number;
  channels: number[][];
}

export interface ParsedRecorderProjectFile {
  title: string;
  content: SerializedRecorderRuntimeState;
}

const CURRENT_FORMAT_VERSION: RecorderProjectManifest["formatVersion"] = 1;

export async function exportRecorderProjectFile(
  content: SerializedRecorderRuntimeState,
): Promise<Blob> {
  const zip = new JSZip();
  const manifest: RecorderProjectManifest = {
    formatVersion: CURRENT_FORMAT_VERSION,
    projectType: "recorder",
    exportedAt: new Date().toISOString(),
    title: content.title,
    files: { project: "project.json" },
  };
  zip.file("manifest.json", JSON.stringify(manifest, undefined, 2));
  zip.file("project.json", JSON.stringify(toProjectFileContent(content)));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function parseRecorderProjectFile(
  file: File,
): Promise<ParsedRecorderProjectFile> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("Could not read project archive.");
  }

  const manifest = await readJson<Partial<RecorderProjectManifest>>({
    zip,
    path: "manifest.json",
  });
  if (manifest.projectType !== "recorder") {
    throw new Error("This is not a recorder project archive.");
  }
  const formatVersion = manifest.formatVersion;
  if (
    !Number.isInteger(formatVersion) ||
    !formatVersion ||
    formatVersion < 1 ||
    formatVersion > CURRENT_FORMAT_VERSION
  ) {
    throw new Error(
      `Recorder project archive requires a newer app version (format v${String(manifest.formatVersion)}).`,
    );
  }
  if (!manifest.files?.project || typeof manifest.title !== "string") {
    throw new Error("Recorder project archive has an invalid manifest.");
  }
  const project = await readJson<RecorderProjectFileContent>({
    zip,
    path: manifest.files.project,
  });
  return {
    title: manifest.title,
    content: fromProjectFileContent(project),
  };
}

function toProjectFileContent(
  content: SerializedRecorderRuntimeState,
): RecorderProjectFileContent {
  return {
    ...content,
    audioTracks: content.audioTracks.map((track) => ({
      ...track,
      clip: track.clip
        ? { ...track.clip, pcm: toProjectPcm(track.clip.pcm) }
        : undefined,
    })),
    recordingTrack: {
      ...content.recordingTrack,
      takes: content.recordingTrack.takes.map((take) => ({
        ...take,
        pcm: toProjectPcm(take.pcm),
      })),
    },
  };
}

function fromProjectFileContent(
  content: RecorderProjectFileContent,
): SerializedRecorderRuntimeState {
  if (
    !Array.isArray(content.audioTracks) ||
    !Array.isArray(content.recordingTrack?.takes)
  ) {
    throw new Error("Recorder project archive has invalid project data.");
  }
  return {
    ...content,
    audioTracks: content.audioTracks.map((track) => ({
      ...track,
      clip: track.clip
        ? { ...track.clip, pcm: fromProjectPcm(track.clip.pcm) }
        : undefined,
    })),
    recordingTrack: {
      ...content.recordingTrack,
      takes: content.recordingTrack.takes.map((take) => ({
        ...take,
        pcm: fromProjectPcm(take.pcm),
      })),
    },
  };
}

function toProjectPcm(pcm: {
  sampleRate: number;
  channels: Float32Array[];
}): RecorderProjectPcm {
  return {
    sampleRate: pcm.sampleRate,
    channels: pcm.channels.map((channel) => Array.from(channel)),
  };
}

function fromProjectPcm(pcm: RecorderProjectPcm): {
  sampleRate: number;
  channels: Float32Array[];
} {
  if (
    !Number.isFinite(pcm?.sampleRate) ||
    pcm.sampleRate <= 0 ||
    !Array.isArray(pcm.channels) ||
    pcm.channels.length === 0 ||
    pcm.channels.some((channel) => !Array.isArray(channel))
  ) {
    throw new Error("Recorder project archive has invalid audio data.");
  }
  return {
    sampleRate: pcm.sampleRate,
    channels: pcm.channels.map((channel) => Float32Array.from(channel)),
  };
}

async function readJson<T>({
  zip,
  path,
}: {
  zip: JSZip;
  path: string;
}): Promise<T> {
  const entry = zip.file(path);
  if (!entry) {
    throw new Error(`Recorder project archive is missing ${path}.`);
  }
  try {
    return JSON.parse(await entry.async("text")) as T;
  } catch {
    throw new Error(`Recorder project archive contains invalid ${path}.`);
  }
}
