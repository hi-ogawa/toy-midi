import { useEffect, useRef, useState } from "react";
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("Loading...");
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
        setLoadingStatus("Restoring audio...");
        loadAsset(loaded.audioAssetKey).then(async (asset) => {
          if (asset) {
            try {
              const url = URL.createObjectURL(asset.blob);
              const duration = await audioManager.loadFromUrl(url);

              // Update duration in store (other fields already loaded)
              useProjectStore.setState({ audioDuration: duration });

              // Sync audioOffset with audioManager
              const { audioOffset } = useProjectStore.getState();
              audioManager.setOffset(audioOffset);

              // Extract peaks for waveform
              const peaks = audioManager.getPeaks(100);
              setAudioPeaks(peaks, 100);

              console.log("Restored audio from IndexedDB:", asset.name);
            } catch (err) {
              console.warn("Failed to restore audio:", err);
            }
          }
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
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
      {isLoading && (
        <div className="fixed inset-0 bg-neutral-900 flex items-center justify-center z-50">
          <div className="text-neutral-400 text-sm">{loadingStatus}</div>
        </div>
      )}
      <Transport />
      <PianoRoll />
    </div>
  );
}
