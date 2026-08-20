import { useMutation } from "@tanstack/react-query";
import {
  CircleHelpIcon,
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
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function Recorder() {
  const [runtime] = useState(() => new RecorderRuntime());
  const state = useSyncExternalStore(
    runtime.store.subscribe,
    runtime.store.get,
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
  const refreshInputsMutation = useMutation({ mutationFn: refreshInputs });
  const startInputMutation = useMutation({
    mutationFn: (nextDeviceId: string) =>
      runtime.startInput({ deviceId: nextDeviceId, onLevel: setInputPeak }),
  });
  const backingMutation = useMutation({
    mutationFn: (file: File) => runtime.setAudioTrack(0, file),
  });
  const playMutation = useMutation({ mutationFn: () => runtime.play() });
  const recordMutation = useMutation({
    mutationFn: (action: "start" | "stop") =>
      action === "start" ? runtime.startRecording() : runtime.stopRecording(),
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
  const backingTrack = state.audioTracks[0];
  const take = state.recordingTrack.takes[0];
  const duration = Math.max(
    1,
    ...state.audioTracks.map((track) => track.timelineOffset + track.duration),
    state.getTakeOffset() + (take?.duration ?? 0),
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
    <main className="flex h-screen flex-col overflow-hidden bg-neutral-900 text-neutral-100">
      <RecorderHeader />
      <RecorderTransport
        isPlaying={state.isPlaying}
        isProcessing={isProcessing}
        isRecording={isRecording}
        position={state.position}
        recordDisabled={state.status === "idle"}
        onPlay={() => playMutation.mutate()}
        onPause={() => runtime.pause()}
        onRecord={() => recordMutation.mutate(isRecording ? "stop" : "start")}
        onReset={() => {
          runtime.pause();
          runtime.seek(0);
        }}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(44rem,1fr)_18rem]">
        <section className="min-w-0 overflow-auto border-r border-neutral-700">
          <TimelineHeader duration={duration} />
          <TrackRow
            title="Audio 1"
            subtitle={backingTrack?.name ?? "No file loaded"}
            gain={backingTrack?.gain ?? 1}
            muted={backingTrack?.muted ?? false}
            soloed={backingTrack?.soloed ?? false}
            onGainChange={(gain) => runtime.setAudioTrackMix(0, { gain })}
            onMutedChange={(muted) => runtime.setAudioTrackMix(0, { muted })}
            onSoloedChange={(soloed) => runtime.setAudioTrackMix(0, { soloed })}
            action={
              <label
                title="Load audio track"
                className="grid size-7 cursor-pointer place-items-center rounded border border-neutral-600 text-neutral-300 hover:bg-neutral-700"
              >
                <UploadIcon className="size-3.5" />
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
            }
          >
            <TimelineLane
              clip={
                backingTrack?.name
                  ? {
                      duration: backingTrack.duration,
                      label: backingTrack.name,
                      offset: backingTrack.timelineOffset,
                      variant: "audio",
                    }
                  : undefined
              }
              duration={duration}
              emptyLabel="Load an audio file"
              position={state.position}
              onSeek={(position) => runtime.seek(position)}
            />
          </TrackRow>

          <TrackRow
            title="Capture"
            subtitle={
              isRecording
                ? `Recording · ${formatTime(
                    Math.max(0, state.position - state.getTakeOffset()),
                  )}`
                : take
                  ? `Take 1 · ${formatTime(take.duration)}`
                  : "No take"
            }
            gain={state.recordingTrack.gain}
            muted={state.recordingTrack.muted}
            soloed={state.recordingTrack.soloed}
            onGainChange={(gain) => runtime.setRecordingTrackMix({ gain })}
            onMutedChange={(muted) => runtime.setRecordingTrackMix({ muted })}
            onSoloedChange={(soloed) =>
              runtime.setRecordingTrackMix({ soloed })
            }
          >
            <TimelineLane
              clip={
                take
                  ? {
                      duration: isRecording
                        ? Math.max(0, state.position - state.getTakeOffset())
                        : take.duration,
                      label: isRecording
                        ? "Recording..."
                        : isProcessing
                          ? "Finalizing..."
                          : "Take 1",
                      offset: state.getTakeOffset(),
                      variant: isRecording ? "recording" : "take",
                    }
                  : undefined
              }
              duration={duration}
              emptyLabel="Enable input, place the playhead, then record"
              position={state.position}
              onSeek={(position) => runtime.seek(position)}
            />
          </TrackRow>
        </section>

        <InputInspector
          devices={devices}
          error={error}
          hasAccess={hasAccess}
          inputActive={inputActive}
          inputPeak={inputPeak}
          inputsInitialized={inputsInitialized}
          isProcessing={isProcessing}
          isRecording={isRecording}
          selectedDevice={selectedDevice}
          selectedChannel={state.selectedChannel}
          inputChannelCount={state.inputChannelCount}
          latencyCompensation={state.latencyCompensation}
          mutationPending={
            refreshInputsMutation.isPending ||
            grantAccessMutation.isPending ||
            startInputMutation.isPending
          }
          onDeviceChange={selectDevice}
          onInputToggle={() => {
            if (!hasAccess) {
              grantAccessMutation.mutate();
            } else if (inputActive) {
              stopInput();
            } else if (selectedDevice) {
              setInputPeak(0);
              startInputMutation.mutate(selectedDevice.deviceId);
            }
          }}
          onChannelChange={(channel) => {
            setInputPeak(0);
            runtime.selectChannel(channel);
          }}
          onLatencyCompensationChange={(compensation) => {
            const wasPlaying = state.isPlaying;
            if (wasPlaying) {
              runtime.pause();
            }
            runtime.setLatencyCompensation(compensation);
            if (wasPlaying) {
              playMutation.mutate();
            }
          }}
        />
      </div>
    </main>
  );
}

function RecorderHeader() {
  return (
    <header className="flex h-[42px] shrink-0 items-center border-b border-neutral-700 bg-neutral-800 px-4">
      <Mic2Icon className="mr-2 size-4 text-emerald-400" />
      <span className="text-sm font-medium">Recorder</span>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            title="More"
            aria-label="More"
            className="size-8 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
          >
            <MoreVerticalIcon className="size-4" />
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
  );
}

function RecorderTransport({
  isPlaying,
  isProcessing,
  isRecording,
  position,
  recordDisabled,
  onPlay,
  onPause,
  onRecord,
  onReset,
}: {
  isPlaying: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  position: number;
  recordDisabled: boolean;
  onPlay: () => void;
  onPause: () => void;
  onRecord: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex h-[53px] shrink-0 items-center gap-2 border-b border-neutral-700 bg-neutral-800 px-4 shadow-sm">
      <Button
        onClick={onReset}
        disabled={isRecording || isProcessing}
        className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        title="Return to start"
      >
        <RotateCcwIcon className="size-4" />
      </Button>
      <Button
        onClick={isPlaying ? onPause : onPlay}
        disabled={isRecording || isProcessing}
        className="size-9 hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <PauseIcon className="size-5" />
        ) : (
          <PlayIcon className="size-5" />
        )}
      </Button>
      <Button
        onClick={onRecord}
        disabled={recordDisabled || isProcessing}
        className={
          isRecording
            ? "h-9 gap-1.5 border-red-400 bg-neutral-100 px-3 text-red-700 hover:bg-white"
            : "size-9 text-red-400 hover:bg-accent hover:text-red-300 dark:hover:bg-accent/50"
        }
        title={isRecording ? "Stop recording" : "Record"}
      >
        {isRecording ? (
          <>
            <CircleStopIcon className="size-4" />
            Stop
          </>
        ) : (
          <RadioIcon className="size-5" />
        )}
      </Button>
      <div className="mx-1 h-5 w-px bg-neutral-600" />
      <output className="font-mono text-sm tabular-nums text-neutral-100">
        {formatTime(position)}
      </output>
    </div>
  );
}

function TimelineHeader({ duration }: { duration: number }) {
  return (
    <div className="sticky top-0 z-10 grid h-10 grid-cols-[13.5rem_minmax(30rem,1fr)] border-b border-neutral-700 bg-neutral-800">
      <div className="flex items-center border-r border-neutral-700 px-3 text-xs font-semibold">
        Tracks
      </div>
      <TimelineRuler duration={duration} />
    </div>
  );
}

function TimelineRuler({ duration }: { duration: number }) {
  return (
    <div className="grid grid-cols-5 items-end px-2 pb-1.5 font-mono text-[10px] text-neutral-400">
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index}>{formatRulerTime((duration * index) / 4)}</span>
      ))}
    </div>
  );
}

function TrackRow({
  title,
  subtitle,
  gain,
  muted,
  soloed,
  action,
  onGainChange,
  onMutedChange,
  onSoloedChange,
  children,
}: {
  title: string;
  subtitle: string;
  gain: number;
  muted: boolean;
  soloed: boolean;
  action?: React.ReactNode;
  onGainChange: (gain: number) => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  children: React.ReactNode;
}) {
  const toggleClass = (active: boolean) =>
    active
      ? "size-7 border-emerald-600 bg-emerald-700 text-white hover:bg-emerald-600"
      : "size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700";
  return (
    <div className="grid min-h-24 grid-cols-[13.5rem_minmax(30rem,1fr)] border-b border-neutral-700">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-r border-neutral-700 bg-neutral-800 p-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{title}</div>
          <div className="mt-0.5 truncate text-[11px] text-neutral-400">
            {subtitle}
          </div>
        </div>
        <div className="flex gap-1">
          {action}
          <Button
            onClick={() => onMutedChange(!muted)}
            className={toggleClass(muted)}
            title={muted ? `Unmute ${title}` : `Mute ${title}`}
          >
            M
          </Button>
          <Button
            onClick={() => onSoloedChange(!soloed)}
            className={toggleClass(soloed)}
            title={soloed ? `Disable ${title} solo` : `Solo ${title}`}
          >
            S
          </Button>
        </div>
        <label className="col-span-2 mt-auto grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 text-[10px] text-neutral-400">
          Gain
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={gain}
            onChange={(event) =>
              onGainChange(event.currentTarget.valueAsNumber)
            }
            className="w-full accent-emerald-600"
          />
          <span className="text-right font-mono">
            {Math.round(gain * 100)}%
          </span>
        </label>
      </div>
      {children}
    </div>
  );
}

function TimelineLane({
  clip,
  duration,
  emptyLabel,
  position,
  onSeek,
}: {
  clip?: {
    duration: number;
    label: string;
    offset: number;
    variant: "audio" | "take" | "recording";
  };
  duration: number;
  emptyLabel: string;
  position: number;
  onSeek: (position: number) => void;
}) {
  const clipClass = {
    audio: "border-blue-400/60 bg-blue-400/20 text-blue-100",
    take: "border-emerald-400/60 bg-emerald-400/20 text-emerald-100",
    recording: "border-red-400/70 bg-red-400/20 text-red-100",
  }[clip?.variant ?? "audio"];
  return (
    <div className="relative min-h-24 overflow-hidden bg-neutral-900 [background-image:linear-gradient(to_right,transparent_calc(100%_-_1px),rgb(64_64_64)_100%)] [background-size:25%_100%]">
      {clip ? (
        <div
          className={`absolute top-4 h-14 overflow-hidden rounded-sm border px-2 py-1.5 text-[11px] ${clipClass}`}
          style={{
            left: `${(clip.offset / duration) * 100}%`,
            width: `${Math.max(0.5, (clip.duration / duration) * 100)}%`,
          }}
        >
          <span className="truncate">{clip.label}</span>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-neutral-600">
          {emptyLabel}
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-px bg-red-500"
        style={{ left: `${Math.min(100, (position / duration) * 100)}%` }}
      />
      <input
        aria-label="Seek recorder timeline"
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={Math.min(position, duration)}
        onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
        className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

function InputInspector({
  devices,
  error,
  hasAccess,
  inputActive,
  inputPeak,
  inputsInitialized,
  isProcessing,
  isRecording,
  selectedDevice,
  selectedChannel,
  inputChannelCount,
  latencyCompensation,
  mutationPending,
  onDeviceChange,
  onInputToggle,
  onChannelChange,
  onLatencyCompensationChange,
}: {
  devices: MediaDeviceInfo[];
  error?: Error | null;
  hasAccess: boolean;
  inputActive: boolean;
  inputPeak: number;
  inputsInitialized: boolean;
  isProcessing: boolean;
  isRecording: boolean;
  selectedDevice?: MediaDeviceInfo;
  selectedChannel: number;
  inputChannelCount: number;
  latencyCompensation: number;
  mutationPending: boolean;
  onDeviceChange: (deviceId?: string) => void;
  onInputToggle: () => void;
  onChannelChange: (channel: number) => void;
  onLatencyCompensationChange: (compensation: number) => void;
}) {
  const disabled = mutationPending || isRecording || isProcessing;
  const inputClass =
    "mt-1 h-8 w-full rounded border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-100 disabled:text-neutral-500";
  return (
    <aside className="min-h-0 overflow-y-auto bg-neutral-800">
      <h2 className="flex h-10 items-center border-b border-neutral-700 px-3 text-xs font-semibold">
        Input
      </h2>
      <div className="space-y-4 border-b border-neutral-700 p-3">
        <label className="block text-[11px] font-medium text-neutral-400">
          Device
          <select
            value={selectedDevice?.deviceId ?? ""}
            disabled={disabled || !inputsInitialized || !hasAccess}
            onChange={(event) =>
              onDeviceChange(event.currentTarget.value || undefined)
            }
            className={inputClass}
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
        {inputChannelCount > 1 && (
          <label className="block text-[11px] font-medium text-neutral-400">
            Channel
            <select
              value={selectedChannel}
              disabled={disabled}
              onChange={(event) =>
                onChannelChange(Number(event.currentTarget.value))
              }
              className={inputClass}
            >
              {Array.from({ length: inputChannelCount }, (_, channel) => (
                <option key={channel} value={channel}>
                  Channel {channel + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          disabled={
            disabled || !inputsInitialized || (hasAccess && !selectedDevice)
          }
          onClick={onInputToggle}
          className="h-8 w-full justify-start gap-2 border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-200 hover:bg-neutral-700"
        >
          <Mic2Icon className="size-3.5" />
          {!inputsInitialized
            ? "Loading..."
            : !hasAccess
              ? "Grant access"
              : inputActive
                ? "Disable input"
                : "Enable input"}
        </Button>
      </div>

      <div className="space-y-4 border-b border-neutral-700 p-3">
        <h3 className="text-xs font-semibold">Level</h3>
        <InputMeter active={inputActive} peak={inputPeak} />
      </div>

      <div className="border-b border-neutral-700 p-3">
        <label className="block text-[11px] font-medium text-neutral-400">
          <span className="flex items-center gap-1.5">
            Latency compensation
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="About latency compensation"
                  className="text-neutral-500 hover:text-neutral-200"
                >
                  <CircleHelpIcon className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 space-y-2 p-3 text-xs"
              >
                <p>
                  Advances recorded audio to compensate for input and output
                  latency.
                </p>
                <a
                  href={routes.latencyChecker.href()}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  Open latency checker
                </a>
              </PopoverContent>
            </Popover>
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={0.1}
              value={(latencyCompensation * 1000).toFixed(1)}
              onChange={(event) => {
                const compensation = event.currentTarget.valueAsNumber / 1000;
                if (Number.isFinite(compensation)) {
                  onLatencyCompensationChange(Math.max(0, compensation));
                }
              }}
              className="h-8 min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 font-mono text-xs text-neutral-100"
            />
            <span>ms</span>
          </div>
        </label>
      </div>

      {error && (
        <div className="m-3 border border-orange-700/60 bg-orange-950/40 p-3 text-xs text-orange-200">
          {error.message}
        </div>
      )}
    </aside>
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

function formatRulerTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
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
    <div className="grid grid-cols-[1fr_4.5rem] items-center gap-2">
      <div
        role="meter"
        aria-label="Input peak level"
        aria-valuemin={meterMin}
        aria-valuemax={meterMax}
        aria-valuenow={active ? meterValue : meterMin}
        aria-valuetext={label}
        className="relative h-2 overflow-hidden bg-neutral-700"
      >
        <div
          className="absolute inset-y-0 right-0 bg-red-950"
          style={{ width: `${100 - zeroPosition}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-75"
          style={{ width: `${Math.min(levelPosition, zeroPosition)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-red-500 transition-[width] duration-75"
          style={{
            left: `${zeroPosition}%`,
            width: `${Math.max(0, levelPosition - zeroPosition)}%`,
          }}
        />
      </div>
      <output className="text-right font-mono text-[10px] tabular-nums text-neutral-400">
        {label}
      </output>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
