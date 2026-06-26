// .toymidi project file format: ZIP containing manifest.json, project.json, and optional audio

import JSZip from "jszip";
import type { SavedAudioTrack, SavedProject } from "../stores/project-store";
import { loadAsset, saveAsset } from "./asset-store";
import { buildExportFileName } from "./export-utils";

// Manifest schema for .toymidi files
export interface ProjectManifest {
  formatVersion: 1;
  exportedAt: string; // ISO timestamp
  name: string;
  files: {
    project: "project.json";
    audio?: string; // e.g., "audio/track.wav"
    audioTracks?: Array<{ id: string; path: string }>;
  };
}

// Result of parsing a .toymidi file
export interface ParsedProjectFile {
  manifest: ProjectManifest;
  project: SavedProject;
  audioFile?: File; // Reconstructed File object for audio
  audioFiles?: Array<{ id: string; file: File }>;
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
  const exportedAudioTracks: SavedAudioTrack[] = [];
  for (const track of projectData.audioTracks) {
    if (!track.assetKey) {
      exportedAudioTracks.push(track);
      continue;
    }
    const asset = await loadAsset(track.assetKey);
    if (asset) {
      const audioPath = `audio/${track.id}-${track.fileName}`;
      manifest.files.audioTracks ??= [];
      manifest.files.audioTracks.push({ id: track.id, path: audioPath });
      zip.file(audioPath, asset.blob);
    }
    exportedAudioTracks.push({ ...track, assetKey: null });
  }

  // Add manifest
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // Add project data (strip asset keys since bundled files regenerate them on import)
  const projectForExport: SavedProject = {
    ...projectData,
    audioTracks: exportedAudioTracks,
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
  let audioFile: File | undefined;
  const audioFiles: Array<{ id: string; file: File }> = [];
  if (manifest.files.audioTracks) {
    for (const audioTrack of manifest.files.audioTracks) {
      const audioZipFile = zip.file(audioTrack.path);
      if (audioZipFile) {
        const audioBlob = await audioZipFile.async("blob");
        const fileName =
          project.audioTracks?.find((track) => track.id === audioTrack.id)
            ?.fileName ??
          audioTrack.path.split("/").pop() ??
          "audio.wav";
        audioFiles.push({
          id: audioTrack.id,
          file: new File([audioBlob], fileName, {
            type: audioMimeType(fileName),
          }),
        });
      }
    }
  }
  if (manifest.files.audio) {
    const audioZipFile = zip.file(manifest.files.audio);
    if (audioZipFile) {
      const audioBlob = await audioZipFile.async("blob");
      const audioFileName =
        project.audioFileName ||
        manifest.files.audio.split("/").pop() ||
        "audio.wav";

      audioFile = new File([audioBlob], audioFileName, {
        type: audioMimeType(audioFileName),
      });
    }
  }

  return {
    manifest,
    project,
    audioFile,
    audioFiles,
  };
}

/**
 * Import a parsed project file: save audio to IndexedDB and return updated project data
 */
export async function importProjectAudio(
  parsed: ParsedProjectFile,
): Promise<SavedProject> {
  let updatedProject = normalizeAudioTracks(parsed.project);

  if (parsed.audioFiles) {
    for (const { id, file } of parsed.audioFiles) {
      const assetKey = await saveAsset(file);
      updatedProject = {
        ...updatedProject,
        audioTracks: updatedProject.audioTracks.map((track) =>
          track.id === id ? { ...track, assetKey } : track,
        ),
      };
    }
  }

  // Legacy single-audio project file support.
  if (parsed.audioFile) {
    const assetKey = await saveAsset(parsed.audioFile);
    updatedProject = {
      ...updatedProject,
      audioTracks: updatedProject.audioTracks.map((track, i) =>
        i === 0 ? { ...track, assetKey } : track,
      ),
    };
  }

  return updatedProject;
}

function normalizeAudioTracks(project: SavedProject): SavedProject {
  if (project.audioTracks) {
    return { ...project };
  }
  if (!project.audioAssetKey) {
    return { ...project, audioTracks: [] };
  }
  return {
    ...project,
    audioTracks: [
      {
        id: "audio-1",
        fileName: project.audioFileName ?? "audio.wav",
        assetKey: project.audioAssetKey,
        duration: project.audioDuration ?? 0,
        offset: project.audioOffset ?? 0,
        volume: project.audioVolume ?? 0.8,
        muted: project.audioMuted ?? false,
      },
    ],
  };
}

function audioMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext === "mp3"
    ? "audio/mpeg"
    : ext === "wav"
      ? "audio/wav"
      : ext === "ogg"
        ? "audio/ogg"
        : "audio/wav";
}
