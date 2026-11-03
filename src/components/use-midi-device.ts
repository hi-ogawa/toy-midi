import { useMutation, useQuery } from "@tanstack/react-query";
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
  });

  useQuery({
    queryKey: ["midi-device-restore"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      if (rememberedId) {
        await runtime.restoreMidiDevice(rememberedId);
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
