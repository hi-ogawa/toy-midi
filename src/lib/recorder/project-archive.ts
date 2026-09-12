import JSZip from "jszip";
import type {
  RecorderPcm,
  SerializedRecorderRuntimeState,
} from "./persistence.ts";
import {
  migrateRecorderProject,
  type LegacyRecorderProject,
} from "./project-migration.ts";

// .toymidi.zip
// ├── manifest.json  { formatVersion: 2, projectType: "recorder", ... }
// ├── project.json   { audioTracks: [{ clips: [{ pcm: { channels:
// │                    ["audio/tracks/0/clips/0/channel-0.f32"] } }] }], ... }
// └── audio/tracks/
//     ├── 0/clips/0/channel-0.f32
//     └── 1/clips/0/channel-0.f32
//
// project.json serializes SerializedRecorderRuntimeState<string>, replacing
// each PCM channel's Float32Array with its ZIP entry path. The samples are
// stored separately in the referenced .f32 files.

const CURRENT_FORMAT_VERSION = 2;
const MANIFEST_PATH = "manifest.json";
const PROJECT_PATH = "project.json";

interface RecorderProjectManifest {
  formatVersion: number;
  projectType: "recorder";
  exportedAt: string;
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

export async function exportRecorderProjectArchiveV1(
  content: LegacyRecorderProject,
): Promise<Blob> {
  const zip = new JSZip();
  const manifest: RecorderProjectManifest = {
    formatVersion: 1,
    projectType: "recorder",
    exportedAt: new Date().toISOString(),
  };
  const project: LegacyRecorderProject<string> = {
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
  zip.file(MANIFEST_PATH, JSON.stringify(manifest, undefined, 2));
  zip.file(PROJECT_PATH, JSON.stringify(project));
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
  if (formatVersion === 1) {
    const project = await readJson<LegacyRecorderProject<string>>(
      zip,
      PROJECT_PATH,
    );
    return migrateRecorderProject(await readProjectContentV1(zip, project));
  }
  const project = await readJson<SerializedRecorderRuntimeState<string>>(
    zip,
    PROJECT_PATH,
  );
  return readProjectContent(zip, project);
}

function writeProjectContent(
  zip: JSZip,
  content: SerializedRecorderRuntimeState,
): SerializedRecorderRuntimeState<string> {
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
  content: SerializedRecorderRuntimeState<string>,
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

async function readProjectContentV1(
  zip: JSZip,
  content: LegacyRecorderProject<string>,
): Promise<LegacyRecorderProject> {
  return {
    ...content,
    audioTracks: await Promise.all(
      content.audioTracks.map(async (track) => ({
        ...track,
        clip: track.clip
          ? { ...track.clip, pcm: await readProjectPcm(zip, track.clip.pcm) }
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
  pcm: RecorderPcm<Float32Array>,
  path: string,
): RecorderPcm<string> {
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
  pcm: RecorderPcm<string>,
): Promise<RecorderPcm<Float32Array>> {
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
