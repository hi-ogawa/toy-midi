import { useQuery } from "@tanstack/react-query";
import { getRecorderProjectScoreSource } from "../../lib/recorder/project-score";
import { routes } from "../../lib/routes";
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
  const score = useQuery({
    queryKey: ["recorder-project-score", projectId, trackId],
    queryFn: () => getRecorderProjectScoreSource({ projectId, trackId }),
    staleTime: Infinity,
    retry: false,
  });

  if (score.isError) {
    return (
      <RouteError
        error={score.error}
        backHref={routes.recorderProject.href({ projectId })}
        backLabel="Back to project"
      />
    );
  }
  if (score.isPending) {
    return <div className="p-6 text-neutral-400">Loading score…</div>;
  }
  return <ScoreViewer initialSource={score.data} />;
}
