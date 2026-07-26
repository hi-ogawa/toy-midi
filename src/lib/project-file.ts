import JSZip from "jszip";
import { buildExportFileName } from "./export-utils";
import { projectStorage } from "./project-storage";
import {
  type AnySavedProject,
  migrateSavedProject,
  type SavedProject,
  type SavedProjectV1,
} from "./project-store";

type AnyProjectManifest = ProjectManifest | ProjectManifestV1;

interface ProjectManifest {
  formatVersion: 2;
  exportedAt: string; // ISO timestamp
  name: string;
  files: {
    project: "project.json";
    audio: { trackId: string; path: string }[];
  };
}

type ProjectManifestV1 = Omit<ProjectManifest, "formatVersion" | "files"> & {
  formatVersion: 1;
  files: {
    project: "project.json";
    audio?: string;
  };
};

const CURRENT_FORMAT_VERSION: ProjectManifest["formatVersion"] = 2;

// Result of parsing a .toymidi file
interface ParsedProjectFile {
  name: string;
  project: SavedProject;
}

/**
 * Export a project to a .toymidi ZIP file
 */
export async function exportProjectFile(
  projectName: string,
  projectData: SavedProject,
): Promise<Blob> {
  const zip = new JSZip();

  const audioEntries: ProjectManifest["files"]["audio"] = [];

  // Bundle each track's audio asset and record its path in the manifest
  const tracks = projectData.audioTracks;
  for (const track of tracks) {
    const asset = await projectStorage.loadAsset(track.assetKey);
    if (!asset) {
      throw new Error(`Missing audio asset for "${track.fileName}"`);
    }
    const fileName = track.fileName || "audio.wav";
    // Prefix with track id to keep paths unique across tracks
    const audioPath = `audio/${track.id}-${fileName}`;
    audioEntries.push({ trackId: track.id, path: audioPath });
    // Store audio uncompressed: deflating large audio blobs on the main
    // thread takes seconds for marginal size savings
    zip.file(audioPath, asset.blob, { compression: "STORE" });
  }

  // Prepare manifest
  const manifest: ProjectManifest = {
    formatVersion: CURRENT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    name: projectName,
    files: {
      project: "project.json",
      audio: audioEntries,
    },
  };

  // Add manifest
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  zip.file("project.json", JSON.stringify(projectData, null, 2));

  // Generate ZIP
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

// for test migration
export async function exportProjectFileV1(
  projectName: string,
  projectData: SavedProjectV1,
  audioData: Uint8Array,
): Promise<Blob> {
  const zip = new JSZip();

  if (!projectData.audioFileName) {
    throw new Error("Cannot export v1 project file without audio file name");
  }

  const audioPath = `audio/${projectData.audioFileName}`;

  const manifest: ProjectManifestV1 = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    name: projectName,
    files: {
      project: "project.json",
      audio: audioPath,
    },
  };

  zip.file(audioPath, audioData);

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "project.json",
    JSON.stringify({ ...projectData, audioAssetKey: null }, null, 2),
  );

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
  const manifest = JSON.parse(manifestText) as AnyProjectManifest;

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
  const project = JSON.parse(projectText) as AnySavedProject;

  if (manifest.formatVersion === 1) {
    if (project.version !== 1) {
      throw new Error("Invalid project file: v1 manifest with v2 project");
    }

    // version 1 always persisted `audioAssetKey: null`
    // and generate new asset key during parse
    const audioPath = manifest.files.audio;
    if (audioPath) {
      const audioZipFile = zip.file(audioPath);
      if (!audioZipFile) {
        throw new Error(`Invalid project file: missing ${audioPath}`);
      }

      const blob = await audioZipFile.async("blob");
      const fileName =
        project.audioFileName || audioPath.split("/").pop() || "audio.wav";
      project.audioAssetKey = await projectStorage.saveAsset(
        fileFromBlob(blob, fileName),
      );
    }

    return {
      name: manifest.name,
      project: migrateSavedProject(project),
    };
  }

  if (project.version !== 2) {
    throw new Error("Invalid project file: v2 manifest with v1 project");
  }

  if (project.audioTracks.length !== manifest.files.audio.length) {
    throw new Error(
      "Invalid project file: audio manifest does not match project",
    );
  }

  const newAudioTracks: SavedProject["audioTracks"] = [];
  for (const entry of manifest.files.audio) {
    const track = project.audioTracks.find((t) => t.id === entry.trackId);
    if (!track) {
      throw new Error(
        `Invalid project file: audio entry references missing track ${entry.trackId}`,
      );
    }

    const audioZipFile = zip.file(entry.path);
    if (!audioZipFile) {
      throw new Error(`Invalid project file: missing ${entry.path}`);
    }
    const blob = await audioZipFile.async("blob");
    const assetKey = await projectStorage.saveAsset(
      fileFromBlob(blob, track.fileName),
    );
    newAudioTracks.push({ ...track, assetKey });
  }
  project.audioTracks = newAudioTracks;

  return {
    name: manifest.name,
    project,
  };
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
