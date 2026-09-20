import JSZip from "jszip";
import { parseProjectFile } from "../project-file";
import { convertLegacyProject } from "./legacy-project";
import { readRecorderProjectArchive } from "./project-archive";

export async function importRecorderProject(file: File) {
  // Use the manifest to distinguish native recorder archives from legacy projects.
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

  // Keep legacy audio in memory for conversion instead of saving it to the old asset store.
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
