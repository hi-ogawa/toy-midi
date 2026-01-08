import { useEffect, useRef } from "react";
import { PianoRoll } from "./components/piano-roll";
import { Transport } from "./components/transport";
import { loadAsset } from "./lib/asset-store";
import { audioManager } from "./lib/audio";
import {
  loadProject,
  saveProject,
  useProjectStore,
} from "./stores/project-store";

export function App() {
  const hasLoadedRef = useRef(false);
  const setAudioPeaks = useProjectStore((s) => s.setAudioPeaks);

  // Load project on mount (once)
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loaded = loadProject();
    if (loaded) {
      console.log("Restored project from localStorage");

      // Restore audio from IndexedDB if available
      if (loaded.audioAssetKey) {
        loadAsset(loaded.audioAssetKey).then(async (asset) => {
          if (asset) {
            try {
              const url = URL.createObjectURL(asset.blob);
              const duration = await audioManager.loadFromUrl(url);

              // Update duration in store (other fields already loaded)
              useProjectStore.setState({ audioDuration: duration });

              // Extract peaks for waveform
              const peaks = audioManager.getPeaks(100);
              setAudioPeaks(peaks, 100);

              console.log("Restored audio from IndexedDB:", asset.name);
            } catch (err) {
              console.warn("Failed to restore audio:", err);
            }
          }
        });
      }
    }
  }, [setAudioPeaks]);

  // Auto-save on state changes (debounced)
  useEffect(() => {
    // Subscribe to store changes
    const unsubscribe = useProjectStore.subscribe(() => {
      // Debounce saves
      clearTimeout(
        (window as unknown as { _saveTimeout?: number })._saveTimeout,
      );
      (window as unknown as { _saveTimeout?: number })._saveTimeout =
        window.setTimeout(() => {
          saveProject();
        }, 500);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      <Transport />
      <PianoRoll />
    </div>
  );
}
