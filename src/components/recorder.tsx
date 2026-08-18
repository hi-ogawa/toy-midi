import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CircleStopIcon,
  Mic2Icon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  RotateCcwIcon,
  UploadIcon,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { recorderRuntime } from "../lib/recorder/runtime";
import { routes } from "../lib/routes";
import { Button } from "./ui/button";

export function Recorder() {
  const state = useSyncExternalStore(
    recorderRuntime.subscribe,
    recorderRuntime.getSnapshot,
  );
  const devicesQuery = useQuery({
    queryKey: ["recorder-devices"],
    queryFn: async () => {
      await recorderRuntime.refreshDevices();
      return true;
    },
    staleTime: Infinity,
  });
  const inputMutation = useMutation({
    mutationFn: (deviceId?: string) =>
      deviceId
        ? recorderRuntime.selectInput(deviceId)
        : recorderRuntime.enablePreferredInput(),
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
    devicesQuery.error ??
    inputMutation.error ??
    backingMutation.error ??
    playMutation.error ??
    recordMutation.error;

  return (
    <main className="min-h-screen bg-[#11100e] text-stone-100">
      <header className="border-b border-amber-100/10 bg-[#171512] px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-amber-300 text-stone-950">
              <Mic2Icon className="size-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-semibold tracking-wide">
                Recorder
              </h1>
              <p className="text-xs text-stone-500">
                Native Web Audio timing spike
              </p>
            </div>
          </div>
          <a
            href={routes.home.href()}
            className="text-sm text-stone-500 transition-colors hover:text-amber-300"
          >
            Back to Toy MIDI
          </a>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-lg border border-amber-100/10 bg-[#191714]">
            <div className="flex items-center gap-3 border-b border-amber-100/10 px-5 py-4">
              <Button
                onClick={() => {
                  if (state.isPlaying) {
                    recorderRuntime.pause();
                  } else {
                    playMutation.mutate();
                  }
                }}
                className="size-11 border-amber-300/30 bg-amber-300 text-stone-950 hover:bg-amber-200"
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
                className="size-10 bg-stone-800 hover:bg-stone-700"
                title="Return to start"
              >
                <RotateCcwIcon className="size-4" />
              </Button>
              <div className="ml-2 font-mono text-lg tabular-nums text-amber-100">
                {formatTime(state.position)}
              </div>
              <div className="ml-auto text-xs uppercase tracking-[0.18em] text-stone-500">
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
                className="w-full accent-amber-300"
              />
              <div className="mt-2 flex justify-between font-mono text-[11px] text-stone-600">
                <span>00:00.000</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              Tracks
            </h2>
            <div className="grid grid-cols-[6rem_minmax(0,1fr)_8rem] items-center gap-4 rounded-lg border border-amber-100/10 bg-[#191714] px-5 py-4">
              <span className="font-mono text-xs text-amber-300">BACKING</span>
              <div className="min-w-0">
                <div className="truncate text-sm text-stone-200">
                  {state.backingName ?? "No backing track loaded"}
                </div>
                <div className="mt-1 text-xs text-stone-600">
                  {state.backingName
                    ? `${formatTime(state.backingDuration)} · click at 0:00`
                    : "WAV, MP3, or another browser-decodable audio file"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-md border border-stone-700 bg-stone-800 p-2 hover:bg-stone-700">
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
                      ? "size-9 border-amber-300 bg-amber-300 text-stone-950"
                      : "size-9 bg-stone-800 hover:bg-stone-700"
                  }
                  title="Mute backing"
                >
                  M
                </Button>
              </div>
              <div />
              <label className="flex items-center gap-3 text-xs text-stone-500">
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
                  className="w-full accent-amber-300"
                />
              </label>
              <span className="text-right font-mono text-xs text-stone-500">
                {Math.round(state.backingGain * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-[6rem_minmax(0,1fr)_8rem] items-center gap-4 rounded-lg border border-red-300/15 bg-[#1d1614] px-5 py-4">
              <span className="font-mono text-xs text-red-300">TAKE 01</span>
              <div>
                <div className="text-sm text-stone-200">
                  {state.hasTake ? "Recorded input" : "No take recorded"}
                </div>
                <div className="mt-1 text-xs text-stone-600">
                  {state.hasTake
                    ? `${formatTime(state.takeDuration)} · ${state.capturedFrames.toLocaleString()} frames`
                    : "Direct monitoring stays outside the browser"}
                </div>
              </div>
              <div />
              <div />
              <label className="flex items-center gap-3 text-xs text-stone-500">
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
                  className="w-28 rounded border border-stone-700 bg-stone-900 px-2 py-1 font-mono text-stone-200"
                />
                ms
              </label>
              <div />
            </div>
          </section>

          <section className="flex items-center justify-center rounded-lg border border-red-300/15 bg-red-950/10 py-7">
            <Button
              onClick={() =>
                isRecording
                  ? recorderRuntime.stopRecording()
                  : recordMutation.mutate()
              }
              disabled={state.status === "idle" || isProcessing}
              className={
                isRecording
                  ? "h-14 gap-3 border-red-300 bg-red-400 px-7 font-semibold text-red-950 hover:bg-red-300"
                  : "h-14 gap-3 border-red-400/50 bg-red-950/50 px-7 font-semibold text-red-200 hover:bg-red-900/60"
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
          <section className="rounded-lg border border-amber-100/10 bg-[#191714] p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              Input
            </h2>
            <div className="mt-4 space-y-4">
              <label className="block text-xs text-stone-500">
                Device
                <select
                  value={state.selectedDeviceId ?? ""}
                  onChange={(event) =>
                    inputMutation.mutate(event.currentTarget.value)
                  }
                  className="mt-1.5 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200"
                >
                  <option value="" disabled>
                    Select after enabling input
                  </option>
                  {state.devices.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Audio input ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                onClick={() => inputMutation.mutate(undefined)}
                className="h-10 w-full gap-2 bg-stone-800 text-sm hover:bg-stone-700"
              >
                <Mic2Icon className="size-4" />
                {state.status === "idle" ? "Enable input" : "Reopen input"}
              </Button>
              {state.inputChannelCount > 1 && (
                <label className="block text-xs text-stone-500">
                  Captured channel
                  <select
                    value={state.selectedChannel}
                    onChange={(event) =>
                      recorderRuntime.selectChannel(
                        Number(event.currentTarget.value),
                      )
                    }
                    className="mt-1.5 w-full rounded border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-200"
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

          <section className="rounded-lg border border-amber-100/10 bg-[#191714] p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              Capture diagnostics
            </h2>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
              <dt className="text-stone-500">Observed channels</dt>
              <dd className="font-mono text-stone-300">
                {state.inputChannelCount || "-"}
              </dd>
              <dt className="text-stone-500">First context frame</dt>
              <dd className="font-mono text-stone-300">
                {state.firstCapturedFrame ?? "-"}
              </dd>
              <dt className="text-stone-500">Captured frames</dt>
              <dd className="font-mono text-stone-300">
                {state.capturedFrames || "-"}
              </dd>
              <dt className="text-stone-500">Discontinuity</dt>
              <dd className="font-mono text-stone-300">
                {state.discontinuityFrames} frames
              </dd>
            </dl>
            <pre className="mt-4 max-h-64 overflow-auto rounded bg-stone-950 p-3 text-[10px] leading-relaxed text-stone-500">
              {state.inputSettings
                ? JSON.stringify(state.inputSettings, undefined, 2)
                : "getSettings() appears after input permission."}
            </pre>
          </section>

          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-950/30 p-4 text-sm text-red-200">
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
