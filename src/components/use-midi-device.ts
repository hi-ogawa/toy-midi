import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { isMidiDeviceSupported } from "../lib/midi-device";
import { preferences } from "../lib/preferences";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";

export type UseMidiDeviceResult = ReturnType<typeof useMidiDevice>;

export function useMidiDevice({
  runtime,
  state,
}: {
  runtime: EditorRuntime;
  state: EditorRuntimeState;
}) {
  const [rememberedId, setRememberedId] = preferences.useValue("midiDeviceId");

  const requestAccessMutation = useMutation({
    mutationFn: () => runtime.requestMidiAccess(rememberedId),
    // A failed request shows as the denied state instead of a toast.
    onError: (error) => console.error(error),
  });

  useEffect(() => {
    if (rememberedId) {
      void runtime.restoreMidiDevice(rememberedId);
    }
  }, []);

  return {
    devices: state.midiDevices,
    deviceId: state.midiDeviceId,
    isSupported: isMidiDeviceSupported(),
    isAccessDenied: requestAccessMutation.isError,
    requestAccess: () => requestAccessMutation.mutate(),
    selectDevice: (deviceId?: string) => {
      setRememberedId(deviceId);
      runtime.selectMidiDevice(deviceId);
    },
  };
}
