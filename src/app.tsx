import { EditorPage } from "./components/editor-page";
import { ExamplesPage } from "./components/examples-page";
import { HomePage } from "./components/home-page";
import { LatencyCheckerPage } from "./components/latency-checker-page";
import { PreviewPage } from "./components/preview-page";
import { ProjectScorePage } from "./components/project-score-page";
import { RouteError } from "./components/route-error";
import { ScoreCapturePage } from "./components/score-capture-page";
import { ScoreViewerPage } from "./components/score-viewer-page";
import { useWindowEvent } from "./components/use-window-event";
import { getSharePayload, getShareSource } from "./lib/project-share";
import { matchRoute, routes } from "./lib/routes";
import { preloadMidiAssetsWhenIdle } from "./lib/runtime-assets";

export function App() {
  const match = matchRoute(window.location.href);

  switch (match?.data) {
    case "preview": {
      return <PreviewPage />;
    }
    case "project": {
      preloadMidiAssetsWhenIdle();
      return (
        <EditorPage
          source={{ type: "stored", projectId: match.params.projectId }}
        />
      );
    }
    case "draft": {
      preloadMidiAssetsWhenIdle();
      return <DraftRoute />;
    }
    case "examples": {
      preloadMidiAssetsWhenIdle();
      return <ExamplesPage />;
    }
    case "latencyChecker": {
      return <LatencyCheckerPage />;
    }
    case "scoreViewer": {
      return <ScoreViewerRoute />;
    }
    case "scoreCapture": {
      return <ScoreCapturePage />;
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
      return <HomePage />;
    }
  }
}

function DraftRoute() {
  // Another share link in this tab changes only the hash, which does not
  // reload the page, so reload it to open that project afresh.
  useWindowEvent("hashchange", () => window.location.reload());
  const payload = getSharePayload(window.location.href);
  const src = getShareSource(window.location.href);
  return <EditorPage source={{ type: "draft", payload, src }} />;
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
    return <ProjectScorePage projectId={projectId} trackId={trackId} />;
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
  return <ScoreViewerPage />;
}
