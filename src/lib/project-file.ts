import JSZip from "jszip";
import {
  type AnySavedProject,
  migrateSavedProject,
  type SavedProject,
  type SavedProjectV1,
} from "./legacy-project";
import { projectStorage } from "./project-storage";

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

// Persist assets only for imports into the legacy editor.
export async function parseProjectFile(file: File): Promise<ParsedProjectFile> {
  const parsed = await readLegacyProjectArchive(
    await JSZip.loadAsync(await file.arrayBuffer()),
  );
  const audioTracks = [];
  for (const track of parsed.project.audioTracks) {
    const assetKey = await projectStorage.saveAsset(
      parsed.assets.get(track.id)!,
    );
    audioTracks.push({ ...track, assetKey });
  }
  return { name: parsed.name, project: { ...parsed.project, audioTracks } };
}

// Reading an archive must not write legacy assets during recorder conversion.
export async function readLegacyProjectArchive(zip: JSZip) {
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Invalid project file: missing manifest.json");
  }
  const manifest = JSON.parse(
    await manifestFile.async("text"),
  ) as AnyProjectManifest;
  if (manifest.formatVersion !== 1 && manifest.formatVersion !== 2) {
    throw new Error("Unsupported legacy project archive version");
  }
  const projectFile = zip.file(manifest.files.project);
  if (!projectFile) {
    throw new Error("Invalid project file: missing project.json");
  }
  const data = JSON.parse(await projectFile.async("text")) as AnySavedProject;
  if (data.version !== manifest.formatVersion) {
    throw new Error(
      "Invalid project file: manifest and project versions differ",
    );
  }
  const assets = new Map<string, File>();
  if (manifest.formatVersion === 1 && data.version === 1) {
    const path = manifest.files.audio;
    if (path) {
      data.audioFileName ||= path.split("/").pop() || "audio.wav";
      data.audioAssetKey = path;
    } else if (data.audioFileName || data.audioAssetKey) {
      throw new Error("Invalid project file: missing audio manifest entry");
    }
  }
  const project = migrateSavedProject(data);
  const entries =
    manifest.formatVersion === 1
      ? manifest.files.audio
        ? [{ trackId: "audio-1", path: manifest.files.audio }]
        : []
      : manifest.files.audio;
  if (
    entries.length !== project.audioTracks.length ||
    new Set(entries.map((entry) => entry.trackId)).size !== entries.length
  ) {
    throw new Error(
      "Invalid project file: audio manifest does not match project",
    );
  }
  for (const track of project.audioTracks) {
    const entry = entries.find((entry) => entry.trackId === track.id);
    const audio = entry && zip.file(entry.path);
    if (!audio) {
      throw new Error(`Missing audio asset for "${track.fileName}"`);
    }
    assets.set(
      track.id,
      fileFromBlob(
        new Blob([await audio.async("arraybuffer")]),
        track.fileName,
      ),
    );
  }
  return { name: manifest.name, project, assets };
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
