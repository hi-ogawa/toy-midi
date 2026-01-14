import { useMutation } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HelpOverlay } from "./components/help-overlay";
import { PianoRoll } from "./components/piano-roll";
import { ProjectSettingsDialog } from "./components/project-settings-dialog";
import { Transport } from "./components/transport";
import { useWindowEvent } from "./hooks/use-window-event";
import { loadAsset } from "./lib/asset-store";
import { audioManager, loadAudioFile } from "./lib/audio";
import {
  createProject,
  deleteProject,
  getLastProjectId,
  getProjectMetadata,
  listProjects,
  loadProjectData,
  saveProjectData,
  setLastProjectId,
  updateProjectMetadata,
} from "./lib/project-manager";
import {
  fromSavedProject,
  toSavedProject,
  useProjectStore,
} from "./stores/project-store";

export function App() {
  const initMutation = useMutation({
    mutationFn: async (options: {
      projectId?: string;
    }): Promise<{ projectId: string }> => {
      await audioManager.init();

      // Get or create project ID
      const projectId = options.projectId ?? createProject();
      setLastProjectId(projectId);

      // Load project data if existing project, otherwise use defaults (new project)
      if (options.projectId) {
        const data = loadProjectData(projectId);
        useProjectStore.setState(fromSavedProject(data));
      } else {
        // save new project on startup
        saveProjectData(projectId, toSavedProject(useProjectStore.getState()));
      }

      const project = useProjectStore.getState();
      if (project.audioAssetKey) {
        const asset = await loadAsset(project.audioAssetKey);
        if (asset) {
          const { buffer, peaks, peaksPerSecond } = await loadAudioFile(
            new File([asset.blob], asset.name),
          );
          audioManager.player.buffer = buffer;
          audioManager.syncAudioTrack(project.audioOffset);
          project.setAudioPeaks(peaks, peaksPerSecond);
        } else {
          toast.warning(
            "Audio asset not found. The audio track will be cleared.",
          );
        }
      }

      audioManager.applyState(useProjectStore.getState());
      useProjectStore.subscribe((state, prevState) => {
        audioManager.applyState(state, prevState);
      });

      // Setup auto-save on state changes (debounced)
      // projectId is captured in closure - no need for Zustand
      const autoSaveDebounceMs = Number(
        import.meta.env.VITE_AUTO_SAVE_DEBOUNCE_MS ?? 500,
      );
      let saveTimeout: number;
      useProjectStore.subscribe(() => {
        clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(() => {
          try {
            saveProjectData(
              projectId,
              toSavedProject(useProjectStore.getState()),
            );
          } catch (e) {
            console.error("Failed to save project:", e);
            toast.error("Failed to save project. Changes may be lost.");
          }
        }, autoSaveDebounceMs);
      });

      return { projectId };
    },
  });

  // Space to continue/start project (startup screen only)
  useWindowEvent(
    "keydown",
    (e) => {
      if (initMutation.isSuccess || initMutation.isPending) return;
      if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        const lastProjectId = getLastProjectId();
        if (lastProjectId) {
          initMutation.mutate({ projectId: lastProjectId });
        } else {
          initMutation.mutate({});
        }
      }
    },
    true,
  );

  if (initMutation.isPending) {
    return (
      <div className="h-screen flex flex-col bg-neutral-900">
        <div className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50">
          <div className="text-neutral-400 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (!initMutation.isSuccess) {
    return (
      <ProjectListView
        onSelectProject={(projectId) => initMutation.mutate({ projectId })}
        onNewProject={() => initMutation.mutate({})}
      />
    );
  }

  return <Editor projectId={initMutation.data.projectId} />;
}

// === Editor Component ===
// Pure component that receives projectId as prop

type EditorProps = {
  projectId: string;
};

function Editor({ projectId }: EditorProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState(
    () => getProjectMetadata(projectId)?.name ?? "Untitled",
  );

  // Update document title when project name changes
  useEffect(() => {
    document.title = `${projectName} - Toy MIDI`;
  }, [projectName]);

  // Escape to close overlays
  useWindowEvent(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (isSettingsOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsSettingsOpen(false);
      } else if (isHelpOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsHelpOpen(false);
      }
    },
    true,
  );

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport
        onProjectSettingsClick={() => setIsSettingsOpen(true)}
        onHelpClick={() => setIsHelpOpen(true)}
        onProjectsClick={() => {
          // TODO: modal project list view and allow switch project?
          // for now, open startup page in new tab.
          window.open("/", "_blank");
        }}
      />
      <PianoRoll />
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <ProjectSettingsDialog
        isOpen={isSettingsOpen}
        projectName={projectName}
        onSave={(name) => {
          updateProjectMetadata(projectId, { name });
          setProjectName(name);
        }}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

// === Project List View ===

type ProjectListViewProps = {
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
};

function ProjectListView({
  onSelectProject,
  onNewProject,
}: ProjectListViewProps) {
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [projects, setProjects] = useState(listProjects());

  const hasProjects = projects.length > 0;
  const lastProjectId = getLastProjectId();

  const handleRenameStart = (
    e: React.MouseEvent,
    projectId: string,
    currentName: string,
  ) => {
    e.stopPropagation();
    setRenamingProjectId(projectId);
    setRenameValue(currentName);
  };

  const handleRenameSubmit = (projectId: string) => {
    if (renameValue.trim()) {
      updateProjectMetadata(projectId, { name: renameValue.trim() });
      setRenamingProjectId(null);
      setRenameValue("");
      setProjects(listProjects());
    }
  };

  const handleRenameCancel = () => {
    setRenamingProjectId(null);
    setRenameValue("");
  };

  const handleDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm("Delete this project? This action cannot be undone.")) {
      deleteProject(projectId);
      setProjects(listProjects());
    }
  };

  return (
    <div
      data-testid="startup-screen"
      className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50 overflow-hidden"
    >
      {/* Gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_center,#10b98125_0%,transparent_70%)] pointer-events-none" />

      <div className="flex flex-col items-center gap-8 w-full px-6 relative">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-neutral-100 tracking-tight">
            Toy MIDI
          </h1>
          <p className="text-neutral-500 mt-2">A simple piano roll editor</p>
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
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            data-testid={`rename-input-${project.id}`}
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleRenameSubmit(project.id);
                              } else if (e.key === "Escape") {
                                handleRenameCancel();
                              }
                            }}
                            className="flex-1 px-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-200 text-lg focus:outline-none focus:border-emerald-500"
                            onFocus={(e) => e.target.select()}
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameSubmit(project.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={handleRenameCancel}
                            className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded-lg text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center flex-1">
                          <button
                            type="button"
                            onClick={() => onSelectProject(project.id)}
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
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              data-testid={`rename-button-${project.id}`}
                              onClick={(e) =>
                                handleRenameStart(e, project.id, project.name)
                              }
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
                  onClick={() =>
                    lastProjectId && onSelectProject(lastProjectId)
                  }
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-lg shadow-lg shadow-emerald-900/30"
                >
                  Continue
                </button>
                <button
                  type="button"
                  data-testid="new-project-button"
                  onClick={onNewProject}
                  className="px-8 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl font-medium text-lg"
                >
                  New Project
                </button>
              </div>
              <p className="text-neutral-600 text-sm">
                Press{" "}
                <kbd className="px-2 py-1 bg-neutral-800 text-neutral-400 rounded font-mono text-xs border border-neutral-700">
                  Space
                </kbd>{" "}
                to continue
              </p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              data-testid="new-project-button"
              onClick={onNewProject}
              className="px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-lg shadow-lg shadow-emerald-900/30"
            >
              Create Your First Project
            </button>
            <p className="text-neutral-600 text-sm">
              Press{" "}
              <kbd className="px-2 py-1 bg-neutral-800 text-neutral-400 rounded font-mono text-xs border border-neutral-700">
                Space
              </kbd>{" "}
              to start
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
