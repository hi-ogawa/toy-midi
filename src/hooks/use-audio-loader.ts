import { useMutation } from "@tanstack/react-query";
import { saveAsset } from "../lib/asset-store";
import { audioManager, loadAudioFile } from "../lib/audio";
import { useProjectStore } from "../stores/project-store";

export function useAudioLoader() {
  const { setAudioFile, setAudioOffset, setAudioPeaks } = useProjectStore();

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const { buffer, peaks, peaksPerSecond } = await loadAudioFile(file);

      // Save audio to IndexedDB for persistence
      const assetKey = await saveAsset(file);
      setAudioFile(file.name, buffer.duration, assetKey);

      audioManager.player.buffer = buffer;
      audioManager.player.sync().start(0);
      setAudioOffset(0);

      setAudioPeaks(peaks, peaksPerSecond);
    },
  });

  return mutation;
}
