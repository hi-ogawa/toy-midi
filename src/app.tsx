import { useMutation } from "@tanstack/react-query";
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
  listProjects,
  migrateFromSingleProject,
} from "./lib/project-list";
import {
  clearProject,
  hasSavedProject,
  loadProject,
  saveProject,
  useProjectStore,
} from "./stores/project-store";

// Migrate old single-project storage if needed
migrateFromSingleProject();

// Check once at module load - doesn't change during session
const savedProjectExists = hasSavedProject();

export function App() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const initMutation = useMutation({
    mutationFn: async (options: { restore: boolean; projectId?: string }) => {
      await audioManager.init();

      if (options.restore) {
        // Load existing project (by ID or last project)
        loadProject(options.projectId);
      } else {
        // Create new project
        const newProjectId = createProject("Untitled");
        clearProject();
        useProjectStore.setState({ currentProjectId: newProjectId });
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
      // TODO: escape hatch for e2e to persist faster?
      let saveTimeout: number;
      useProjectStore.subscribe(() => {
        clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(() => {
          saveProject();
        }, 500);
      });
    },
  });

  // Enter to continue saved project (startup screen only)
  useEffect(() => {
    // Only enable Enter key if there's a saved project and we're on startup screen
    if (!savedProjectExists || initMutation.isSuccess || initMutation.isPending)
      return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        initMutation.mutate({ restore: true });
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [initMutation, savedProjectExists]);

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
    const projects = listProjects();
    const hasProjects = projects.length > 0;

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
                {projects.map((project) => (
                  <button
                    key={project.id}
                    data-testid={`project-card-${project.id}`}
                    onClick={() =>
                      initMutation.mutate({
                        restore: true,
                        projectId: project.id,
                      })
                    }
                    className="w-full text-left px-4 py-3 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-neutral-200 font-medium">
                          {project.name}
                        </div>
                        <div className="text-neutral-500 text-sm">
                          {new Date(project.updatedAt).toLocaleDateString()}{" "}
                          {new Date(project.updatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {hasProjects && (
              <button
                data-testid="continue-button"
                onClick={() => initMutation.mutate({ restore: true })}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
              >
                Continue Last
              </button>
            )}
            <button
              data-testid="new-project-button"
              onClick={() => initMutation.mutate({ restore: false })}
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

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport onHelpClick={() => setIsHelpOpen(true)} />
      <PianoRoll />
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
