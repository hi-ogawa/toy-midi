import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { isMidiDeviceSupported } from "../lib/midi-device";
import { preferences } from "../lib/preferences";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";

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
    onError: (error) => {
      console.error(error);
      toast.error("MIDI access was denied");
    },
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
    requestAccess: requestAccessMutation.mutate,
    selectDevice: (deviceId?: string) => {
      setRememberedId(deviceId);
      runtime.selectMidiDevice(deviceId);
    },
  };
}
