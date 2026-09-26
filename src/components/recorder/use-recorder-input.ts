import { useMutation } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import {
  getCaptureInputs,
  requestCaptureAccess,
} from "../../lib/recorder/capture-input";
import {
  RecorderRuntime,
  RecorderRuntimeState,
} from "../../lib/recorder/runtime";
import { useRecorderPreference } from "./use-recorder-preference";

// "waiting" means the remembered input is ready to restore on the next user
// gesture, and "starting" means it is opening and will be live shortly.
export type RecorderInputStatus = "off" | "waiting" | "starting" | "live";

export function useRecorderInput({
  runtime,
  state,
}: {
  runtime: RecorderRuntime;
  state: RecorderRuntimeState;
}) {
  const active = state.captureStatus !== "disabled";
  const [inputPreference, setInputPreference] = useRecorderPreference("input");
  const [inputEnabled, setInputEnabled] = useRecorderPreference("inputEnabled");
  const [restorePending, setRestorePending] = useState(inputEnabled);
  const [interacted, setInteracted] = useState(false);
  const [resumeError, setResumeError] = useState<Error>();
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
      setRestorePending(false);
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
      await runtime.context.resume();
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
  const onInteraction = useEffectEvent(() => {
    if (!restorePending || interacted) {
      return;
    }
    // Resume in the gesture even when device enumeration is still pending.
    void runtime.context.resume().catch(setResumeError);
    setInteracted(true);
  });

  useEffect(() => {
    // Listen for the events that grant user activation, in the capture phase
    // so handlers that stop propagation cannot hide the first gesture.
    const interact = () => onInteraction();
    window.addEventListener("pointerdown", interact, true);
    window.addEventListener("keydown", interact, true);
    return () => {
      window.removeEventListener("pointerdown", interact, true);
      window.removeEventListener("keydown", interact, true);
    };
  }, []);

  useEffect(() => {
    if (!restorePending || !interacted || !initialized) {
      return;
    }
    setRestorePending(false);
    if (inputEnabled && hasAccess && selectedDevice && !active) {
      startMutation.mutate(selectedDevice.deviceId);
    }
  }, [
    restorePending,
    interacted,
    initialized,
    inputEnabled,
    hasAccess,
    selectedDevice,
    active,
    startMutation.mutate,
  ]);

  const status: RecorderInputStatus = active
    ? "live"
    : startMutation.isPending || (restorePending && inputEnabled && interacted)
      ? "starting"
      : restorePending &&
          inputEnabled &&
          initialized &&
          hasAccess &&
          selectedDevice
        ? "waiting"
        : "off";

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
    error:
      grantMutation.error ??
      refreshMutation.error ??
      startMutation.error ??
      resumeError,
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
    status,
    toggle: () => {
      setRestorePending(false);
      setResumeError(undefined);
      if (!hasAccess) {
        grantMutation.mutate();
      } else if (active) {
        setInputEnabled(false);
        stop();
      } else if (selectedDevice) {
        startMutation.mutate(selectedDevice.deviceId, {
          onSuccess: () => setInputEnabled(true),
        });
      }
    },
    togglePending: grantMutation.isPending || startMutation.isPending,
  };
}
