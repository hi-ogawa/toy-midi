import JSZip from "jszip";
import { parseProjectFile } from "../project-file";
import { convertLegacyProject } from "./legacy-project";
import { readRecorderProjectArchive } from "./project-archive";

/**
 * Read a recorder or legacy .toymidi archive, selecting its format from the manifest.
 * Converts legacy content in memory without writing legacy assets to storage.
 * Returns recorder content for the caller to save as a new project.
 */
export async function importRecorderProject(file: File) {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("Invalid project file: missing manifest.json");
  }
  const manifest = JSON.parse(await manifestFile.async("text"));
  if (manifest.projectType === "recorder") {
    return readRecorderProjectArchive(zip);
  }
  if (manifest.projectType !== undefined) {
    throw new Error("Unsupported project type");
  }
  const assets = new Map<string, File>();
  const parsed = await parseProjectFile(file, {
    saveAsset: async (audio) => {
      const assetKey = crypto.randomUUID();
      assets.set(assetKey, audio);
      return assetKey;
    },
  });
  return convertLegacyProject({
    name: parsed.name,
    project: parsed.project,
    loadAudio: async (assetKey) => assets.get(assetKey),
  });
}
