import JSZip from "jszip";
import type { SavedProject, SavedProjectV1 } from "../src/lib/project-store";
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

/**
 * Export a project to a .toymidi ZIP file
 */
export async function exportProjectFile(
  projectName: string,
  projectData: SavedProject,
  {
    loadAsset,
  }: {
    // Node E2E fixtures use Uint8Array because JSZip reads Blob via browser FileReader.
    loadAsset: (
      assetKey: string,
    ) => Promise<{ blob: Blob | Uint8Array } | undefined>;
  },
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
