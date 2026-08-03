import { Editor } from "./components/editor";
import { ProjectListView } from "./components/project-list-view";
import { ScoreViewer } from "./components/score-viewer";
import { useWindowEvent } from "./hooks/use-window-event";
import { matchKeyboardEvent } from "./lib/keyboard";
import { exportMusicXml } from "./lib/musicxml-export";
import { getProjectSession } from "./lib/project-session";
import { projectStorage } from "./lib/project-storage";
import { fromSavedProject } from "./lib/project-store";

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
  try {
    const metadata = projectStorage.getMetadata(projectId);
    if (!metadata) {
      throw new Error(`Project ${projectId} metadata not found`);
    }
    const project = fromSavedProject(projectStorage.load(projectId));
    const xml = exportMusicXml({
      notes: project.notes,
      tempo: project.tempo,
      timeSignature: project.timeSignature,
      keySignature: project.keySignature,
      openStringPitches: project.tabOpenStringPitches,
    });
    return (
      <ScoreViewer initialSource={{ name: `${metadata.name}.musicxml`, xml }} />
    );
  } catch (error) {
    return (
      <div className="fixed inset-0 bg-neutral-900 flex flex-col items-center justify-center gap-4 text-neutral-400">
        {String(error)}
        <a
          href={`/project/${projectId}`}
          className="text-emerald-400 hover:text-emerald-300"
        >
          Back to project
        </a>
      </div>
    );
  }
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
      <div className="fixed inset-0 bg-neutral-900 flex flex-col items-center justify-center gap-4 text-neutral-400">
        {String(session.error)}
        <a href="/" className="text-emerald-400 hover:text-emerald-300">
          Back to projects
        </a>
      </div>
    );
  }

  return (
    <Editor
      projectId={session.value.projectId}
      initialProjectName={session.value.projectName}
    />
  );
}

function StartupApp() {
  // Space to continue/start project
  useWindowEvent(
    "keydown",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (matchKeyboardEvent(e, "Space")) {
        e.preventDefault();
        e.stopPropagation();
        openProject(
          projectStorage.getLastProjectId() ?? projectStorage.createNew(),
        );
      }
    },
    true,
  );

  return (
    <ProjectListView
      onSelectProject={openProject}
      onNewProject={() => openProject(projectStorage.createNew())}
    />
  );
}
