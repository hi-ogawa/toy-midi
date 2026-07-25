import { toast } from "sonner";
import { historyStore } from "../stores/history-store";
import {
  type AudioTrack,
  fromSavedProject,
  type ProjectState,
  toSavedProject,
  useProjectStore,
} from "../stores/project-store";
import { debounce } from "../utils/timing";
import { audioManager, loadAudioFile } from "./audio";
import { EMPTY_AUDIO_VIEW } from "./audio-view";
import { isShortcutTextInputTarget, matchKeyboardEvent } from "./keyboard";
import { projectStorage } from "./project-storage";

export interface ProjectSession {
  projectId: string;
  projectName: string;
  dispose: () => void;
}

export type ProjectSessionResult =
  | { ok: true; value: ProjectSession }
  | { ok: false; error: unknown };

// Open-once cache so ProjectRoute can read the session synchronously during
// render (no loading flash) while staying idempotent under StrictMode's
// double render. Failures are cached like successes, so an open is attempted
// exactly once per id. Entries live until full-page navigation, matching the
// previous react-query gcTime: Infinity behavior.
const sessionResults = new Map<string, ProjectSessionResult>();

export function getProjectSession(projectId: string): ProjectSessionResult {
  let result = sessionResults.get(projectId);
  if (!result) {
    try {
      result = { ok: true, value: openProjectSession(projectId) };
    } catch (error) {
      result = { ok: false, error };
    }
    sessionResults.set(projectId, result);
  }
  return result;
}

// Open a project as the active document: hydrate the store synchronously,
// wire project-scoped subscriptions and shortcuts, and attach audio in the
// background. The editor is usable (viewing/editing notes) immediately;
// playback enables when audioManager reaches "ready". dispose() undoes the
// wiring so another project can be opened without a page reload.
function openProjectSession(projectId: string): ProjectSession {
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

  // Session lifetime as an AbortController: dispose aborts, which detaches
  // the shortcut listener and stops the background audio attach.
  const abortController = new AbortController();
  const { signal } = abortController;

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
  window.addEventListener("keydown", handleKeydown, { signal });

  // Background audio attach, owned by the session: initialize the synth,
  // run one full applyState at the ready transition, then restore stored
  // audio assets. Strictly sequential, handles every error internally so
  // the task can never reject, and stops touching the store once aborted.
  const attachAudio = async () => {
    try {
      await audioManager.init();
    } catch (e) {
      console.error(e);
      toast.error("Failed to initialize audio. Playback is unavailable.");
      return;
    }
    if (signal.aborted) {
      return;
    }
    // Fresh getState: edits made while audio was loading must be included.
    audioManager.applyState(useProjectStore.getState());
    await restoreAudioTracks(useProjectStore.getState(), signal);
  };
  void attachAudio();

  return {
    projectId,
    projectName: metadata.name,
    dispose: () => {
      abortController.abort();
      unsubscribeAudioSync();
      unsubscribeAutoSave();
      saveDebouncer.flush();
      activeSaveDebouncer = undefined;
      historyStore.clearHistory();
    },
  };
}

// Restore stored audio for the project's tracks: this level owns the store
// reconciliation (waveform on success, track removal when the asset is
// gone) and user-facing errors; IO/decode and playback wiring live below.
// One bad asset skips that track only.
async function restoreAudioTracks(
  project: ProjectState,
  signal: AbortSignal,
): Promise<void> {
  for (const track of project.audioTracks) {
    try {
      const loaded = await loadStoredTrackAudio(track);
      if (signal.aborted) {
        return;
      }
      if (!loaded) {
        toast.warning(
          `Audio asset not found for "${track.fileName}". The track will be cleared.`,
        );
        project.deleteAudioTrack(track.id);
        continue;
      }
      audioManager.attachTrackBuffer(track.id, loaded.buffer, track.offset);
      project.updateAudioTrack(track.id, { audioView: loaded.audioView });
    } catch (e) {
      console.error(e);
      if (signal.aborted) {
        return;
      }
      toast.error(`Failed to load audio "${track.fileName}".`);
      // Mark the waveform unavailable so `audioView === null` stays
      // pending-only and the region doesn't read as loading forever.
      // TODO(#182): model restore failure explicitly (distinct from the
      // too-long waveform bailout) so the region can render the track as dead.
      project.updateAudioTrack(track.id, { audioView: EMPTY_AUDIO_VIEW });
    }
  }
}

// Load a track's stored asset bytes and decode them; null when the asset
// is missing from storage. No store access, no user-facing effects.
async function loadStoredTrackAudio(track: AudioTrack) {
  const asset = await projectStorage.loadAsset(track.assetKey);
  if (!asset) {
    return null;
  }
  return await loadAudioFile(new File([asset.blob], asset.name));
}

// Auto-save debouncer of the active session, so e2e tests can force a save
// instead of waiting out the debounce.
let activeSaveDebouncer: ReturnType<typeof debounce> | undefined;

export function flushAutoSave() {
  activeSaveDebouncer?.flush();
}
