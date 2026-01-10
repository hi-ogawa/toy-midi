import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HelpOverlay } from "./components/help-overlay";
import { PianoRoll } from "./components/piano-roll";
import { Transport } from "./components/transport";
import { loadAsset } from "./lib/asset-store";
import { audioManager } from "./lib/audio";
import {
  clearProject,
  hasSavedProject,
  loadProject,
  saveProject,
  useProjectStore,
} from "./stores/project-store";

// Check once at module load - doesn't change during session
const savedProjectExists = hasSavedProject();

export function App() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const initMutation = useMutation({
    mutationFn: async (continueProject: boolean) => {
      await audioManager.init();

      if (!continueProject) {
        clearProject();
      } else {
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

        // Sync mixer settings with audioManager
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

  // Global keyboard handler for help overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show/hide help with '?' key (Shift + /)
      // Note: e.key can be either "?" or "/" depending on keyboard layout/browser
      if ((e.key === "?" || (e.key === "/" && e.shiftKey)) && !e.repeat) {
        // Don't trigger if typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setIsHelpOpen((prev) => !prev);
      }
      // Also allow Escape to close help (only when help is open)
      else if (e.key === "Escape" && isHelpOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsHelpOpen(false);
      }
    };

    // Use capture phase to handle before other components
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
                onClick={() => initMutation.mutate(true)}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
              >
                Continue
              </button>
            )}
            <button
              data-testid="new-project-button"
              onClick={() => initMutation.mutate(false)}
              className={`px-6 py-3 rounded-lg font-medium ${
                savedProjectExists
                  ? "bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              New Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport />
      <PianoRoll />
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
