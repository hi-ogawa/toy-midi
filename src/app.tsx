import { useMutation } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ToneAudioBuffer } from "tone";
import { HelpOverlay } from "./components/help-overlay";
import { PianoRoll } from "./components/piano-roll";
import { Transport } from "./components/transport";
import { loadAsset } from "./lib/asset-store";
import { audioManager, getAudioBufferPeaks } from "./lib/audio";
import {
  createProject,
  deleteProject,
  getLastProjectId,
  getProjectMetadata,
  hasSavedProject,
  listProjects,
  loadProjectData,
  migrateFromSingleProject,
  saveProjectData,
  setLastProjectId,
  updateProjectMetadata,
} from "./lib/project-manager";
import {
  fromSavedProject,
  toSavedProject,
  useProjectStore,
} from "./stores/project-store";

// Migrate old single-project storage if needed
migrateFromSingleProject();

// Check once at module load - doesn't change during session
const savedProjectExists = hasSavedProject();

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
          const url = URL.createObjectURL(asset.blob);
          const buffer = await ToneAudioBuffer.fromUrl(url);
          URL.revokeObjectURL(url);

          audioManager.player.buffer = buffer;
          audioManager.syncAudioTrack(project.audioOffset);

          const peaks = getAudioBufferPeaks(buffer, 100);
          project.setAudioPeaks(peaks, 100);
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

  // Enter to continue saved project (startup screen only)
  useEffect(() => {
    if (!savedProjectExists || initMutation.isSuccess || initMutation.isPending)
      return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const lastProjectId = getLastProjectId();
        if (lastProjectId) {
          initMutation.mutate({ projectId: lastProjectId });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [initMutation.isSuccess, initMutation.isPending, initMutation.mutate]);

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

  // Escape to close help overlay
  useEffect(() => {
    if (!isHelpOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsHelpOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isHelpOpen]);

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport
        onHelpClick={() => setIsHelpOpen(true)}
        onProjectsClick={() => {
          // TODO: modal project list view and allow switch project?
          // for now, open startup page in new tab.
          window.open("/", "_blank");
        }}
        onRenameProject={() => {
          const metadata = getProjectMetadata(projectId);
          if (!metadata) return;

          const newName = prompt("Rename project:", metadata.name);
          if (newName?.trim() && newName.trim() !== metadata.name) {
            updateProjectMetadata(projectId, {
              name: newName.trim(),
            });
          }
        }}
      />
      <PianoRoll />
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
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
      className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50"
    >
      <div className="flex flex-col items-center gap-6 max-w-2xl w-full px-4">
        <h1 className="text-2xl font-semibold text-neutral-200">toy-midi</h1>

        {hasProjects && (
          <div className="w-full max-h-96 overflow-y-auto bg-neutral-800 rounded-lg p-4">
            <h2 className="text-lg font-medium text-neutral-300 mb-3">
              Recent Projects
            </h2>
            <div className="space-y-2">
              {projects.map((project) => {
                const isLastProject = project.id === lastProjectId;
                return (
                  <div
                    key={project.id}
                    data-testid={`project-card-${project.id}`}
                    aria-current={isLastProject ? "true" : undefined}
                    className={`w-full px-4 py-3 rounded-lg transition-colors ${
                      isLastProject
                        ? "bg-emerald-900/30 hover:bg-emerald-900/40 border-2 border-emerald-700/50"
                        : "bg-neutral-700 hover:bg-neutral-600"
                    }`}
                  >
                    {renamingProjectId === project.id ? (
                      <div className="flex items-center gap-2">
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
                          className="flex-1 px-2 py-1 bg-neutral-800 border border-neutral-600 rounded text-neutral-200 text-sm focus:outline-none focus:border-neutral-500"
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameSubmit(project.id)}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={handleRenameCancel}
                          className="px-2 py-1 bg-neutral-600 hover:bg-neutral-500 text-neutral-200 rounded text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <button
                          type="button"
                          onClick={() => onSelectProject(project.id)}
                          className="flex-1 text-left"
                        >
                          <div className="text-neutral-200 font-medium">
                            {project.name}
                          </div>
                          <div className="text-neutral-500 text-sm">
                            {new Date(project.updatedAt).toLocaleDateString()}{" "}
                            {new Date(project.updatedAt).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
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
                            className="p-1.5 hover:bg-neutral-500 rounded transition-colors"
                            title="Rename project"
                          >
                            <Pencil className="size-4 text-neutral-300" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-button-${project.id}`}
                            onClick={(e) => handleDelete(e, project.id)}
                            className="p-1.5 hover:bg-red-600 rounded transition-colors"
                            title="Delete project"
                          >
                            <Trash2 className="size-4 text-neutral-300" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {hasProjects && (
            <button
              type="button"
              data-testid="continue-button"
              onClick={() => lastProjectId && onSelectProject(lastProjectId)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
            >
              Continue Last
            </button>
          )}
          <button
            type="button"
            data-testid="new-project-button"
            onClick={onNewProject}
            className={`px-6 py-3 rounded-lg font-medium ${
              hasProjects
                ? "bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            New Project
          </button>
        </div>
        {hasProjects && (
          <div className="text-neutral-500 text-sm">
            Press{" "}
            <kbd className="px-2 py-1 bg-neutral-800 rounded text-neutral-400 font-mono text-xs border border-neutral-700">
              Enter
            </kbd>{" "}
            to continue
          </div>
        )}
      </div>
    </div>
  );
}
