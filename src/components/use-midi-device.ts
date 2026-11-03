import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getConnectedMidiInputs,
  isMidiAccessGranted,
  isMidiDeviceSupported,
  requestMidiAccess,
  subscribeMidiInputs,
} from "../lib/midi-device";
import { preferences } from "../lib/preferences";
import type { EditorRuntime, EditorRuntimeState } from "../lib/runtime";

export type UseMidiDeviceResult = ReturnType<typeof useMidiDevice>;

const MIDI_ACCESS_KEY = ["midi-access"];

export function useMidiDevice({
  runtime,
  state,
}: {
  runtime: EditorRuntime;
  state: EditorRuntimeState;
}) {
  const queryClient = useQueryClient();
  const [rememberedId, setRememberedId] = preferences.useValue("midiDeviceId");
  const [devices, setDevices] = useState<MIDIInput[]>();
  const isSupported = isMidiDeviceSupported();

  const accessQuery = useQuery({
    queryKey: MIDI_ACCESS_KEY,
    enabled: isSupported,
    retry: false,
    staleTime: Infinity,
    // Wrap the optional result because query data itself must be defined.
    queryFn: async (): Promise<{ access?: MIDIAccess }> => {
      // Page load must not show a permission prompt.
      if (!(await isMidiAccessGranted())) {
        return {};
      }
      const access = await requestMidiAccess();
      const input = getConnectedMidiInputs(access).find(
        (entry) => entry.id === rememberedId,
      );
      if (input) {
        await runtime.startMidiInput(input);
      }
      return { access };
    },
  });
  const access = accessQuery.data?.access;

  const requestAccessMutation = useMutation({
    mutationFn: requestMidiAccess,
    onSuccess: (nextAccess) => {
      queryClient.setQueryData(MIDI_ACCESS_KEY, { access: nextAccess });
    },
  });

  useEffect(() => {
    if (access) {
      return subscribeMidiInputs(access, setDevices);
    }
  }, [access]);

  return {
    devices,
    deviceId: state.midiConnection?.deviceId,
    isSupported,
    isAccessDenied: requestAccessMutation.isError,
    requestAccess: () => {
      if (!access) {
        requestAccessMutation.mutate();
      }
    },
    selectDevice: (deviceId?: string) => {
      setRememberedId(deviceId);
      const input = devices?.find((entry) => entry.id === deviceId);
      if (input) {
        void runtime.startMidiInput(input);
      } else {
        void runtime.stopMidiInput();
      }
    },
  };
}
