import { Home } from "./components/home";
import { LatencyChecker } from "./components/latency-checker";
import { Preview } from "./components/preview";
import { Recorder } from "./components/recorder";
import { RecorderScorePage } from "./components/recorder/recorder-score-page";
import { RouteError } from "./components/route-error";
import { ScoreCapture } from "./components/score-capture";
import { ScoreViewer } from "./components/score-viewer";
import { matchRoute, routes } from "./lib/routes";
import { preloadMidiAssetsWhenIdle } from "./lib/runtime-assets";

export function App() {
  const match = matchRoute(window.location.href);

  switch (match?.data) {
    case "preview": {
      return <Preview />;
    }
    case "recorderProject": {
      preloadMidiAssetsWhenIdle();
      return <Recorder projectId={match.params.projectId} />;
    }
    case "latencyChecker": {
      return <LatencyChecker />;
    }
    case "scoreViewer": {
      return <ScoreViewerRoute />;
    }
    case "scoreCapture": {
      return <ScoreCapture />;
    }
    case "projectScore": {
      return <LegacyProjectRoute />;
    }
    case "project": {
      return <LegacyProjectRoute />;
    }
    case "home":
    default: {
      preloadMidiAssetsWhenIdle();
      return <Home />;
    }
  }
}

function LegacyProjectRoute() {
  return (
    <RouteError
      error='The legacy editor has been retired. To migrate your project, go home and choose "Migrate to new editor" under Legacy projects.'
      backHref={routes.home.href()}
      backLabel="Back to projects"
    />
  );
}

function ScoreViewerRoute() {
  const params = new URL(window.location.href).searchParams;
  const projectId = params.get("projectId");
  const trackId = params.get("trackId");
  if (projectId && trackId) {
    return <RecorderScorePage projectId={projectId} trackId={trackId} />;
  }
  if (params.has("projectId") || params.has("trackId")) {
    return (
      <RouteError
        error="Both projectId and trackId are required to open a recorder score."
        backHref={routes.scoreViewer.href()}
        backLabel="Back to score viewer"
      />
    );
  }
  return <ScoreViewer />;
}
