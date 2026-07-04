import JSZip from "jszip";
import {
  type AnySavedProject,
  migrateSavedProject,
  type SavedProject,
} from "../stores/project-store";
import { loadAsset, saveAsset } from "./asset-store";
import { buildExportFileName } from "./export-utils";

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
    const asset = await loadAsset(track.assetKey);
    if (!asset) {
      throw new Error(`Missing audio asset for "${track.fileName}"`);
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
      audio: audioEntries,
    },
  };

  // Add manifest
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  zip.file("project.json", JSON.stringify(projectData, null, 2));

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

  if (project.version === 1) {
    if (manifest.formatVersion !== 1) {
      throw new Error("Invalid project file: v2 manifest with v1 project");
    }

    const audioPath = manifest.files.audio;
    let audioAssetKey = project.audioAssetKey;
    if (audioPath) {
      const audioZipFile = zip.file(audioPath);
      if (!audioZipFile) {
        throw new Error(`Invalid project file: missing ${audioPath}`);
      }

      const blob = await audioZipFile.async("blob");
      const fileName =
        project.audioFileName || audioPath.split("/").pop() || "audio.wav";
      audioAssetKey = await saveAsset(fileFromBlob(blob, fileName));
    }

    return {
      name: manifest.name,
      project: migrateSavedProject({ ...project, audioAssetKey }),
    };
  }

  if (manifest.formatVersion !== 2) {
    throw new Error("Invalid project file: v1 manifest with v2 project");
  }

  const audioAssetKeys = new Map<string, string>();

  for (const entry of manifest.files.audio) {
    const audioZipFile = zip.file(entry.path);
    if (!audioZipFile) {
      throw new Error(`Invalid project file: missing ${entry.path}`);
    }
    const blob = await audioZipFile.async("blob");
    const track = project.audioTracks.find((t) => t.id === entry.trackId);
    const fileName =
      track?.fileName || entry.path.split("/").pop() || "audio.wav";
    const assetKey = await saveAsset(fileFromBlob(blob, fileName));
    audioAssetKeys.set(entry.trackId, assetKey);
  }

  return {
    name: manifest.name,
    project: {
      ...project,
      audioTracks: project.audioTracks.flatMap((track) => {
        const assetKey = audioAssetKeys.get(track.id);
        return assetKey ? [{ ...track, assetKey }] : [];
      }),
    },
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
