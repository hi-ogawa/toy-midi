import { memo } from "../utils/memo";
import { exportMusicXml } from "./musicxml-export";
import { projectStorage } from "./project-storage";
import { fromSavedProject } from "./project-store";

type ProjectScoreResult =
  | { ok: true; value: { name: string; xml: string } }
  | { ok: false; error: unknown };

// Score routes are full-page snapshots. Memoize their source so rendering
// stays idempotent under Strict Mode, matching active project session loading.
export const getProjectScoreSource = memo(getProjectScoreSourceImpl);

function getProjectScoreSourceImpl(projectId: string): ProjectScoreResult {
  try {
    const metadata = projectStorage.getMetadata(projectId);
    if (!metadata) {
      return {
        ok: false,
        error: new Error(`Project ${projectId} metadata not found`),
      };
    }
    const project = fromSavedProject(projectStorage.load(projectId));
    return {
      ok: true,
      value: {
        name: `${metadata.name}.musicxml`,
        xml: exportMusicXml({
          notes: project.notes,
          tempo: project.tempo,
          title: metadata.name,
          timeSignature: project.timeSignature,
          keySignature: project.keySignature,
          openStringPitches: project.tabOpenStringPitches,
        }),
      },
    };
  } catch (error) {
    return { ok: false, error };
  }
}
