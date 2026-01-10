import { useEffect, useState } from "react";
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

type AppState = "startup" | "loading" | "ready";

export function App() {
  const [appState, setAppState] = useState<AppState>("startup");
  const [loadingStatus, setLoadingStatus] = useState("Initializing...");
  const [savedProjectExists, setSavedProjectExists] = useState(false);
  const setAudioPeaks = useProjectStore((s) => s.setAudioPeaks);

  // Check for saved project on mount
  useEffect(() => {
    setSavedProjectExists(hasSavedProject());
  }, []);

  // Handle "New Project" click
  const handleNewProject = async () => {
    setAppState("loading");
    setLoadingStatus("Initializing...");

    await audioManager.init();
    clearProject();

    setAppState("ready");
  };

  // Handle "Continue" click - restore saved project
  const handleContinue = async () => {
    setAppState("loading");
    setLoadingStatus("Initializing...");

    await audioManager.init();

    setLoadingStatus("Restoring project...");
    const loaded = loadProject();

    if (loaded?.audioAssetKey) {
      setLoadingStatus("Restoring audio...");
      try {
        const asset = await loadAsset(loaded.audioAssetKey);
        if (asset) {
          const url = URL.createObjectURL(asset.blob);
          const duration = await audioManager.loadFromUrl(url);

          useProjectStore.setState({ audioDuration: duration });

          const { audioOffset } = useProjectStore.getState();
          audioManager.setOffset(audioOffset);

          const peaks = audioManager.getPeaks(100);
          setAudioPeaks(peaks, 100);

          console.log("Restored audio from IndexedDB:", asset.name);
        }
      } catch (err) {
        console.warn("Failed to restore audio:", err);
      }
    }

    // Sync mixer settings with audioManager
    const state = useProjectStore.getState();
    audioManager.setAudioVolume(state.audioVolume);
    audioManager.setMidiVolume(state.midiVolume);
    audioManager.setMetronomeEnabled(state.metronomeEnabled);
    audioManager.setMetronomeVolume(state.metronomeVolume);

    setAppState("ready");
  };

  // Auto-save on state changes (debounced) - only when ready
  useEffect(() => {
    if (appState !== "ready") return;

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
  }, [appState]);

  if (appState === "startup") {
    return (
      <StartupScreen
        hasSavedProject={savedProjectExists}
        onNewProject={handleNewProject}
        onContinue={handleContinue}
      />
    );
  }

  if (appState === "loading") {
    return (
      <div className="h-screen flex flex-col bg-neutral-900">
        <div className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50">
          <div className="text-neutral-400 text-sm">{loadingStatus}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport />
      <PianoRoll />
    </div>
  );
}
