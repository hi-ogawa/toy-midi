import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { PianoRoll } from "./components/piano-roll";
import { StartupScreen } from "./components/startup-screen";
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

async function initNewProject() {
  await audioManager.init();
  clearProject();
}

async function initContinueProject() {
  await audioManager.init();

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

export function App() {
  const newProjectMutation = useMutation({ mutationFn: initNewProject });
  const continueProjectMutation = useMutation({
    mutationFn: initContinueProject,
  });

  const isLoading =
    newProjectMutation.isPending || continueProjectMutation.isPending;
  const isReady =
    newProjectMutation.isSuccess || continueProjectMutation.isSuccess;

  // Auto-save on state changes (debounced) - only when ready
  useEffect(() => {
    if (!isReady) return;

    const unsubscribe = useProjectStore.subscribe(() => {
      clearTimeout(
        (window as unknown as { _saveTimeout?: number })._saveTimeout,
      );
      (window as unknown as { _saveTimeout?: number })._saveTimeout =
        window.setTimeout(() => {
          saveProject();
        }, 500);
    });

    return () => unsubscribe();
  }, [isReady]);

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-neutral-900">
        <div className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50">
          <div className="text-neutral-400 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <StartupScreen
        hasSavedProject={savedProjectExists}
        onNewProject={() => newProjectMutation.mutate()}
        onContinue={() => continueProjectMutation.mutate()}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport />
      <PianoRoll />
    </div>
  );
}
