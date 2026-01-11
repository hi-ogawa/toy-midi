import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HelpOverlay } from "./components/help-overlay";
import { PianoRoll } from "./components/piano-roll";
import { Transport } from "./components/transport";
import { loadAsset } from "./lib/asset-store";
import { audioManager } from "./lib/audio";
import { DEMO_PROJECT } from "./lib/demo-data";
import {
  clearProject,
  hasSavedProject,
  loadDemoProject,
  loadProject,
  saveProject,
  useProjectStore,
} from "./stores/project-store";

// Check once at module load - doesn't change during session
const savedProjectExists = hasSavedProject();

export function App() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const initMutation = useMutation({
    mutationFn: async (mode: "new" | "continue" | "demo") => {
      await audioManager.init();

      if (mode === "new") {
        clearProject();
      } else if (mode === "demo") {
        loadDemoProject();

        // Load demo audio if available
        if (DEMO_PROJECT.audioUrl) {
          const duration = await audioManager.loadFromUrl(
            DEMO_PROJECT.audioUrl,
          );
          useProjectStore.setState({
            audioDuration: duration,
            audioFileName: DEMO_PROJECT.audioFileName,
          });

          const { audioOffset } = useProjectStore.getState();
          audioManager.setOffset(audioOffset);

          const peaks = audioManager.getPeaks(100);
          useProjectStore.getState().setAudioPeaks(peaks, 100);
        }
      } else {
        // mode === "continue"
        const loaded = loadProject();

        if (loaded?.audioAssetKey) {
          const asset = await loadAsset(loaded.audioAssetKey);
          if (asset) {
            const url = URL.createObjectURL(asset.blob);
            const duration = await audioManager.loadFromUrl(url);

            useProjectStore.setState({ audioDuration: duration });

            const { audioOffset } = useProjectStore.getState();
            audioManager.setOffset(audioOffset);

            const peaks = audioManager.getPeaks(100);
            useProjectStore.getState().setAudioPeaks(peaks, 100);
          }
        }
      }

      // Sync mixer settings with audioManager (for continue/demo modes)
      if (mode !== "new") {
        const state = useProjectStore.getState();
        audioManager.setAudioVolume(state.audioVolume);
        audioManager.setMidiVolume(state.midiVolume);
        audioManager.setMetronomeEnabled(state.metronomeEnabled);
        audioManager.setMetronomeVolume(state.metronomeVolume);
      }

      // Setup auto-save on state changes (debounced)
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
        initMutation.mutate("continue"); // Always continue with saved project
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
    return (
      <div
        data-testid="startup-screen"
        className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50"
      >
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-2xl font-semibold text-neutral-200">toy-midi</h1>
          <div className="flex gap-3">
            {hasSavedProject() && (
              <button
                data-testid="continue-button"
                onClick={() => initMutation.mutate("continue")}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
              >
                Continue
              </button>
            )}
            <button
              data-testid="new-project-button"
              onClick={() => initMutation.mutate("new")}
              className={`px-6 py-3 rounded-lg font-medium ${
                savedProjectExists
                  ? "bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              New Project
            </button>
            <button
              data-testid="demo-button"
              onClick={() => initMutation.mutate("demo")}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium"
            >
              Load Demo
            </button>
          </div>
          {savedProjectExists && (
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
