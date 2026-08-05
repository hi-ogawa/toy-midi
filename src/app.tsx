import { Editor } from "./components/editor";
import { ProjectListView } from "./components/project-list-view";
import { ScoreViewer } from "./components/score-viewer";
import { getProjectScoreSource } from "./lib/project-score";
import { getProjectSession } from "./lib/project-session";
import { projectStorage } from "./lib/project-storage";

export function App() {
  if (window.location.pathname === "/score-viewer") {
    return <ScoreViewer />;
  }
  const scoreMatch = window.location.pathname.match(
    /^\/project\/([^/]+)\/score$/,
  );
  if (scoreMatch) {
    return <ProjectScoreRoute projectId={scoreMatch[1]} />;
  }
  const match = window.location.pathname.match(/^\/project\/([^/]+)$/);
  if (match) {
    return <ProjectRoute projectId={match[1]} />;
  }
  return <StartupApp />;
}

function ProjectScoreRoute({ projectId }: { projectId: string }) {
  const score = getProjectScoreSource(projectId);

  if (!score.ok) {
    return (
      <RouteError
        error={score.error}
        backHref={`/project/${projectId}`}
        backLabel="Back to project"
      />
    );
  }

  return <ScoreViewer initialSource={score.value} />;
}

// All project opens are full-page navigation; ProjectRoute is the only way
// into the editor.
function openProject(projectId: string) {
  window.location.href = `/project/${projectId}`;
}

// Deep-link entry: load the project named by the URL directly, no startup
// screen. The session is read synchronously during render (getProjectSession
// caches the result per id, so StrictMode's double render opens it once),
// so the very first paint is the editor with notes visible; audio
// initializes in the background and playback enables when it's ready.
//
// The sync read leans on document storage being localStorage. If session
// open ever becomes asynchronous (IndexedDB/remote documents), extend
// ProjectSessionResult with a "pending" variant and render the empty editor
// (store defaults are a complete ProjectState) under a blocking loading
// overlay, following the same status-gated pattern as the audio attach.
function ProjectRoute({ projectId }: { projectId: string }) {
  const session = getProjectSession(projectId);

  if (!session.ok) {
    return (
      <RouteError
        error={session.error}
        backHref="/"
        backLabel="Back to projects"
      />
    );
  }

  return (
    <Editor
      projectId={session.value.projectId}
      initialProjectName={session.value.projectName}
    />
  );
}

function RouteError({
  error,
  backHref,
  backLabel,
}: {
  error: unknown;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-900 text-neutral-400">
      {String(error)}
      <a href={backHref} className="text-emerald-400 hover:text-emerald-300">
        {backLabel}
      </a>
    </div>
  );
}

function StartupApp() {
  return (
    <ProjectListView
      onSelectProject={openProject}
      onNewProject={() => openProject(projectStorage.createNew())}
    />
  );
}
