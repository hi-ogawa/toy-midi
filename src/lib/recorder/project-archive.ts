import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "./persistence.ts";

const CURRENT_FORMAT_VERSION: RecorderProjectManifest["formatVersion"] = 1;
const PROJECT_PATH = "project.json";

interface RecorderProjectManifest {
  formatVersion: 1;
  projectType: "recorder";
  exportedAt: string;
  title: string;
}

interface RecorderProjectFileContent extends Omit<
  SerializedRecorderRuntimeState,
  "audioTracks" | "recordingTrack"
> {
  audioTracks: RecorderProjectAudioTrack[];
  recordingTrack: RecorderProjectRecordingTrack;
}

interface RecorderProjectAudioTrack extends Omit<
  SerializedRecorderRuntimeState["audioTracks"][number],
  "clip"
> {
  clip?: {
    name: string;
    pcm: RecorderProjectPcm;
  };
}

interface RecorderProjectRecordingTrack extends Omit<
  SerializedRecorderRuntimeState["recordingTrack"],
  "takes"
> {
  takes: RecorderProjectTake[];
}

interface RecorderProjectTake extends Omit<
  SerializedRecorderRuntimeState["recordingTrack"]["takes"][number],
  "pcm"
> {
  pcm: RecorderProjectPcm;
}

interface RecorderProjectPcm {
  sampleRate: number;
  channels: string[];
}

interface ParsedRecorderProjectFile {
  title: string;
  content: SerializedRecorderRuntimeState;
}

export async function exportRecorderProjectArchive(
  content: SerializedRecorderRuntimeState,
): Promise<Blob> {
  const zip = new JSZip();
  const manifest: RecorderProjectManifest = {
    formatVersion: CURRENT_FORMAT_VERSION,
    projectType: "recorder",
    exportedAt: new Date().toISOString(),
    title: content.title,
  };
  zip.file("manifest.json", JSON.stringify(manifest, undefined, 2));
  zip.file(
    PROJECT_PATH,
    JSON.stringify(toProjectFileContent({ zip, content })),
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function parseRecorderProjectArchive(
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
  if (typeof manifest.title !== "string") {
    throw new Error("Recorder project archive has an invalid manifest.");
  }
  const project = await readJson<RecorderProjectFileContent>({
    zip,
    path: PROJECT_PATH,
  });
  return {
    title: manifest.title,
    content: await fromProjectFileContent({ zip, content: project }),
  };
}

function toProjectFileContent({
  zip,
  content,
}: {
  zip: JSZip;
  content: SerializedRecorderRuntimeState;
}): RecorderProjectFileContent {
  return {
    ...content,
    audioTracks: content.audioTracks.map((track, trackIndex) => ({
      ...track,
      clip: track.clip
        ? {
            ...track.clip,
            pcm: toProjectPcm({
              zip,
              pcm: track.clip.pcm,
              path: `audio/tracks/${trackIndex}`,
            }),
          }
        : undefined,
    })),
    recordingTrack: {
      ...content.recordingTrack,
      takes: content.recordingTrack.takes.map((take, takeIndex) => ({
        ...take,
        pcm: toProjectPcm({
          zip,
          pcm: take.pcm,
          path: `audio/takes/${takeIndex}`,
        }),
      })),
    },
  };
}

async function fromProjectFileContent({
  zip,
  content,
}: {
  zip: JSZip;
  content: RecorderProjectFileContent;
}): Promise<SerializedRecorderRuntimeState> {
  if (
    !Array.isArray(content.audioTracks) ||
    !Array.isArray(content.recordingTrack?.takes)
  ) {
    throw new Error("Recorder project archive has invalid project data.");
  }
  return {
    ...content,
    audioTracks: await Promise.all(
      content.audioTracks.map(async (track) => ({
        ...track,
        clip: track.clip
          ? {
              ...track.clip,
              pcm: await fromProjectPcm({ zip, pcm: track.clip.pcm }),
            }
          : undefined,
      })),
    ),
    recordingTrack: {
      ...content.recordingTrack,
      takes: await Promise.all(
        content.recordingTrack.takes.map(async (take) => ({
          ...take,
          pcm: await fromProjectPcm({ zip, pcm: take.pcm }),
        })),
      ),
    },
  };
}

function toProjectPcm({
  zip,
  pcm,
  path,
}: {
  zip: JSZip;
  pcm: { sampleRate: number; channels: Float32Array[] };
  path: string;
}): RecorderProjectPcm {
  return {
    sampleRate: pcm.sampleRate,
    channels: pcm.channels.map((channel, channelIndex) => {
      const channelPath = `${path}/channel-${channelIndex}.f32`;
      const bytes = new Uint8Array(channel.byteLength);
      bytes.set(
        new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength),
      );
      zip.file(channelPath, bytes);
      return channelPath;
    }),
  };
}

async function fromProjectPcm({
  zip,
  pcm,
}: {
  zip: JSZip;
  pcm: RecorderProjectPcm;
}): Promise<{ sampleRate: number; channels: Float32Array[] }> {
  if (
    !Number.isFinite(pcm?.sampleRate) ||
    pcm.sampleRate <= 0 ||
    !Array.isArray(pcm.channels) ||
    pcm.channels.length === 0 ||
    pcm.channels.some(
      (path) => typeof path !== "string" || !path.startsWith("audio/"),
    ) ||
    new Set(pcm.channels).size !== pcm.channels.length
  ) {
    throw new Error("Recorder project archive has invalid audio data.");
  }
  const channels = await Promise.all(
    pcm.channels.map(async (path) => {
      const entry = zip.file(path);
      if (!entry) {
        throw new Error(`Recorder project archive is missing ${path}.`);
      }
      const buffer = await entry.async("arraybuffer");
      if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
        throw new Error("Recorder project archive has invalid audio data.");
      }
      return new Float32Array(buffer);
    }),
  );
  if (channels.some((channel) => channel.length !== channels[0]?.length)) {
    throw new Error("Recorder project archive has invalid audio data.");
  }
  return {
    sampleRate: pcm.sampleRate,
    channels,
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
