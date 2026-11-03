import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  getConnectedMidiInputs,
  isMidiAccessGranted,
  isMidiDeviceSupported,
} from "../lib/midi-device";
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
  const [devices, setDevices] = useState<MIDIInput[]>();

  async function openAccess() {
    const access = await navigator.requestMIDIAccess();
    // Runs for the life of the page, so it can't close over a rendered value.
    const refresh = () => {
      const inputs = getConnectedMidiInputs(access);
      setDevices(inputs);
      connectDevice(inputs, preferences.get().midiDeviceId);
    };
    access.onstatechange = refresh;
    refresh();
  }

  function connectDevice(inputs: MIDIInput[], deviceId?: string) {
    const input = inputs.find((entry) => entry.id === deviceId);
    if (input?.id === runtime.store.get().midiDeviceId) {
      return;
    }
    if (input) {
      runtime.startMidiInput(input);
    } else {
      runtime.stopMidiInput();
    }
  }

  const requestAccessMutation = useMutation({ mutationFn: openAccess });

  useQuery({
    queryKey: ["midi-device-restore"],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      // Reconnect only when that shows no permission prompt on page load.
      if (rememberedId && (await isMidiAccessGranted())) {
        await openAccess();
      }
      return true;
    },
  });

  return {
    devices,
    deviceId: state.midiDeviceId,
    isSupported: isMidiDeviceSupported(),
    isAccessDenied: requestAccessMutation.isError,
    requestAccess: () => {
      if (!devices) {
        requestAccessMutation.mutate();
      }
    },
    selectDevice: (deviceId?: string) => {
      setRememberedId(deviceId);
      connectDevice(devices ?? [], deviceId);
    },
  };
}
