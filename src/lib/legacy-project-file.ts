import JSZip from "jszip";
import {
  type AnyLegacySavedProject,
  migrateLegacySavedProject,
  type LegacySavedProject,
} from "./legacy-project-format";

type AnyLegacyProjectManifest = LegacyProjectManifest | LegacyProjectManifestV1;

interface LegacyProjectManifest {
  formatVersion: 2;
  exportedAt: string; // ISO timestamp
  name: string;
  files: {
    project: "project.json";
    audio: { trackId: string; path: string }[];
  };
}

type LegacyProjectManifestV1 = Omit<
  LegacyProjectManifest,
  "formatVersion" | "files"
> & {
  formatVersion: 1;
  files: {
    project: "project.json";
    audio?: string;
  };
};

const CURRENT_FORMAT_VERSION: LegacyProjectManifest["formatVersion"] = 2;

// Result of parsing a .toymidi file
interface ParsedLegacyProjectFile {
  name: string;
  project: LegacySavedProject;
}

/**
 * Parse a .toymidi file and extract its contents
 */
export async function parseLegacyProjectFile(
  file: File,
  {
    saveAsset,
  }: {
    saveAsset: (file: File) => Promise<string>;
  },
): Promise<ParsedLegacyProjectFile> {
  const zip = await JSZip.loadAsync(file);

  // Read manifest
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Invalid project file: missing manifest.json");
  }
  const manifestText = await manifestFile.async("text");
  const manifest = JSON.parse(manifestText) as AnyLegacyProjectManifest;

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
  const project = JSON.parse(projectText) as AnyLegacySavedProject;

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
      project.audioAssetKey = await saveAsset(fileFromBlob(blob, fileName));
    }

    return {
      name: manifest.name,
      project: migrateLegacySavedProject(project),
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

  const newAudioTracks: LegacySavedProject["audioTracks"] = [];
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
    const assetKey = await saveAsset(fileFromBlob(blob, track.fileName));
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
