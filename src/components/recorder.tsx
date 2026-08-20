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
import { gainToDb } from "../lib/music";
import {
  getCaptureInputs,
  requestCaptureAccess,
} from "../lib/recorder/capture-input";
import { RecorderRuntime } from "../lib/recorder/runtime";
import { routes } from "../lib/routes";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function Recorder() {
  const [runtime] = useState(() => new RecorderRuntime());
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.getSnapshot,
  );
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>();
  const [inputPeak, setInputPeak] = useState(0);

  async function refreshInputs() {
    const nextDevices = await getCaptureInputs();
    setDevices(nextDevices);
    selectDevice(
      nextDevices.some((device) => device.deviceId === deviceId)
        ? deviceId
        : nextDevices[0]?.deviceId,
    );
  }

  const grantAccessMutation = useMutation({
    mutationFn: async () => {
      await requestCaptureAccess();
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
    mutationFn: (deviceId: string) =>
      runtime.startInput({ deviceId, onLevel: setInputPeak }),
  });
  const backingMutation = useMutation({
    mutationFn: (file: File) => runtime.setAudioTrack(0, file),
  });
  const playMutation = useMutation({
    mutationFn: () => runtime.play(),
  });
  const recordMutation = useMutation({
    mutationFn: (action: "start" | "stop") =>
      action === "start" ? runtime.startRecording() : runtime.stopRecording(),
  });

  const backingTrack = state.audioTracks[0];
  const duration = Math.max(
    1,
    ...state.audioTracks.map((track) => track.timelineOffset + track.duration),
    state.getTakeOffset() + state.takeDuration,
  );
  const isRecording = state.status === "recording";
  const isProcessing = state.status === "processing";
  const statusLabel = {
    idle: "INPUT OFF",
    ready: "READY",
    recording: "REC",
    processing: "FINALIZING",
  }[state.status];

  const error =
    grantAccessMutation.error ??
    refreshInputsMutation.error ??
    startInputMutation.error ??
    backingMutation.error ??
    playMutation.error ??
    recordMutation.error;

  function selectDevice(nextDeviceId?: string) {
    if (nextDeviceId !== deviceId && inputActive) {
      stopInput();
    }
    setDeviceId(nextDeviceId);
  }

  function stopInput() {
    runtime.stopInput();
    setInputPeak(0);
    startInputMutation.reset();
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
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-700">
              Tracks
            </h2>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)_10rem] items-center gap-4 rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm">
              <span className="font-mono text-xs font-semibold text-emerald-700">
                BACKING
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm text-neutral-950">
                  {backingTrack?.name ?? "Empty"}
                </div>
                {backingTrack?.name && (
                  <div className="mt-1 font-mono text-xs text-neutral-500">
                    {formatTime(backingTrack.duration)}
                  </div>
                )}
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
                    runtime.setAudioTrackMix(0, {
                      muted: !backingTrack?.muted,
                    })
                  }
                  className={
                    backingTrack?.muted
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
                  value={backingTrack?.gain ?? 1}
                  onChange={(event) =>
                    runtime.setAudioTrackMix(0, {
                      gain: event.currentTarget.valueAsNumber,
                    })
                  }
                  className="w-full accent-emerald-700"
                />
              </label>
              <span className="text-right font-mono text-xs text-neutral-600">
                {Math.round((backingTrack?.gain ?? 1) * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-[6rem_minmax(0,1fr)_10rem] items-center gap-4 rounded-lg border border-neutral-200 bg-white px-5 py-4 shadow-sm">
              <span className="font-mono text-xs font-semibold text-neutral-700">
                TAKE 1
              </span>
              <div>
                <div className="text-sm text-neutral-950">
                  {state.hasTake ? "Recorded input" : "Empty"}
                </div>
                {state.hasTake && (
                  <div className="mt-1 font-mono text-xs text-neutral-500">
                    {formatTime(state.takeDuration)}
                  </div>
                )}
              </div>
              <div />
              <div />
              <div className="flex items-center gap-3 text-xs font-semibold text-neutral-600">
                <label htmlFor="latency-compensation">
                  Latency compensation
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="latency-compensation"
                    type="number"
                    min={0}
                    step={0.1}
                    value={(state.latencyCompensation * 1000).toFixed(1)}
                    onChange={(event) => {
                      const compensation =
                        event.currentTarget.valueAsNumber / 1000;
                      if (Number.isFinite(compensation)) {
                        const wasPlaying = state.isPlaying;
                        if (wasPlaying) {
                          runtime.pause();
                        }
                        runtime.setLatencyCompensation(
                          Math.max(0, compensation),
                        );
                        if (wasPlaying) {
                          playMutation.mutate();
                        }
                      }
                    }}
                    className="w-24 rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-neutral-950"
                  />
                  <span>ms</span>
                  <a
                    href={routes.latencyChecker.href()}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 hover:text-emerald-800 hover:underline"
                  >
                    Measure
                  </a>
                </div>
              </div>
              <div />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-700">
              Transport
            </h2>
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_16px_45px_rgb(34_48_41/0.08)]">
              <div className="flex items-center gap-3 border-b border-neutral-200 px-5 py-4">
                <Button
                  onClick={() => {
                    if (state.isPlaying) {
                      runtime.pause();
                    } else {
                      playMutation.mutate();
                    }
                  }}
                  disabled={isRecording || isProcessing}
                  className="size-11 border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  {state.isPlaying ? (
                    <PauseIcon className="size-5" />
                  ) : (
                    <PlayIcon className="size-5" />
                  )}
                </Button>
                <Button
                  onClick={() => {
                    runtime.pause();
                    runtime.seek(0);
                  }}
                  disabled={isRecording || isProcessing}
                  className="size-10 border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
                  title="Return to start"
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
                <div className="ml-2 font-mono text-lg tabular-nums text-neutral-950">
                  {formatTime(state.position)}
                </div>
                <div className="ml-auto flex items-center gap-4">
                  <span className="text-xs font-semibold tracking-[0.12em] text-neutral-500">
                    {statusLabel}
                  </span>
                  <Button
                    onClick={() =>
                      recordMutation.mutate(isRecording ? "stop" : "start")
                    }
                    disabled={state.status === "idle" || isProcessing}
                    className={
                      isRecording
                        ? "h-10 gap-2 border-red-300 bg-red-50 px-4 font-semibold text-red-800 hover:bg-red-100"
                        : "h-10 gap-2 border-red-700 bg-red-700 px-4 font-semibold text-white hover:bg-red-800"
                    }
                  >
                    {isRecording ? (
                      <CircleStopIcon className="size-4" />
                    ) : (
                      <RadioIcon className="size-4" />
                    )}
                    {isRecording ? "Stop" : "Record"}
                  </Button>
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
                    runtime.seek(event.currentTarget.valueAsNumber)
                  }
                  disabled={isRecording || isProcessing}
                  className="w-full accent-emerald-700"
                />
                <div className="mt-2 flex justify-between font-mono text-[11px] text-neutral-500">
                  <span>00:00.000</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-700">
              Input
            </h2>
            <div className="mt-4 space-y-4">
              <label className="block text-xs font-semibold text-neutral-600">
                Input device
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
                    <option>Grant microphone access</option>
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
                onClick={() => {
                  if (!hasAccess) {
                    grantAccessMutation.mutate();
                  } else if (inputActive) {
                    stopInput();
                  } else if (selectedDevice) {
                    setInputPeak(0);
                    startInputMutation.mutate(selectedDevice.deviceId);
                  }
                }}
                className="h-10 w-full gap-2 border-neutral-300 bg-white text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
              >
                <Mic2Icon className="size-4" />
                {!inputsInitialized
                  ? "Loading..."
                  : grantAccessMutation.isPending
                    ? "Requesting access..."
                    : startInputMutation.isPending
                      ? "Enabling..."
                      : !hasAccess
                        ? "Grant access"
                        : inputActive
                          ? "Disable input"
                          : "Enable input"}
              </Button>
              {state.inputChannelCount > 1 && (
                <label className="block text-xs font-semibold text-neutral-600">
                  Channel
                  <select
                    value={state.selectedChannel}
                    onChange={(event) => {
                      setInputPeak(0);
                      runtime.selectChannel(Number(event.currentTarget.value));
                    }}
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
              <label className="grid gap-2 text-xs font-semibold text-neutral-600">
                Input meter
                <InputMeter active={inputActive} peak={inputPeak} />
              </label>
            </div>
          </section>

          <details className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-neutral-700">
              Diagnostics
            </summary>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
              <dt className="text-neutral-500">Observed channels</dt>
              <dd className="font-mono text-neutral-950">
                {state.inputChannelCount || "-"}
              </dd>
            </dl>
            <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-neutral-100 p-3 text-[10px] leading-relaxed text-neutral-600">
              {state.inputSettings
                ? JSON.stringify(state.inputSettings, undefined, 2)
                : "getSettings() appears after input permission."}
            </pre>
          </details>

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

// TODO: Unify this with the Latency Checker input meter.
function InputMeter({ active, peak }: { active: boolean; peak: number }) {
  const meterMin = -60;
  const meterMax = 6;
  const getMeterPosition = (value: number) =>
    ((value - meterMin) / (meterMax - meterMin)) * 100;
  const zeroPosition = getMeterPosition(0);

  const decibels = gainToDb(peak);
  const meterValue = clamp(decibels, meterMin, meterMax);
  const levelPosition = active ? getMeterPosition(meterValue) : 0;
  const label = active ? `${decibels.toFixed(1)} dBFS` : "-∞ dBFS";

  return (
    <div className="grid grid-cols-[1fr_76px] items-center gap-3">
      <div
        role="meter"
        aria-label="Input peak level"
        aria-valuemin={meterMin}
        aria-valuemax={meterMax}
        aria-valuenow={active ? meterValue : meterMin}
        aria-valuetext={label}
        className="relative h-3 overflow-hidden rounded-full bg-neutral-200"
      >
        <div
          className="absolute inset-y-0 right-0 bg-red-100"
          style={{ width: `${100 - zeroPosition}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-emerald-600 transition-[width] duration-75"
          style={{ width: `${Math.min(levelPosition, zeroPosition)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-red-600 transition-[width] duration-75"
          style={{
            left: `${zeroPosition}%`,
            width: `${Math.max(0, levelPosition - zeroPosition)}%`,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-red-700"
          style={{ left: `${zeroPosition}%` }}
        />
      </div>
      <output className="text-right font-mono text-xs tabular-nums text-neutral-600">
        {label}
      </output>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
