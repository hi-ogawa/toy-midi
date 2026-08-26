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
  const [preference, setPreference] = useState(() =>
    recorderStorage.readPreferences(),
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(preference.input?.deviceId);

  async function refresh() {
    const nextDevices = await getCaptureInputs();
    setDevices(nextDevices);
    selectDevice(
      nextDevices.some(
        (device) => device.deviceId === preference.input?.deviceId,
      )
        ? preference.input?.deviceId
        : nextDevices[0]?.deviceId,
      { remember: false },
    );
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

  function stop() {
    runtime.stopInput();
    startMutation.reset();
  }

  const grantMutation = useMutation({
    mutationFn: async () => {
      await requestCaptureAccess();
      await refresh();
    },
  });

  const refreshMutation = useMutation({ mutationFn: refresh });

  const startMutation = useMutation({
    mutationFn: async (nextDeviceId: string) => {
      const { channelCount } = await runtime.startInput({
        deviceId: nextDeviceId,
      });
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
  // Optimistically treat a pending grant as access so the UI does not flash
  // the permission callout between a successful prompt and device refresh.
  const hasAccess =
    grantMutation.isPending || devices.some((device) => device.label);
  const selectedDevice = devices.find((device) => device.deviceId === deviceId);
  const route = !initialized
    ? { label: "Loading audio inputs…", needsSetup: false }
    : !hasAccess
      ? { label: "Microphone access required · Set up", needsSetup: true }
      : selectedDevice
        ? {
            label: `${selectedDevice.label || "Audio input"} · Input ${state.selectedChannel + 1}`,
            needsSetup: false,
          }
        : { label: "No input configured · Set up", needsSetup: true };

  return {
    active,
    devices,
    error: grantMutation.error ?? refreshMutation.error ?? startMutation.error,
    hasAccess,
    initialized,
    mutationPending:
      refreshMutation.isPending ||
      grantMutation.isPending ||
      startMutation.isPending,
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
      if (!hasAccess) {
        grantMutation.mutate();
      } else if (active) {
        stop();
      } else if (selectedDevice) {
        startMutation.mutate(selectedDevice.deviceId);
      }
    },
    togglePending: grantMutation.isPending || startMutation.isPending,
  };
}
