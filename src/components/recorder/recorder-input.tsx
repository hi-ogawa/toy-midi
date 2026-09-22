import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { CircleHelpIcon, Mic2Icon } from "lucide-react";
import { useDraftInput } from "../../hooks/use-draft-input";
import type { AudioAnalyser } from "../../lib/audio-analyser";
import { measureLatency } from "../../lib/latency-checker/runtime";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { routes } from "../../lib/routes";
import { InputMeter } from "../input-meter";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../ui/utils";
import { InputDiagnostics } from "./recorder-input-diagnostics";

export function InputSetup({
  runtime,
  devices,
  error,
  hasAccess,
  inputActive,
  inputAnalyser,
  inputsInitialized,
  isRecording,
  isPlaying,
  measurement,
  selectedDevice,
  selectedChannel,
  inputChannelCount,
  latencyCompensation,
  inputTogglePending,
  mutationPending,
  onDeviceChange,
  onInputToggle,
  onChannelChange,
  onLatencyCompensationChange,
}: {
  runtime: RecorderRuntime;
  devices: MediaDeviceInfo[];
  error?: Error | null;
  hasAccess: boolean;
  inputActive: boolean;
  inputAnalyser?: AudioAnalyser;
  inputsInitialized: boolean;
  isRecording: boolean;
  isPlaying: boolean;
  measurement: UseMutationResult<number, Error, void>;
  selectedDevice?: MediaDeviceInfo;
  selectedChannel: number;
  inputChannelCount: number;
  latencyCompensation: number;
  inputTogglePending: boolean;
  mutationPending: boolean;
  onDeviceChange: (deviceId?: string) => void;
  onInputToggle: () => void;
  onChannelChange: (channel: number) => void;
  onLatencyCompensationChange: (compensation: number) => void;
}) {
  const disabled = mutationPending || isRecording || measurement.isPending;
  const latencyInput = useDraftInput({
    value: latencyCompensation * 1000,
    onCommit: (milliseconds) =>
      onLatencyCompensationChange(milliseconds / 1000),
    min: 0,
    parse: "float",
  });
  const inputClass =
    "mt-1 h-8 w-full rounded border border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-100 disabled:text-neutral-500";
  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="space-y-4">
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
        <label className="block text-[11px] font-medium text-neutral-400">
          Channel
          <select
            value={inputChannelCount > 0 ? selectedChannel : ""}
            disabled={disabled || inputChannelCount === 0}
            onChange={(event) =>
              onChannelChange(Number(event.currentTarget.value))
            }
            className={inputClass}
          >
            {inputChannelCount === 0 ? (
              <option value="">Enable input to detect channels</option>
            ) : (
              Array.from({ length: inputChannelCount }, (_, channel) => (
                <option key={channel} value={channel}>
                  Channel {channel + 1}
                </option>
              ))
            )}
          </select>
        </label>
        <Button
          disabled={
            disabled || !inputsInitialized || (hasAccess && !selectedDevice)
          }
          onClick={onInputToggle}
          className={cn(
            "h-8 w-full justify-start gap-2 px-2 text-xs",
            inputsInitialized && !hasAccess
              ? "border-neutral-600 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20"
              : "border-neutral-600 bg-neutral-900 text-neutral-200 hover:bg-neutral-700",
          )}
        >
          <Mic2Icon className="size-3.5" />
          {inputTogglePending
            ? "Loading..."
            : !inputsInitialized
              ? "Enable input"
              : hasAccess
                ? inputActive
                  ? "Disable input"
                  : "Enable input"
                : "Grant microphone access"}
        </Button>
        <label className="block text-[11px] font-medium text-neutral-400">
          Level
          <div className="mt-2">
            <InputMeter active={inputActive} analyser={inputAnalyser} />
          </div>
        </label>
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
              type="text"
              disabled={measurement.isPending}
              inputMode="decimal"
              {...latencyInput.props}
              className="h-8 min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 font-mono text-xs text-neutral-100"
            />
            <span>ms</span>
          </div>
        </label>
        <div className="space-y-2">
          <Button
            className="h-8 w-full border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-200 hover:bg-neutral-700"
            disabled={disabled || !inputActive || isPlaying}
            onClick={() => measurement.mutate()}
          >
            {measurement.isPending ? "Measuring…" : "Measure latency"}
          </Button>
          <p className="text-[11px] leading-4 text-neutral-400">
            Connect your audio output back to the selected input. Plays seven
            quiet clicks and fills compensation automatically. Input monitoring
            is muted during measurement.
          </p>
          {isPlaying && (
            <p className="text-[11px] text-neutral-400">
              Stop playback to measure.
            </p>
          )}
          {measurement.isSuccess && (
            <p role="status" className="text-xs text-emerald-400">
              Compensation set to {(measurement.data * 1000).toFixed(3)} ms.
            </p>
          )}
          {measurement.error && (
            <p role="alert" className="text-xs text-orange-200">
              {measurement.error.message}
            </p>
          )}
        </div>
      </div>

      <InputDiagnostics runtime={runtime} />

      {error && (
        <div className="mt-4 border border-orange-700/60 bg-orange-950/40 p-3 text-xs text-orange-200">
          {error.message}
        </div>
      )}
    </div>
  );
}

export function useInputLatencyMeasurement({
  runtime,
  onMeasured,
}: {
  runtime: RecorderRuntime;
  onMeasured: (seconds: number) => void;
}) {
  return useMutation({
    mutationFn: async () => {
      const state = runtime.store.get();
      if (state.isPlaying || state.captureStatus !== "ready") {
        throw new Error(
          "Enable input and stop playback before measuring latency.",
        );
      }
      const input = runtime.captureInput;
      runtime.setInputMonitoring(false);
      try {
        const result = await measureLatency(runtime, { outputLevel: -24 });
        if (runtime.captureInput !== input) {
          throw new Error(
            "The input changed. Measure again with the selected input.",
          );
        }
        const measurements = result.analysis.measurements;
        // Use the standalone checker's weak-correlation threshold before applying a result.
        if (
          measurements.some(
            ({ score }) => !Number.isFinite(score) || score < 0.25,
          )
        ) {
          throw new Error(
            "Could not detect the loopback clicks reliably. Check the connection and input level, then try again.",
          );
        }
        const offsets = measurements
          .map(({ offsetSamples }) => offsetSamples)
          .sort((a, b) => a - b);
        const middle = Math.floor(offsets.length / 2);
        const median =
          offsets.length % 2
            ? offsets[middle]
            : (offsets[middle - 1] + offsets[middle]) / 2;
        const compensation = median / result.sampleRate;
        if (!Number.isFinite(compensation) || compensation < 0) {
          throw new Error(
            "The measured offset is invalid. Check the loopback connection and try again.",
          );
        }
        onMeasured(compensation);
        return compensation;
      } finally {
        if (runtime.captureInput === input) {
          runtime.setInputMonitoring(state.inputMonitoring);
        }
      }
    },
  });
}
