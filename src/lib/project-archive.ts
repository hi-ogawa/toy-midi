import JSZip from "jszip";
import type { Pcm, SerializedEditorRuntimeState } from "./persistence.ts";

// .toymidi.zip
// ├── manifest.json  { formatVersion: 1, projectType: "recorder", ... }
// ├── project.json   { audioTracks: [{ clips: [{ pcm: { channels:
// │                    ["audio/tracks/0/clips/0/channel-0.f32"] } }] }], ... }
// └── audio/tracks/
//     ├── 0/clips/0/channel-0.f32
//     └── 1/clips/0/channel-0.f32
//
// project.json serializes SerializedEditorRuntimeState<string>, replacing
// each PCM channel's Float32Array with its ZIP entry path. The samples are
// stored separately in the referenced .f32 files. Archives written before
// per-track clip arrays store a single track clip at audio/tracks/0/ and
// the separate recording track's takes at audio/takes/0/.

const CURRENT_FORMAT_VERSION: ProjectManifest["formatVersion"] = 1;
const MANIFEST_PATH = "manifest.json";
const PROJECT_PATH = "project.json";

interface ProjectManifest {
  formatVersion: 1;
  projectType: "recorder";
  exportedAt: string;
}

// E2E tests also call this directly from Node to build archives to import,
// including older project shapes.
export async function exportProjectArchive(
  content: SerializedEditorRuntimeState,
): Promise<Blob> {
  const zip = new JSZip();
  const manifest: ProjectManifest = {
    formatVersion: CURRENT_FORMAT_VERSION,
    projectType: "recorder",
    exportedAt: new Date().toISOString(),
  };
  zip.file(MANIFEST_PATH, JSON.stringify(manifest, undefined, 2));
  zip.file(PROJECT_PATH, JSON.stringify(writeProjectContent(zip, content)));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function readProjectArchiveBlob(
  archive: Blob,
): Promise<SerializedEditorRuntimeState> {
  return readProjectArchive(await JSZip.loadAsync(archive));
}

export async function readProjectArchive(
  zip: JSZip,
): Promise<SerializedEditorRuntimeState> {
  const manifest = await readJson<ProjectManifest>(zip, MANIFEST_PATH);
  if (manifest.projectType !== "recorder") {
    throw new Error("This is not a project archive.");
  }
  const formatVersion = manifest.formatVersion;
  if (
    !Number.isInteger(formatVersion) ||
    !formatVersion ||
    formatVersion < 1 ||
    formatVersion > CURRENT_FORMAT_VERSION
  ) {
    throw new Error(
      `Project archive requires a newer app version (format v${String(manifest.formatVersion)}).`,
    );
  }
  const project = await readJson<SerializedEditorRuntimeState<string>>(
    zip,
    PROJECT_PATH,
  );
  return readProjectContent(zip, project);
}

function writeProjectContent(
  zip: JSZip,
  content: SerializedEditorRuntimeState,
): SerializedEditorRuntimeState<string> {
  return {
    ...content,
    audioTracks: content.audioTracks.map((track, trackIndex) => ({
      ...track,
      // Convert every PCM field the project type allows, mirroring the reader.
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
      clips: track.clips?.map((clip, clipIndex) => ({
        ...clip,
        pcm: writeProjectPcm(
          zip,
          clip.pcm,
          `audio/tracks/${trackIndex}/clips/${clipIndex}`,
        ),
      })),
    })),
    recordingTrack: content.recordingTrack && {
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
  content: SerializedEditorRuntimeState<string>,
): Promise<SerializedEditorRuntimeState> {
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
        clips:
          track.clips &&
          (await Promise.all(
            track.clips.map(async (clip) => ({
              ...clip,
              pcm: await readProjectPcm(zip, clip.pcm),
            })),
          )),
      })),
    ),
    recordingTrack: content.recordingTrack && {
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
  pcm: Pcm<Float32Array>,
  path: string,
): Pcm<string> {
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
  pcm: Pcm<string>,
): Promise<Pcm<Float32Array>> {
  const channels = await Promise.all(
    pcm.channels.map(async (path) => {
      const entry = zip.file(path);
      if (!entry) {
        throw new Error(`Project archive is missing ${path}.`);
      }
      const buffer = await entry.async("arraybuffer");
      if (buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
        throw new Error("Project archive has invalid audio data.");
      }
      return new Float32Array(buffer);
    }),
  );
  if (channels.some((channel) => channel.length !== channels[0]?.length)) {
    throw new Error("Project archive has invalid audio data.");
  }
  return {
    sampleRate: pcm.sampleRate,
    channels,
  };
}

async function readJson<T>(zip: JSZip, path: string): Promise<T> {
  const entry = zip.file(path);
  if (!entry) {
    throw new Error(`Project archive is missing ${path}.`);
  }
  try {
    return JSON.parse(await entry.async("text")) as T;
  } catch {
    throw new Error(`Project archive contains invalid ${path}.`);
  }
}
