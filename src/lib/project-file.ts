// .toymidi project file format: ZIP containing manifest.json, project.json, and optional audio

import JSZip from "jszip";
import {
  migrateSavedAudioTracks,
  type SavedAudioTrack,
  type SavedProject,
} from "../stores/project-store";
import { loadAsset, saveAsset } from "./asset-store";
import { buildExportFileName } from "./export-utils";

// Manifest schema for .toymidi files
//
// formatVersion history:
//   1 - single audio file at `files.audio` (string)
//   2 - multiple audio files at `files.audio` (array of { trackId, path })
export interface ProjectManifest {
  formatVersion: 1 | 2;
  exportedAt: string; // ISO timestamp
  name: string;
  files: {
    project: "project.json";
    // v2: per-track audio entries; v1 (legacy): single path string
    audio?: Array<{ trackId: string; path: string }> | string;
  };
}

const CURRENT_FORMAT_VERSION = 2;

type ProjectFileAudioTrack = Omit<SavedAudioTrack, "assetKey"> & {
  // Bundled .toymidi files store audio blobs in the zip, not IndexedDB.
  assetKey?: string | null;
};

type ProjectFileProject = Omit<SavedProject, "audioTracks"> & {
  audioTracks?: ProjectFileAudioTrack[];
};

type ParsedProjectTrack = ProjectFileAudioTrack & { assetKey?: string | null };

type ParsedProjectData = Omit<SavedProject, "audioTracks"> & {
  audioTracks: ParsedProjectTrack[];
};

// Result of parsing a .toymidi file
export interface ParsedProjectFile {
  manifest: ProjectManifest;
  project: ParsedProjectData; // normalized to project-file shape (audioTracks array)
  // Reconstructed audio File objects keyed by track id
  audioFiles: Map<string, File>;
}

// Build a File object from a blob, inferring MIME type from the file extension
function fileFromBlob(blob: Blob, fileName: string): File {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const mimeType =
    ext === "mp3"
      ? "audio/mpeg"
      : ext === "wav"
        ? "audio/wav"
        : ext === "ogg"
          ? "audio/ogg"
          : "audio/wav";
  return new File([blob], fileName, { type: mimeType });
}

/**
 * Export a project to a .toymidi ZIP file
 */
export async function exportProjectFile(
  projectName: string,
  projectData: SavedProject,
): Promise<Blob> {
  const zip = new JSZip();

  const audioEntries: Array<{ trackId: string; path: string }> = [];

  // Bundle each track's audio asset and record its path in the manifest
  const tracks = migrateSavedAudioTracks(projectData);
  for (const track of tracks) {
    if (!track.assetKey) {
      continue;
    }
    const asset = await loadAsset(track.assetKey);
    if (!asset) {
      continue;
    }
    const fileName = track.fileName || "audio.wav";
    // Prefix with track id to keep paths unique across tracks
    const audioPath = `audio/${track.id}-${fileName}`;
    audioEntries.push({ trackId: track.id, path: audioPath });
    zip.file(audioPath, asset.blob);
  }

  // Prepare manifest
  const manifest: ProjectManifest = {
    formatVersion: CURRENT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    name: projectName,
    files: {
      project: "project.json",
      ...(audioEntries.length > 0 ? { audio: audioEntries } : {}),
    },
  };

  // Add manifest
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // Add project data (strip asset keys since we're bundling the files)
  const projectForExport: ProjectFileProject = {
    ...projectData,
    audioTracks: tracks.map(({ assetKey: _assetKey, ...track }) => track),
  };
  zip.file("project.json", JSON.stringify(projectForExport, null, 2));

  // Generate ZIP
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/**
 * Download a .toymidi file
 */
export function downloadProjectFile(blob: Blob, projectName: string): void {
  const fileName = buildExportFileName({
    baseName: projectName,
    extension: ".toymidi",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse a .toymidi file and extract its contents
 */
export async function parseProjectFile(file: File): Promise<ParsedProjectFile> {
  const zip = await JSZip.loadAsync(file);

  // Read manifest
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Invalid project file: missing manifest.json");
  }
  const manifestText = await manifestFile.async("text");
  const manifest = JSON.parse(manifestText) as ProjectManifest;

  // Validate manifest version
  if (manifest.formatVersion > CURRENT_FORMAT_VERSION) {
    throw new Error(
      `Project file requires newer app version (format v${manifest.formatVersion})`,
    );
  }

  // Read project data
  const projectFile = zip.file(manifest.files.project);
  if (!projectFile) {
    throw new Error("Invalid project file: missing project.json");
  }
  const projectText = await projectFile.async("text");
  const rawProject = JSON.parse(projectText) as ProjectFileProject;

  // Normalize to current shape (migrate legacy singleton audio fields)
  const audioTracks = Array.isArray(rawProject.audioTracks)
    ? rawProject.audioTracks
    : migrateSavedAudioTracks({
        audioFileName: rawProject.audioFileName,
        audioAssetKey: rawProject.audioAssetKey,
        audioDuration: rawProject.audioDuration,
        audioOffset: rawProject.audioOffset,
        audioVolume: rawProject.audioVolume,
        audioMuted: rawProject.audioMuted,
      });
  const project: ParsedProjectData = { ...rawProject, audioTracks };

  // Reconstruct audio files keyed by track id
  const audioFiles = new Map<string, File>();
  const manifestAudio = manifest.files.audio;

  if (Array.isArray(manifestAudio)) {
    // v2: explicit per-track entries
    for (const entry of manifestAudio) {
      const audioZipFile = zip.file(entry.path);
      if (!audioZipFile) {
        continue;
      }
      const blob = await audioZipFile.async("blob");
      const track = audioTracks.find((t) => t.id === entry.trackId);
      const fileName =
        track?.fileName || entry.path.split("/").pop() || "audio.wav";
      audioFiles.set(entry.trackId, fileFromBlob(blob, fileName));
    }
  } else if (typeof manifestAudio === "string") {
    // v1 (legacy): single audio path maps to the migrated single track
    const audioZipFile = zip.file(manifestAudio);
    const track = audioTracks[0];
    if (audioZipFile && track) {
      const blob = await audioZipFile.async("blob");
      const fileName =
        track.fileName || manifestAudio.split("/").pop() || "audio.wav";
      audioFiles.set(track.id, fileFromBlob(blob, fileName));
    }
  }

  return { manifest, project, audioFiles };
}

/**
 * Import a parsed project file: save audio files to IndexedDB and return
 * updated project data with fresh asset keys.
 */
export async function importProjectAudio(
  parsed: ParsedProjectFile,
): Promise<SavedProject> {
  const audioTracks: SavedAudioTrack[] = [];
  for (const track of parsed.project.audioTracks) {
    const file = parsed.audioFiles.get(track.id);
    if (!file) {
      continue;
    }
    const assetKey = await saveAsset(file);
    audioTracks.push({ ...track, assetKey });
  }

  return { ...parsed.project, audioTracks };
}
