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
import { useRecorderPreference } from "./use-recorder-preference";

export function useRecorderInput({
  runtime,
  state,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
}) {
  const active = state.captureStatus !== "disabled";
  const [inputPreference, setInputPreference] = useRecorderPreference("input");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(inputPreference?.deviceId);

  async function refresh() {
    const nextDevices = await getCaptureInputs();
    setDevices(nextDevices);
    selectDevice(
      nextDevices.some(
        (device) => device.deviceId === inputPreference?.deviceId,
      )
        ? inputPreference?.deviceId
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
      setInputPreference(
        nextDeviceId ? { deviceId: nextDeviceId, channel: 0 } : undefined,
      );
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
        Math.min(inputPreference?.channel ?? 0, channelCount - 1),
      );
      runtime.setLatencyCompensation(inputPreference?.latencyCompensation ?? 0);
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
      setInputPreference((current) => ({ ...current, deviceId, channel }));
    },
    setLatencyCompensation: (latencyCompensation: number) => {
      runtime.setLatencyCompensation(latencyCompensation);
      if (!deviceId) {
        return;
      }
      setInputPreference((current) => ({
        ...current,
        deviceId,
        channel: state.selectedChannel,
        latencyCompensation,
      }));
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
