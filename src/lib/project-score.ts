import { exportMusicXml } from "./musicxml-export";
import { projectStorage } from "./project-storage";
import { fromSavedProject } from "./project-store";

type ProjectScoreResult =
  | { ok: true; value: { name: string; xml: string } }
  | { ok: false; error: unknown };

// Score routes are full-page snapshots. Cache their source so rendering stays
// idempotent under Strict Mode, matching active project session loading.
const projectScoreResults = new Map<string, ProjectScoreResult>();

export function getProjectScoreSource(projectId: string): ProjectScoreResult {
  let result = projectScoreResults.get(projectId);
  if (!result) {
    try {
      const metadata = projectStorage.getMetadata(projectId);
      if (!metadata) {
        throw new Error(`Project ${projectId} metadata not found`);
      }
      const project = fromSavedProject(projectStorage.load(projectId));
      result = {
        ok: true,
        value: {
          name: `${metadata.name}.musicxml`,
          xml: exportMusicXml({
            notes: project.notes,
            tempo: project.tempo,
            timeSignature: project.timeSignature,
            keySignature: project.keySignature,
            openStringPitches: project.tabOpenStringPitches,
          }),
        },
      };
    } catch (error) {
      result = { ok: false, error };
    }
    projectScoreResults.set(projectId, result);
  }
  return result;
}
