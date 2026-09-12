import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "./persistence.ts";
import {
  migrateRecorderProject,
  type RecorderProjectInput,
} from "./project-migration.ts";

// Audio channels are stored at audio/tracks/<track>/clips/<clip>/channel-<channel>.f32.
const CURRENT_FORMAT_VERSION = 2;
const MANIFEST_PATH = "manifest.json";
const PROJECT_PATH = "project.json";

interface RecorderProjectManifest {
  formatVersion: number;
  projectType: "recorder";
  exportedAt: string;
}

type RecorderProjectFileContent = SerializedRecorderRuntimeState<string>;
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
  const project = await readJson<RecorderProjectInput<string>>(
    zip,
    PROJECT_PATH,
  );
  return readProjectContent(zip, migrateRecorderProject(project));
}

function writeProjectContent(
  zip: JSZip,
  content: SerializedRecorderRuntimeState,
): RecorderProjectFileContent {
  return {
    ...content,
    audioTracks: content.audioTracks.map((track, trackIndex) => ({
      ...track,
      clips: track.clips.map((clip, clipIndex) => ({
        ...clip,
        pcm: writeProjectPcm(
          zip,
          clip.pcm,
          `audio/tracks/${trackIndex}/clips/${clipIndex}`,
        ),
      })),
    })),
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
        clips: await Promise.all(
          track.clips.map(async (clip) => ({
            ...clip,
            pcm: await readProjectPcm(zip, clip.pcm),
          })),
        ),
      })),
    ),
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
      zip.file(channelPath, bytes, { compression: "STORE" });
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
