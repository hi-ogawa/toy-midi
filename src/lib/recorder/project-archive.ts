import JSZip from "jszip";
import type { SerializedRecorderRuntimeState } from "./persistence.ts";
import {
  migrateRecorderProject,
  type LegacyRecorderProject,
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

interface RecorderProjectFileContent extends Omit<
  SerializedRecorderRuntimeState,
  "audioTracks"
> {
  audioTracks: RecorderProjectAudioTrack[];
}

interface RecorderProjectAudioTrack extends Omit<
  SerializedRecorderRuntimeState["audioTracks"][number],
  "clips"
> {
  clips: RecorderProjectClip[];
}

interface RecorderProjectClip extends Omit<
  SerializedRecorderRuntimeState["audioTracks"][number]["clips"][number],
  "pcm"
> {
  pcm: RecorderProjectPcm;
}

interface RecorderProjectFileContentV1 extends Omit<
  LegacyRecorderProject,
  "audioTracks" | "recordingTrack"
> {
  audioTracks: RecorderProjectAudioTrackV1[];
  recordingTrack: RecorderProjectRecordingTrackV1;
}

interface RecorderProjectAudioTrackV1 extends Omit<
  LegacyRecorderProject["audioTracks"][number],
  "clip"
> {
  clip?: { name: string; pcm: RecorderProjectPcm };
}

interface RecorderProjectRecordingTrackV1 extends Omit<
  LegacyRecorderProject["recordingTrack"],
  "takes"
> {
  takes: RecorderProjectTakeV1[];
}

interface RecorderProjectTakeV1 extends Omit<
  LegacyRecorderProject["recordingTrack"]["takes"][number],
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

export async function exportRecorderProjectArchiveV1(
  content: LegacyRecorderProject,
): Promise<Blob> {
  const zip = new JSZip();
  const manifest: RecorderProjectManifest = {
    formatVersion: 1,
    projectType: "recorder",
    exportedAt: new Date().toISOString(),
  };
  const project: RecorderProjectFileContentV1 = {
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
    const project = await readJson<RecorderProjectFileContentV1>(
      zip,
      PROJECT_PATH,
    );
    return migrateRecorderProject(await readProjectContentV1(zip, project));
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

async function readProjectContentV1(
  zip: JSZip,
  content: RecorderProjectFileContentV1,
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
