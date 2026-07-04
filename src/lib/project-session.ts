import { toast } from "sonner";
import { historyStore } from "../stores/history-store";
import {
  fromSavedProject,
  toSavedProject,
  useProjectStore,
} from "../stores/project-store";
import { audioManager, loadAudioFile } from "./audio";
import { projectStorage } from "./project-storage";

export interface ProjectSession {
  projectId: string;
  dispose: () => void;
}

// Open a project as the active document: hydrate the store, load audio
// assets, and wire project-scoped subscriptions. dispose() undoes the wiring
// so another project can be opened without a page reload.
export async function openProjectSession(options: {
  projectId?: string;
}): Promise<ProjectSession> {
  // Load existing project, or create a new default one
  let projectId: string;
  if (options.projectId) {
    projectId = options.projectId;
  } else {
    projectId = projectStorage.createNew();
  }
  projectStorage.setLastProjectId(projectId);

  const metadata = projectStorage.getMetadata(projectId);
  if (!metadata) {
    throw new Error(`Project ${projectId} metadata not found`);
  }
  const data = projectStorage.load(projectId);
  useProjectStore.setState({
    ...fromSavedProject(data),
    projectId,
    projectName: metadata.name,
  });

  const project = useProjectStore.getState();
  for (const track of project.audioTracks) {
    const asset = await projectStorage.loadAsset(track.assetKey);
    if (asset) {
      const { buffer, audioView } = await loadAudioFile(
        new File([asset.blob], asset.name),
      );
      const playback = audioManager.getAudioTrack(track.id);
      playback.setBuffer(buffer);
      playback.sync(track.offset);
      project.updateAudioTrack(track.id, { audioView });
    } else {
      toast.warning(
        `Audio asset not found for "${track.fileName}". The track will be cleared.`,
      );
      project.deleteAudioTrack(track.id);
    }
  }

  audioManager.applyState(useProjectStore.getState());
  const unsubscribeAudioSync = useProjectStore.subscribe((state, prevState) => {
    audioManager.applyState(state, prevState);
  });

  // Write renames through to project metadata (name is not part of the document)
  const unsubscribeNameSync = useProjectStore.subscribe((state, prevState) => {
    if (state.projectName !== prevState.projectName) {
      projectStorage.updateMetadata(projectId, { name: state.projectName });
    }
  });

  // Auto-save on state changes (debounced)
  const autoSaveDebounceMs = Number(
    import.meta.env.VITE_AUTO_SAVE_DEBOUNCE_MS ?? 500,
  );
  let saveTimeout: number;
  const unsubscribeAutoSave = useProjectStore.subscribe(() => {
    clearTimeout(saveTimeout);
    saveTimeout = window.setTimeout(() => {
      try {
        projectStorage.save(
          projectId,
          toSavedProject(useProjectStore.getState()),
        );
      } catch (e) {
        console.error("Failed to save project:", e);
        toast.error("Failed to save project. Changes may be lost.");
      }
    }, autoSaveDebounceMs);
  });

  return {
    projectId,
    dispose: () => {
      unsubscribeAudioSync();
      unsubscribeNameSync();
      unsubscribeAutoSave();
      clearTimeout(saveTimeout);
      historyStore.clearHistory();
    },
  };
}
