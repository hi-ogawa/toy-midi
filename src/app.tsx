import { useMutation } from "@tanstack/react-query";
import { Github, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HelpOverlay } from "./components/help-overlay";
import { Mixer } from "./components/mixer";
import { PianoRoll } from "./components/piano-roll";
import { Settings } from "./components/settings";
import { Transport } from "./components/transport";
import { Dialog } from "./components/ui/dialog";
import { useDraftTextInput } from "./hooks/use-draft-text-input";
import { useWindowEvent } from "./hooks/use-window-event";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "./lib/keyboard";
import { parseProjectFile } from "./lib/project-file";
import { getProjectSession } from "./lib/project-session";
import { type ProjectMetadata, projectStorage } from "./lib/project-storage";

export function App() {
  const match = window.location.pathname.match(/^\/project\/([^/]+)$/);
  if (match) {
    return <ProjectRoute projectId={match[1]} />;
  }
  return <StartupApp />;
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

// === Editor Component ===

type EditorProps = {
  projectId: string;
  initialProjectName: string;
};

function Editor({ projectId, initialProjectName }: EditorProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [projectName, setProjectName] = useState(initialProjectName);

  // Update document title when project name changes
  useEffect(() => {
    document.title = `${projectName} - Toy MIDI`;
  }, [projectName]);

  // Keyboard shortcuts for overlays
  useWindowEvent("keydown", (e) => {
    if (isShortcutTextInputTarget(e.target)) {
      return;
    }

    if (matchKeyboardEvent(e, "Escape")) {
      if (isSettingsOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsSettingsOpen(false);
      } else if (isMixerOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsMixerOpen(false);
      } else if (isHelpOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsHelpOpen(false);
      }
    }
    if (e.key === "?" && !e.repeat) {
      e.preventDefault();
      setIsHelpOpen((prev) => !prev);
    }
  });

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport
        onSettingsClick={() => setIsSettingsOpen(true)}
        onHelpClick={() => setIsHelpOpen(true)}
        onMixerClick={() => setIsMixerOpen(true)}
        projectName={projectName}
      />
      <PianoRoll />
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <Dialog
        isOpen={isMixerOpen}
        onClose={() => setIsMixerOpen(false)}
        title="Mixer"
        testId="mixer-dialog"
      >
        <Mixer />
      </Dialog>
      <Dialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        title="Settings"
        testId="settings-dialog"
      >
        <Settings
          projectName={projectName}
          onProjectNameChange={(name) => {
            if (name && name !== projectName) {
              projectStorage.updateMetadata(projectId, { name });
              setProjectName(name);
            }
          }}
        />
      </Dialog>
    </div>
  );
}

// === Project List View ===

type ProjectListViewProps = {
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
};

type ProjectRenameInputProps = {
  project: ProjectMetadata;
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

function ProjectRenameInput({
  project,
  onSubmit,
  onCancel,
}: ProjectRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isCancelingRef = useRef(false);
  const renameInput = useDraftTextInput({
    value: project.name,
    onCommit: onSubmit,
    normalize: (value) => value.trim(),
    isValid: (value) => value.length > 0,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (matchKeyboardEvent(e, "Escape")) {
      e.preventDefault();
      e.stopPropagation();
      isCancelingRef.current = true;
      renameInput.reset();
      onCancel();
      return;
    }
    renameInput.props.onKeyDown(e);
  };

  const handleBlur = () => {
    if (isCancelingRef.current) {
      isCancelingRef.current = false;
      return;
    }
    renameInput.commit();
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="flex items-center gap-3 flex-1">
      <input
        data-testid={`rename-input-${project.id}`}
        type="text"
        value={renameInput.draft}
        onChange={renameInput.props.onChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        ref={inputRef}
        className="flex-1 px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-200 text-lg focus:outline-none focus:border-emerald-500"
      />
      <button
        type="button"
        onClick={renameInput.commit}
        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg text-sm"
      >
        Cancel
      </button>
    </div>
  );
}

function ProjectListView({
  onSelectProject,
  onNewProject,
}: ProjectListViewProps) {
  const [renamingProjectId, setRenamingProjectId] = useState<string>();
  const [projects, setProjects] = useState(projectStorage.listMetadata());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasProjects = projects.length > 0;
  const lastProjectId = projectStorage.getLastProjectId();

  const importProjectMutation = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await parseProjectFile(file);

      // Create new project
      return projectStorage.create(parsed.name, parsed.project);
    },
    onSuccess: (newProjectId) => {
      // Select the newly imported project
      onSelectProject(newProjectId);
    },
    onError: (error) => {
      console.error("Failed to import project:", error);
      toast.error("Failed to import project");
    },
  });
  const isLoading = importProjectMutation.isPending;

  const handleRenameStart = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setRenamingProjectId(projectId);
  };

  const handleRenameSubmit = (projectId: string, nextName: string) => {
    projectStorage.updateMetadata(projectId, { name: nextName });
    setRenamingProjectId(undefined);
    setProjects(projectStorage.listMetadata());
  };

  const handleRenameCancel = () => {
    setRenamingProjectId(undefined);
  };

  const handleDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm("Delete this project? This action cannot be undone.")) {
      projectStorage.delete(projectId);
      setProjects(projectStorage.listMetadata());
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importProjectMutation.mutate(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  return (
    <div
      data-testid="startup-screen"
      className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50 overflow-hidden"
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".toymidi"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_center,#10b98125_0%,transparent_70%)] pointer-events-none" />

      <div className="flex flex-col items-center gap-8 w-full px-6 relative">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-neutral-100 tracking-tight">
            Toy MIDI
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2 text-sm text-neutral-500">
            <p>A simple piano roll editor</p>
            <span className="text-neutral-700">/</span>
            <a
              href="https://github.com/hi-ogawa/toy-midi/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-emerald-400 transition-colors"
            >
              <Github className="size-4" />
              GitHub
            </a>
          </div>
        </div>

        {hasProjects ? (
          <>
            <div className="w-full max-w-lg">
              <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                Your Projects
              </h2>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {projects.map((project) => {
                  const isLastProject = project.id === lastProjectId;
                  return (
                    <div
                      key={project.id}
                      data-testid={`project-card-${project.id}`}
                      aria-current={isLastProject ? "true" : undefined}
                      className={`group w-full h-20 px-5 rounded-xl border transition-colors flex items-center ${
                        isLastProject
                          ? "bg-emerald-900/25 hover:bg-emerald-900/35 border-emerald-700/50"
                          : "bg-neutral-800/60 hover:bg-neutral-800 border-neutral-700/50"
                      }`}
                    >
                      {renamingProjectId === project.id ? (
                        <ProjectRenameInput
                          project={project}
                          onSubmit={(nextName) =>
                            handleRenameSubmit(project.id, nextName)
                          }
                          onCancel={handleRenameCancel}
                        />
                      ) : (
                        <div className="flex justify-between items-center flex-1">
                          <a
                            href={`/project/${project.id}`}
                            className="flex-1 text-left"
                          >
                            <div className="text-neutral-100 font-medium text-lg">
                              {project.name}
                            </div>
                            <div className="text-neutral-500 text-sm mt-1">
                              Last edited{" "}
                              {new Date(project.updatedAt).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )}
                            </div>
                          </a>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              data-testid={`rename-button-${project.id}`}
                              onClick={(e) => handleRenameStart(e, project.id)}
                              className="p-2 hover:bg-neutral-600/50 rounded-lg transition-colors"
                              title="Rename"
                            >
                              <Pencil className="size-4 text-neutral-400" />
                            </button>
                            <button
                              type="button"
                              data-testid={`delete-button-${project.id}`}
                              onClick={(e) => handleDelete(e, project.id)}
                              className="p-2 hover:bg-red-600/30 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="size-4 text-neutral-400" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-4">
                <button
                  type="button"
                  data-testid="continue-button"
                  disabled={isLoading}
                  onClick={() =>
                    lastProjectId && onSelectProject(lastProjectId)
                  }
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white rounded-lg font-medium shadow-lg shadow-emerald-900/30"
                >
                  Continue
                </button>
                <button
                  type="button"
                  data-testid="new-project-button"
                  disabled={isLoading}
                  onClick={onNewProject}
                  className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-800/50 text-neutral-200 rounded-lg font-medium"
                >
                  New Project
                </button>
                <button
                  type="button"
                  data-testid="import-project-button"
                  disabled={isLoading}
                  onClick={handleImportClick}
                  className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-800/50 text-neutral-200 rounded-lg font-medium"
                >
                  {isLoading ? "Importing..." : "Import Project"}
                </button>
              </div>
              <p className="text-neutral-600 text-sm">
                {isLoading ? (
                  "Loading..."
                ) : (
                  <>
                    Press{" "}
                    <kbd className="px-2 py-1 bg-neutral-800 text-neutral-400 rounded font-mono text-xs border border-neutral-700">
                      Space
                    </kbd>{" "}
                    to continue
                  </>
                )}
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-4">
              <button
                type="button"
                data-testid="new-project-button"
                disabled={isLoading}
                onClick={onNewProject}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white rounded-lg font-medium shadow-lg shadow-emerald-900/30"
              >
                Create Your First Project
              </button>
              <button
                type="button"
                data-testid="import-project-button"
                disabled={isLoading}
                onClick={handleImportClick}
                className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-800/50 text-neutral-200 rounded-lg font-medium"
              >
                {isLoading ? "Importing..." : "Import Project"}
              </button>
            </div>
            <p className="text-neutral-600 text-sm">
              {isLoading ? (
                "Loading..."
              ) : (
                <>
                  Press{" "}
                  <kbd className="px-2 py-1 bg-neutral-800 text-neutral-400 rounded font-mono text-xs border border-neutral-700">
                    Space
                  </kbd>{" "}
                  to start
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
