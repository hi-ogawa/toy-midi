import { useQuery } from "@tanstack/react-query";
import { exportMusicXml } from "../../lib/musicxml/render";
import { DEFAULT_KEY_SIGNATURE } from "../../lib/pitch-spelling";
import { recorderProjectStorage } from "../../lib/recorder/project-storage";
import { routes } from "../../lib/routes";
import { DEFAULT_TAB_OPEN_STRING_PITCHES } from "../../lib/tab-annotation";
import { RouteError } from "../route-error";
import { ScoreViewer } from "../score-viewer";

export function RecorderScorePage({
  projectId,
  trackId,
}: {
  projectId: string;
  trackId: string;
}) {
  // Keep a saved snapshot for this page, as with the legacy score route.
  const scoreQuery = useQuery({
    queryKey: ["recorder-project-score", projectId, trackId],
    queryFn: () => getRecorderProjectScoreSource({ projectId, trackId }),
    staleTime: Infinity,
    retry: false,
  });

  if (scoreQuery.isError) {
    return (
      <RouteError
        error={scoreQuery.error}
        backHref={routes.recorderProject.href({ projectId })}
        backLabel="Back to project"
      />
    );
  }
  if (scoreQuery.isPending) {
    return <div className="p-6 text-neutral-400">Loading score…</div>;
  }
  return <ScoreViewer initialSource={scoreQuery.data} />;
}

async function getRecorderProjectScoreSource({
  projectId,
  trackId,
}: {
  projectId: string;
  trackId: string;
}) {
  const project = await recorderProjectStorage.load(projectId);
  const track = project.midiTracks?.find((track) => track.id === trackId);
  if (!track) {
    throw new Error(`MIDI track ${trackId} not found.`);
  }
  return {
    name: `${project.title} - ${track.name}.musicxml`,
    xml: exportMusicXml({
      notes: track.notes,
      title: project.title,
      tempo: project.tempo,
      timeSignature: project.timeSignature,
      keySignature: track.keySignature ?? DEFAULT_KEY_SIGNATURE,
      openStringPitches:
        track.tabOpenStringPitches ?? DEFAULT_TAB_OPEN_STRING_PITCHES,
      locators: (project.locators ?? []).map(({ id, beat, label }) => ({
        id,
        position: beat,
        label,
      })),
    }),
  };
}
