import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getCaptureInputs,
  requestCaptureAccess,
} from "../../lib/recorder/capture-input";
import {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { recorderStorage } from "../../lib/recorder/storage";

export function useRecorderInput({
  runtime,
  state,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
}) {
  const active = state.captureStatus !== "disabled";
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [preference, setPreference] = useState(() =>
    recorderStorage.readPreferences(),
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(preference.input?.deviceId);

  async function refresh() {
    const nextDevices = await getCaptureInputs();
    setDevices(nextDevices);
    const nextDeviceId = nextDevices.some(
      (device) => device.deviceId === preference.input?.deviceId,
    )
      ? preference.input?.deviceId
      : nextDevices[0]?.deviceId;
    selectDevice(nextDeviceId, { remember: false });
  }

  function selectDevice(
    nextDeviceId?: string,
    { remember = true }: { remember?: boolean } = {},
  ) {
    if (nextDeviceId !== deviceId && active) {
      stop();
    }
    setDeviceId(nextDeviceId);
    if (remember) {
      const nextPreference = {
        ...preference,
        input: nextDeviceId
          ? { deviceId: nextDeviceId, channel: 0 }
          : undefined,
      };
      setPreference(nextPreference);
      recorderStorage.writePreferences(nextPreference);
    }
  }

  function openSetup() {
    setIsSetupOpen(true);
  }

  function closeSetup() {
    setIsSetupOpen(false);
  }

  function stop() {
    runtime.stopInput();
    inputMutation.reset();
  }

  const refreshMutation = useMutation({ mutationFn: refresh });

  const inputMutation = useMutation({
    mutationFn: async (action: "grant" | "start") => {
      if (action === "grant") {
        await requestCaptureAccess();
        await refresh();
        setIsSetupOpen(false);
        return;
      }
      if (!deviceId) {
        throw new Error("Choose an audio input before enabling capture.");
      }
      const { channelCount } = await runtime.startInput({ deviceId });
      runtime.selectChannel(
        Math.min(preference.input?.channel ?? 0, channelCount - 1),
      );
      runtime.setLatencyCompensation(
        preference.input?.latencyCompensation ?? 0,
      );
    },
  });

  // refresh on mount and watch for device changes
  useEffect(() => {
    const refreshInputs = () => refreshMutation.mutate();
    refreshInputs();
    navigator.mediaDevices.addEventListener("devicechange", refreshInputs);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", refreshInputs);
  }, [refreshMutation.mutate]);

  // The initial device enumeration has settled, so the UI can leave loading state.
  const initialized = refreshMutation.isSuccess || refreshMutation.isError;
  const hasAccess = devices.some((device) => device.label);
  const selectedDevice = devices.find((device) => device.deviceId === deviceId);
  const route = !initialized
    ? { label: "Loading audio inputs…", needsSetup: false }
    : !hasAccess
      ? { label: "Microphone access required", needsSetup: true }
      : selectedDevice
        ? {
            label: `${selectedDevice.label || "Unnamed input"} · Channel ${state.selectedChannel + 1}`,
            needsSetup: false,
          }
        : { label: "No input configured", needsSetup: true };

  return {
    active,
    devices,
    error: inputMutation.error ?? refreshMutation.error,
    hasAccess,
    initialized,
    mutationPending: refreshMutation.isPending || inputMutation.isPending,
    isSetupOpen,
    openSetup,
    closeSetup,
    grantAccess: () => inputMutation.mutate("grant"),
    route,
    selectedDevice,
    selectDevice,
    selectChannel: (channel: number) => {
      runtime.selectChannel(channel);
      if (!deviceId) {
        return;
      }
      const nextPreference = {
        ...preference,
        input: { ...preference.input, deviceId, channel },
      };
      setPreference(nextPreference);
      recorderStorage.writePreferences(nextPreference);
    },
    setLatencyCompensation: (latencyCompensation: number) => {
      runtime.setLatencyCompensation(latencyCompensation);
      if (!preference.input) {
        return;
      }
      const nextPreference = {
        ...preference,
        input: { ...preference.input, latencyCompensation },
      };
      setPreference(nextPreference);
      recorderStorage.writePreferences(nextPreference);
    },
    toggle: () => {
      if (active) {
        stop();
      } else if (hasAccess && selectedDevice) {
        inputMutation.mutate("start");
      }
    },
    togglePending: inputMutation.isPending,
  };
}
