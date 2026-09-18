import JSZip from "jszip";
import { parseProjectFile } from "../project-file";
import { convertLegacyProject } from "./legacy-project";
import { readRecorderProjectArchive } from "./project-archive";

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
  const parsed = await parseProjectFile(file, { persistAssets: false });
  return convertLegacyProject({
    name: parsed.name,
    project: parsed.project,
    loadAudio: async (track) => parsed.assets.get(track.id),
  });
}
