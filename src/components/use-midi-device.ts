import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { parseMidiDeviceMessage } from "../lib/midi-device";
import { preferences } from "../lib/preferences";
import type { EditorRuntime } from "../lib/runtime";

export function useMidiDevice(runtime: EditorRuntime) {
  const [deviceId, setDeviceId] = preferences.useValue("midiDeviceId");
  const [inputs, setInputs] = useState<MIDIInput[]>();
  const input = inputs?.find((entry) => entry.id === deviceId);

  const requestAccessMutation = useMutation({
    mutationFn: async () => {
      const access = await navigator.requestMIDIAccess();
      const refreshInputs = () =>
        setInputs(
          [...access.inputs.values()].filter(
            (entry) => entry.state === "connected",
          ),
        );
      access.onstatechange = refreshInputs;
      refreshInputs();
    },
    onError: (error) => {
      console.error(error);
      toast.error("MIDI access was denied");
    },
  });

  // Reconnect the remembered device, unless that would show a permission prompt
  // the user didn't ask for.
  useEffect(() => {
    if (!deviceId) {
      return;
    }
    void navigator.permissions.query({ name: "midi" }).then((permission) => {
      if (permission.state === "granted") {
        requestAccessMutation.mutate();
      }
    });
  }, []);

  useEffect(() => {
    if (!input) {
      return;
    }
    input.onmidimessage = (event) => {
      const message = event.data && parseMidiDeviceMessage(event.data);
      if (message) {
        runtime.playMidiDeviceMessage(message);
      }
    };
    return () => {
      input.onmidimessage = null;
      void input.close();
      runtime.stopMidiDevice();
    };
  }, [input, runtime]);

  return {
    inputs,
    input,
    isSupported: "requestMIDIAccess" in navigator,
    requestAccess: requestAccessMutation.mutate,
    selectInput: setDeviceId,
  };
}
