import { useMutation, useQuery } from "@tanstack/react-query";
import { isMidiAccessGranted, isMidiDeviceSupported } from "../lib/midi-device";
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
  });

  useQuery({
    queryKey: ["midi-device-restore"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      // Reconnect only when that shows no permission prompt on page load.
      if (rememberedId && (await isMidiAccessGranted())) {
        await runtime.requestMidiAccess(rememberedId);
      }
      return true;
    },
  });

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
