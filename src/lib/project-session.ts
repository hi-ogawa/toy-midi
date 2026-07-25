import { toast } from "sonner";
import { historyStore } from "../stores/history-store";
import {
  fromSavedProject,
  toSavedProject,
  useProjectStore,
} from "../stores/project-store";
import { debounce } from "../utils/timing";
import { audioManager, loadAudioFile } from "./audio";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "./keyboard";
import { projectStorage } from "./project-storage";

export interface ProjectSession {
  projectId: string;
  projectName: string;
  dispose: () => void;
}

// Open a project as the active document: hydrate the store synchronously,
// wire project-scoped subscriptions and shortcuts, and attach audio in the
// background. The editor is usable (viewing/editing notes) immediately;
// playback enables when audioManager reaches "ready". dispose() undoes the
// wiring so another project can be opened without a page reload.
export function openProjectSession(options: {
  projectId?: string;
}): ProjectSession {
  // Load existing project, or create a new default one
  const projectId = options.projectId ?? projectStorage.createNew();
  const metadata = projectStorage.getMetadata(projectId);
  if (!metadata) {
    throw new Error(`Project ${projectId} metadata not found`);
  }
  projectStorage.setLastProjectId(projectId);
  const data = projectStorage.load(projectId);
  useProjectStore.setState(fromSavedProject(data));

  // applyState no-ops until audioManager is ready; attachAudio runs a full
  // sync at the ready transition, so changes made while loading are not lost.
  const unsubscribeAudioSync = useProjectStore.subscribe((state, prevState) => {
    audioManager.applyState(state, prevState);
  });

  // Auto-save on state changes (debounced)
  const autoSaveDebounceMs = Number(
    import.meta.env.VITE_AUTO_SAVE_DEBOUNCE_MS ?? 500,
  );
  const saveDebouncer = debounce(() => {
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
  const unsubscribeAutoSave = useProjectStore.subscribe(saveDebouncer.schedule);
  activeSaveDebouncer = saveDebouncer;

  // Playback shortcut, scoped to the session rather than to whichever
  // component happens to render: Space toggles playback (no-op until audio
  // is ready via the guarded togglePlayback).
  const handleKeydown = (e: KeyboardEvent) => {
    if (isShortcutTextInputTarget(e.target)) {
      return;
    }
    if (matchKeyboardEvent(e, "Space") && !e.repeat) {
      e.preventDefault();
      audioManager.togglePlayback();
    }
  };
  window.addEventListener("keydown", handleKeydown);

  // Background audio attach, owned by the session: initialize the synth,
  // run one full applyState at the ready transition, then restore stored
  // audio assets. Strictly sequential, handles every error internally so
  // the task can never reject, and stops touching the store once disposed.
  let disposed = false;
  const attachAudio = async () => {
    try {
      await audioManager.init();
    } catch (e) {
      console.error(e);
      toast.error("Failed to initialize audio. Playback is unavailable.");
      return;
    }
    if (disposed) {
      return;
    }
    audioManager.applyState(useProjectStore.getState());

    const project = useProjectStore.getState();
    for (const track of project.audioTracks) {
      try {
        const asset = await projectStorage.loadAsset(track.assetKey);
        if (disposed) {
          return;
        }
        if (!asset) {
          toast.warning(
            `Audio asset not found for "${track.fileName}". The track will be cleared.`,
          );
          project.deleteAudioTrack(track.id);
          continue;
        }
        const { buffer, audioView } = await loadAudioFile(
          new File([asset.blob], asset.name),
        );
        if (disposed) {
          return;
        }
        const playback = audioManager.getAudioTrack(track.id);
        playback.setBuffer(buffer);
        playback.sync(track.offset);
        project.updateAudioTrack(track.id, { audioView });
      } catch (e) {
        console.error(e);
        toast.error(`Failed to load audio "${track.fileName}".`);
      }
    }
  };
  void attachAudio();

  return {
    projectId,
    projectName: metadata.name,
    dispose: () => {
      disposed = true;
      window.removeEventListener("keydown", handleKeydown);
      unsubscribeAudioSync();
      unsubscribeAutoSave();
      saveDebouncer.flush();
      activeSaveDebouncer = undefined;
      historyStore.clearHistory();
    },
  };
}

// Auto-save debouncer of the active session, so e2e tests can force a save
// instead of waiting out the debounce.
let activeSaveDebouncer: ReturnType<typeof debounce> | undefined;

export function flushAutoSave() {
  activeSaveDebouncer?.flush();
}
