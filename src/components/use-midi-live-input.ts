import type { ProjectUiStore } from "../lib/preferences";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";

export function useMidiLiveInput({
  runtime,
  state,
  projectUiStore,
}: {
  runtime: EditorRuntime;
  state: EditorRuntimeState;
  projectUiStore: ProjectUiStore;
}) {
  const [isKeyboardOpen, setIsKeyboardOpen] =
    projectUiStore.useValue("midiKeyboardOpen");
  const isDeviceConnected = state.midiConnection !== undefined;

  function toggleKeyboard() {
    if (isKeyboardOpen) {
      closeKeyboard();
    } else {
      setIsKeyboardOpen(true);
    }
  }

  function closeKeyboard() {
    setIsKeyboardOpen(false);
    if (!isDeviceConnected) {
      void runtime.setMidiMonitorTrack(undefined);
    }
  }

  return {
    isAvailable: isDeviceConnected || isKeyboardOpen,
    isKeyboardOpen,
    toggleKeyboard,
    closeKeyboard,
  };
}
