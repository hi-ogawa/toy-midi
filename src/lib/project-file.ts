// .toymidi project file format: ZIP containing manifest.json, project.json, and optional audio

import JSZip from "jszip";
import type { SavedProject } from "../stores/project-store";
import { loadAsset, saveAsset } from "./asset-store";

// Manifest schema for .toymidi files
export interface ProjectManifest {
  formatVersion: 1;
  exportedAt: string; // ISO timestamp
  name: string;
  files: {
    project: "project.json";
    audio?: string; // e.g., "audio/track.wav"
  };
}

// Result of parsing a .toymidi file
export interface ParsedProjectFile {
  manifest: ProjectManifest;
  project: SavedProject;
  audioFile?: File; // Reconstructed File object for audio
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

  // If there's an audio file, include it
  if (projectData.audioAssetKey) {
    const asset = await loadAsset(projectData.audioAssetKey);
    if (asset) {
      const audioFileName = projectData.audioFileName || "audio.wav";
      const audioPath = `audio/${audioFileName}`;
      manifest.files.audio = audioPath;
      zip.file(audioPath, asset.blob);
    }
  }

  // Add manifest
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // Add project data (strip the audioAssetKey since we're bundling the file)
  const projectForExport: SavedProject = {
    ...projectData,
    // Clear asset key - will be regenerated on import
    audioAssetKey: null,
  };
  zip.file("project.json", JSON.stringify(projectForExport, null, 2));

  // Generate ZIP
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

/**
 * Download a .toymidi file
 */
export function downloadProjectFile(blob: Blob, projectName: string): void {
  const timestamp = new Date()
    .toISOString()
    .replace(/[T:]/g, "-")
    .replace(/\.\d+Z$/, "");
  const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "_");
  const fileName = `${safeName}-${timestamp}.toymidi`;

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

  // Read audio file if present
  let audioFile: File | undefined;
  if (manifest.files.audio) {
    const audioZipFile = zip.file(manifest.files.audio);
    if (audioZipFile) {
      const audioBlob = await audioZipFile.async("blob");
      const audioFileName =
        project.audioFileName ||
        manifest.files.audio.split("/").pop() ||
        "audio.wav";

      // Determine MIME type from extension
      const ext = audioFileName.split(".").pop()?.toLowerCase();
      const mimeType =
        ext === "mp3"
          ? "audio/mpeg"
          : ext === "wav"
            ? "audio/wav"
            : ext === "ogg"
              ? "audio/ogg"
              : "audio/wav";

      audioFile = new File([audioBlob], audioFileName, { type: mimeType });
    }
  }

  return {
    manifest,
    project,
    audioFile,
  };
}

/**
 * Import a parsed project file: save audio to IndexedDB and return updated project data
 */
export async function importProjectAudio(
  parsed: ParsedProjectFile,
): Promise<SavedProject> {
  let updatedProject = { ...parsed.project };

  // If there's an audio file, save it to IndexedDB
  if (parsed.audioFile) {
    const assetKey = await saveAsset(parsed.audioFile);
    updatedProject = {
      ...updatedProject,
      audioAssetKey: assetKey,
    };
  }

  return updatedProject;
}

/**
 * Validate that a file appears to be a valid .toymidi file (quick check)
 */
export async function isValidProjectFile(file: File): Promise<boolean> {
  try {
    const zip = await JSZip.loadAsync(file);
    return zip.file("manifest.json") !== null;
  } catch {
    return false;
  }
}
