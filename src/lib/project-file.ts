// .toymidi project file format: ZIP containing manifest.json, project.json, and optional audio

import JSZip from "jszip";
import type { SavedProject } from "../stores/project-store";
import { loadAsset, saveAsset } from "./asset-store";
import { buildExportFileName } from "./export-utils";

// Manifest schema for .toymidi files
export interface ProjectManifest {
  formatVersion: 1;
  exportedAt: string; // ISO timestamp
  name: string;
  files: {
    project: "project.json";
    audioTracks?: Record<string, string>; // { [trackId]: "audio/<trackId>/<fileName>" }
    audio?: string; // legacy single-audio path
  };
}

// Result of parsing a .toymidi file
export interface ParsedProjectFile {
  manifest: ProjectManifest;
  project: SavedProject;
  audioFilesByTrackId: Record<string, File>;
}

/**
 * Export a project to a .toymidi ZIP file
 */
export async function exportProjectFile(
  projectName: string,
  projectData: SavedProject,
): Promise<Blob> {
  const zip = new JSZip();

  // Prepare manifest
  const manifest: ProjectManifest = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    name: projectName,
    files: {
      project: "project.json",
    },
  };

  // If there are audio files, include them
  const audioTracks = projectData.audioTracks ?? [];
  for (const track of audioTracks) {
    if (!track.assetKey) {
      continue;
    }
    const asset = await loadAsset(track.assetKey);
    if (!asset) {
      continue;
    }
    const audioPath = `audio/${track.id}/${track.fileName}`;
    manifest.files.audioTracks ??= {};
    manifest.files.audioTracks[track.id] = audioPath;
    zip.file(audioPath, asset.blob);
  }

  // Add manifest
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // Add project data (strip asset keys since we're bundling files)
  const projectForExport: SavedProject = {
    ...projectData,
    audioTracks: (projectData.audioTracks ?? []).map((track) => ({
      ...track,
      assetKey: null,
    })),
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
  if (manifest.formatVersion > 1) {
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
  const project = JSON.parse(projectText) as SavedProject;

  // Read audio files if present
  const audioFilesByTrackId: Record<string, File> = {};
  const manifestAudioTracks = manifest.files.audioTracks;
  if (manifestAudioTracks) {
    for (const [trackId, audioPath] of Object.entries(manifestAudioTracks)) {
      const audioZipFile = zip.file(audioPath);
      if (!audioZipFile) {
        continue;
      }
      const audioBlob = await audioZipFile.async("blob");
      const track = project.audioTracks?.find((t) => t.id === trackId);
      const audioFileName =
        track?.fileName || audioPath.split("/").pop() || "audio.wav";
      const ext = audioFileName.split(".").pop()?.toLowerCase();
      const mimeType =
        ext === "mp3"
          ? "audio/mpeg"
          : ext === "wav"
            ? "audio/wav"
            : ext === "ogg"
              ? "audio/ogg"
              : "audio/wav";
      audioFilesByTrackId[trackId] = new File([audioBlob], audioFileName, {
        type: mimeType,
      });
    }
  } else if (manifest.files.audio) {
    // Legacy format: single audio file
    const audioZipFile = zip.file(manifest.files.audio);
    if (audioZipFile) {
      const audioBlob = await audioZipFile.async("blob");
      const legacyTrackId = project.audioTracks?.[0]?.id ?? "audio-track-0";
      const audioFileName =
        project.audioTracks?.[0]?.fileName ||
        manifest.files.audio.split("/").pop() ||
        "audio.wav";
      const ext = audioFileName.split(".").pop()?.toLowerCase();
      const mimeType =
        ext === "mp3"
          ? "audio/mpeg"
          : ext === "wav"
            ? "audio/wav"
            : ext === "ogg"
              ? "audio/ogg"
              : "audio/wav";
      audioFilesByTrackId[legacyTrackId] = new File(
        [audioBlob],
        audioFileName,
        {
          type: mimeType,
        },
      );
    }
  }

  return {
    manifest,
    project,
    audioFilesByTrackId,
  };
}

/**
 * Import a parsed project file: save audio to IndexedDB and return updated project data
 */
export async function importProjectAudio(
  parsed: ParsedProjectFile,
): Promise<SavedProject> {
  const tracks =
    parsed.project.audioTracks && parsed.project.audioTracks.length > 0
      ? parsed.project.audioTracks
      : parsed.project.audioFileName || (parsed.project.audioDuration ?? 0) > 0
        ? [
            {
              id: Object.keys(parsed.audioFilesByTrackId)[0] ?? "audio-track-0",
              fileName: parsed.project.audioFileName ?? "legacy-audio.wav",
              assetKey: null,
              duration: parsed.project.audioDuration ?? 0,
              offset: parsed.project.audioOffset ?? 0,
              volume: parsed.project.audioVolume ?? 0.8,
              muted: parsed.project.audioMuted ?? false,
            },
          ]
        : [];
  const updatedTracks = await Promise.all(
    tracks.map(async (track) => {
      const audioFile = parsed.audioFilesByTrackId[track.id];
      if (!audioFile) {
        return track;
      }
      const assetKey = await saveAsset(audioFile);
      return { ...track, assetKey };
    }),
  );

  return {
    ...parsed.project,
    audioTracks: updatedTracks,
  };
}
