import { Editor } from "./components/editor";
import { Home } from "./components/home";
import { LatencyChecker } from "./components/latency-checker";
import { Preview } from "./components/preview";
import { RouteError } from "./components/route-error";
import { ScoreCapture } from "./components/score-capture";
import { ScorePage } from "./components/score-page";
import { ScoreViewer } from "./components/score-viewer";
import { useWindowEvent } from "./components/use-window-event";
import { getSharePayload, getShareSource } from "./lib/project-share";
import { matchRoute, routes } from "./lib/routes";
import { preloadMidiAssetsWhenIdle } from "./lib/runtime-assets";

export function App() {
  const match = matchRoute(window.location.href);

  switch (match?.data) {
    case "preview": {
      return <Preview />;
    }
    case "project": {
      preloadMidiAssetsWhenIdle();
      return (
        <Editor
          source={{ type: "stored", projectId: match.params.projectId }}
        />
      );
    }
    case "draft": {
      preloadMidiAssetsWhenIdle();
      return <DraftRoute />;
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
    case "legacyProjectScore": {
      return <LegacyProjectRoute />;
    }
    case "legacyProject": {
      return <LegacyProjectRoute />;
    }
    case "home":
    default: {
      preloadMidiAssetsWhenIdle();
      return <Home />;
    }
  }
}

function DraftRoute() {
  // Another share link in this tab changes only the hash, which does not
  // reload the page, so reload it to open that project afresh.
  useWindowEvent("hashchange", () => window.location.reload());
  const payload = getSharePayload(window.location.href);
  const src = getShareSource(window.location.href);
  return <Editor source={{ type: "draft", payload, src }} />;
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
    return <ScorePage projectId={projectId} trackId={trackId} />;
  }
  if (params.has("projectId") || params.has("trackId")) {
    return (
      <RouteError
        error="Both projectId and trackId are required to open a score."
        backHref={routes.scoreViewer.href()}
        backLabel="Back to score viewer"
      />
    );
  }
  return <ScoreViewer />;
}
