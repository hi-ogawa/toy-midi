import { useMutation } from "@tanstack/react-query";
import {
  CircleStopIcon,
  HouseIcon,
  Mic2Icon,
  MoreVerticalIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  RotateCcwIcon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { recorderRuntime } from "../lib/recorder/runtime";
import { routes } from "../lib/routes";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function Recorder() {
  const state = useSyncExternalStore(
    recorderRuntime.subscribe,
    recorderRuntime.getSnapshot,
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>();

  async function refreshInputs() {
    const nextDevices = await recorderRuntime.getInputs();
    setDevices(nextDevices);
    selectDevice(
      nextDevices.some((device) => device.deviceId === deviceId)
        ? deviceId
        : nextDevices[0]?.deviceId,
    );
  }

  const grantAccessMutation = useMutation({
    mutationFn: async () => {
      await recorderRuntime.requestAccess();
      await refreshInputs();
    },
  });

  const refreshInputsMutation = useMutation({
    mutationFn: refreshInputs,
  });

  useEffect(() => {
    const refresh = () => refreshInputsMutation.mutate();
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refreshInputsMutation.mutate]);

  const inputsInitialized =
    refreshInputsMutation.isSuccess || refreshInputsMutation.isError;
  const hasAccess = devices.some((device) => device.label);
  const selectedDevice = devices.find((device) => device.deviceId === deviceId);
  const inputActive = state.inputSettings !== undefined;

  const startInputMutation = useMutation({
    mutationFn: (deviceId: string) => recorderRuntime.startInput(deviceId),
  });
  const backingMutation = useMutation({
    mutationFn: (file: File) => recorderRuntime.loadBacking(file),
  });
  const playMutation = useMutation({
    mutationFn: () => recorderRuntime.play(),
  });
  const recordMutation = useMutation({
    mutationFn: () => recorderRuntime.startRecording(),
  });

  const duration = Math.max(
    1,
    state.backingDuration,
    state.takeOffset + state.takeDuration,
  );
  const isRecording = state.status === "recording";
  const isProcessing = state.status === "processing";

  const error =
    grantAccessMutation.error ??
    refreshInputsMutation.error ??
    startInputMutation.error ??
    backingMutation.error ??
    playMutation.error ??
    recordMutation.error;

  function selectDevice(nextDeviceId?: string) {
    if (nextDeviceId !== deviceId && inputActive) {
      recorderRuntime.stopInput();
      startInputMutation.reset();
    }
    setDeviceId(nextDeviceId);
  }

  return (
    <main className="h-screen overflow-y-auto bg-neutral-100 text-neutral-950">
      <header className="sticky top-0 z-10 flex h-[53px] items-center border-b border-neutral-700 bg-neutral-800 px-4 text-neutral-100 shadow-sm">
        <Mic2Icon className="mr-2 size-5 text-emerald-400" />
        <span className="font-medium">Recorder</span>
        <div className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              title="More"
              aria-label="More"
              className="size-9 hover:bg-accent hover:text-accent-foreground"
            >
              <MoreVerticalIcon className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={routes.home.href()}>
                <HouseIcon />
                Home
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-8 py-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_16px_45px_rgb(34_48_41/0.08)]">
            <div className="flex items-center gap-3 border-b border-neutral-200 px-5 py-4">
              <Button
                onClick={() => {
                  if (state.isPlaying) {
                    recorderRuntime.pause();
                  } else {
                    playMutation.mutate();
                  }
                }}
                className="size-11 border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
              >
                {state.isPlaying ? (
                  <PauseIcon className="size-5" />
                ) : (
                  <PlayIcon className="size-5" />
                )}
              </Button>
              <Button
                onClick={() => recorderRuntime.stop()}
                disabled={isRecording || isProcessing}
                className="size-10 border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
                title="Return to start"
              >
                <RotateCcwIcon className="size-4" />
              </Button>
              <div className="ml-2 font-mono text-lg tabular-nums text-neutral-950">
                {formatTime(state.position)}
              </div>
              <div className="ml-auto text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                {state.status}
              </div>
            </div>
            <div className="px-5 py-5">
              <input
                type="range"
                min={0}
                max={duration}
                step={0.01}
                value={Math.min(state.position, duration)}
                onChange={(event) =>
                  recorderRuntime.seek(event.currentTarget.valueAsNumber)
                }
                disabled={isRecording || isProcessing}
                className="w-full accent-emerald-700"
              />
              <div className="mt-2 flex justify-between font-mono text-[11px] text-neutral-500">
                <span>00:00.000</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-700">
              Tracks
            </h2>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)_8rem] items-center gap-4 rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm">
              <span className="font-mono text-xs font-semibold text-emerald-700">
                BACKING
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm text-neutral-950">
                  {state.backingName ?? "No backing track loaded"}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {state.backingName
                    ? `${formatTime(state.backingDuration)} · click at 0:00`
                    : "WAV, MP3, or another browser-decodable audio file"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-md border border-neutral-300 bg-white p-2 text-neutral-900 hover:bg-neutral-100">
                  <UploadIcon className="size-4" />
                  <input
                    type="file"
                    accept="audio/*,.wav"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) {
                        backingMutation.mutate(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <Button
                  onClick={() =>
                    recorderRuntime.setBackingMuted(!state.backingMuted)
                  }
                  className={
                    state.backingMuted
                      ? "size-9 border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                      : "size-9 border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
                  }
                  title="Mute backing"
                >
                  M
                </Button>
              </div>
              <div />
              <label className="flex items-center gap-3 text-xs font-semibold text-neutral-600">
                Gain
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.01}
                  value={state.backingGain}
                  onChange={(event) =>
                    recorderRuntime.setBackingGain(
                      event.currentTarget.valueAsNumber,
                    )
                  }
                  className="w-full accent-emerald-700"
                />
              </label>
              <span className="text-right font-mono text-xs text-neutral-600">
                {Math.round(state.backingGain * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-[6rem_minmax(0,1fr)_8rem] items-center gap-4 rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm">
              <span className="font-mono text-xs font-semibold text-neutral-700">
                TAKE 01
              </span>
              <div>
                <div className="text-sm text-neutral-950">
                  {state.hasTake ? "Recorded input" : "No take recorded"}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {state.hasTake
                    ? `${formatTime(state.takeDuration)} · ${state.capturedFrames.toLocaleString()} frames`
                    : "Direct monitoring stays outside the browser"}
                </div>
              </div>
              <div />
              <div />
              <label className="flex items-center gap-3 text-xs font-semibold text-neutral-600">
                Alignment
                <input
                  type="number"
                  step={0.1}
                  value={(state.takeOffset * 1000).toFixed(1)}
                  onChange={(event) => {
                    const offset = event.currentTarget.valueAsNumber / 1000;
                    if (Number.isFinite(offset)) {
                      recorderRuntime.setTakeOffset(offset);
                    }
                  }}
                  disabled={!state.hasTake}
                  className="w-28 rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-neutral-950 disabled:bg-neutral-100 disabled:text-neutral-500"
                />
                ms
              </label>
              <div />
            </div>
          </section>

          <section className="flex items-center justify-center rounded-xl border border-neutral-200 bg-white py-7 shadow-sm">
            <Button
              onClick={() =>
                isRecording
                  ? recorderRuntime.stopRecording()
                  : recordMutation.mutate()
              }
              disabled={state.status === "idle" || isProcessing}
              className={
                isRecording
                  ? "h-14 gap-3 border-neutral-300 bg-white px-7 font-semibold text-neutral-900 hover:bg-neutral-100"
                  : "h-14 gap-3 border-emerald-700 bg-emerald-700 px-7 font-semibold text-white hover:bg-emerald-800"
              }
            >
              {isRecording ? (
                <CircleStopIcon className="size-5" />
              ) : (
                <RadioIcon className="size-5" />
              )}
              {isRecording ? "Stop recording" : "Record"}
            </Button>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-700">
              Input
            </h2>
            <div className="mt-4 space-y-4">
              <label className="block text-xs font-semibold text-neutral-600">
                Device
                <select
                  value={selectedDevice?.deviceId ?? ""}
                  disabled={
                    !inputsInitialized ||
                    !hasAccess ||
                    refreshInputsMutation.isPending ||
                    grantAccessMutation.isPending ||
                    startInputMutation.isPending ||
                    isRecording ||
                    isProcessing
                  }
                  onChange={(event) =>
                    selectDevice(event.currentTarget.value || undefined)
                  }
                  className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
                >
                  {!inputsInitialized ? (
                    <option>Loading audio inputs...</option>
                  ) : !hasAccess ? (
                    <option>Grant access to list audio inputs</option>
                  ) : (
                    <>
                      {!selectedDevice && (
                        <option value="">Choose an audio input</option>
                      )}
                      {devices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Audio input ${index + 1}`}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <Button
                disabled={
                  !inputsInitialized ||
                  refreshInputsMutation.isPending ||
                  grantAccessMutation.isPending ||
                  startInputMutation.isPending ||
                  isRecording ||
                  isProcessing ||
                  (hasAccess && !selectedDevice)
                }
                onClick={() =>
                  hasAccess
                    ? selectedDevice &&
                      startInputMutation.mutate(selectedDevice.deviceId)
                    : grantAccessMutation.mutate()
                }
                className="h-10 w-full gap-2 border-neutral-300 bg-white text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
              >
                <Mic2Icon className="size-4" />
                {!inputsInitialized
                  ? "Loading..."
                  : grantAccessMutation.isPending
                    ? "Requesting access..."
                    : startInputMutation.isPending
                      ? "Connecting..."
                      : !hasAccess
                        ? "Grant access"
                        : inputActive
                          ? "Reconnect input"
                          : "Connect input"}
              </Button>
              {state.inputChannelCount > 1 && (
                <label className="block text-xs font-semibold text-neutral-600">
                  Captured channel
                  <select
                    value={state.selectedChannel}
                    onChange={(event) =>
                      recorderRuntime.selectChannel(
                        Number(event.currentTarget.value),
                      )
                    }
                    className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                  >
                    {Array.from(
                      { length: state.inputChannelCount },
                      (_, channel) => (
                        <option key={channel} value={channel}>
                          Channel {channel + 1}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-700">
              Capture diagnostics
            </h2>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
              <dt className="text-neutral-500">Observed channels</dt>
              <dd className="font-mono text-neutral-950">
                {state.inputChannelCount || "-"}
              </dd>
              <dt className="text-neutral-500">First context frame</dt>
              <dd className="font-mono text-neutral-950">
                {state.firstCapturedFrame ?? "-"}
              </dd>
              <dt className="text-neutral-500">Captured frames</dt>
              <dd className="font-mono text-neutral-950">
                {state.capturedFrames || "-"}
              </dd>
              <dt className="text-neutral-500">Discontinuity</dt>
              <dd className="font-mono text-neutral-950">
                {state.discontinuityFrames} frames
              </dd>
            </dl>
            <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-neutral-100 p-3 text-[10px] leading-relaxed text-neutral-600">
              {state.inputSettings
                ? JSON.stringify(state.inputSettings, undefined, 2)
                : "getSettings() appears after input permission."}
            </pre>
          </section>

          {error && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              {error.message}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining
    .toFixed(3)
    .padStart(6, "0")}`;
}
