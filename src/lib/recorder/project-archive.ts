import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "./persistence.ts";

// .toymidi.zip
// ├── manifest.json  { formatVersion: 1, projectType: "recorder", ... }
// ├── project.json   { audioTracks: [{ clip: { pcm: { channels:
// │                    ["audio/tracks/0/channel-0.f32"] } } }], ... }
// └── audio/
//     ├── tracks/0/channel-0.f32
//     └── takes/0/channel-0.f32

const CURRENT_FORMAT_VERSION: RecorderProjectManifest["formatVersion"] = 1;
const MANIFEST_PATH = "manifest.json";
const PROJECT_PATH = "project.json";

interface RecorderProjectManifest {
  formatVersion: 1;
  projectType: "recorder";
  exportedAt: string;
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

export async function exportRecorderProjectArchive(
  content: SerializedRecorderRuntimeState,
): Promise<Blob> {
  const zip = new JSZip();
  const manifest: RecorderProjectManifest = {
    formatVersion: CURRENT_FORMAT_VERSION,
    projectType: "recorder",
    exportedAt: new Date().toISOString(),
  };
  zip.file(MANIFEST_PATH, JSON.stringify(manifest, undefined, 2));
  zip.file(PROJECT_PATH, JSON.stringify(writeProjectContent(zip, content)));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function parseRecorderProjectArchive(
  file: File,
): Promise<SerializedRecorderRuntimeState> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("Could not read project archive.");
  }

  const manifest = await readJson<RecorderProjectManifest>(zip, MANIFEST_PATH);
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
  const project = await readJson<RecorderProjectFileContent>(zip, PROJECT_PATH);
  return readProjectContent(zip, project);
}

function writeProjectContent(
  zip: JSZip,
  content: SerializedRecorderRuntimeState,
): RecorderProjectFileContent {
  return {
    ...content,
    audioTracks: content.audioTracks.map((track, trackIndex) => ({
      ...track,
      clip: track.clip
        ? {
            ...track.clip,
            pcm: writeProjectPcm(
              zip,
              track.clip.pcm,
              `audio/tracks/${trackIndex}`,
            ),
          }
        : undefined,
    })),
    recordingTrack: {
      ...content.recordingTrack,
      takes: content.recordingTrack.takes.map((take, takeIndex) => ({
        ...take,
        pcm: writeProjectPcm(zip, take.pcm, `audio/takes/${takeIndex}`),
      })),
    },
  };
}

async function readProjectContent(
  zip: JSZip,
  content: RecorderProjectFileContent,
): Promise<SerializedRecorderRuntimeState> {
  return {
    ...content,
    audioTracks: await Promise.all(
      content.audioTracks.map(async (track) => ({
        ...track,
        clip: track.clip
          ? {
              ...track.clip,
              pcm: await readProjectPcm(zip, track.clip.pcm),
            }
          : undefined,
      })),
    ),
    recordingTrack: {
      ...content.recordingTrack,
      takes: await Promise.all(
        content.recordingTrack.takes.map(async (take) => ({
          ...take,
          pcm: await readProjectPcm(zip, take.pcm),
        })),
      ),
    },
  };
}

function writeProjectPcm(
  zip: JSZip,
  pcm: { sampleRate: number; channels: Float32Array[] },
  path: string,
): RecorderProjectPcm {
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

async function readProjectPcm(
  zip: JSZip,
  pcm: RecorderProjectPcm,
): Promise<{ sampleRate: number; channels: Float32Array[] }> {
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

async function readJson<T>(zip: JSZip, path: string): Promise<T> {
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
