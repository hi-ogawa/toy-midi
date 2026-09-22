import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { CheckIcon, Mic2Icon, TriangleAlertIcon } from "lucide-react";
import { useDraftInput } from "../../hooks/use-draft-input";
import type { AudioAnalyser } from "../../lib/audio-analyser";
import { measureLatency } from "../../lib/latency-checker/runtime";
import type { RecorderRuntime } from "../../lib/recorder/runtime";
import { routes } from "../../lib/routes";
import { InputMeter } from "../input-meter";
import { Button } from "../ui/button";
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
  const measurement = useMutation({
    mutationFn: () => measureInputLatency({ runtime }),
    onSuccess: onLatencyCompensationChange,
  });
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
        <section
          className="space-y-3 border-t border-neutral-700 pt-4"
          aria-label="Recording latency compensation"
        >
          <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-400">
            <span className="flex-1">Recording latency compensation</span>
            <input
              type="text"
              disabled={disabled || !inputActive}
              inputMode="decimal"
              {...latencyInput.props}
              className="h-8 w-24 rounded border border-neutral-600 bg-neutral-900 px-2 font-mono text-xs text-neutral-100"
            />
            <span>ms</span>
          </label>
          <InputLatencyMeasurement
            measurement={measurement}
            disabled={disabled}
            inputActive={inputActive}
            isPlaying={isPlaying}
            isRecording={isRecording}
            latencyCompensation={latencyCompensation}
          />
        </section>
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

function InputLatencyMeasurement({
  measurement,
  disabled,
  inputActive,
  isPlaying,
  isRecording,
  latencyCompensation,
}: {
  measurement: UseMutationResult<number, Error, void>;
  disabled: boolean;
  inputActive: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  latencyCompensation: number;
}) {
  return (
    <details className="text-xs text-neutral-400">
      <summary className="cursor-pointer">How do I set this?</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-5 text-neutral-400">
          Recording latency compensation corrects audio delay so your recordings
          land where you played them on the timeline. To set it automatically,
          first connect your audio output back to the selected input with a
          cable. Then press <strong>Measure latency</strong> to measure the
          return delay using a few seconds of clicks. Alternatively, you can use
          the{" "}
          <a
            href={routes.latencyChecker.href()}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-neutral-200"
          >
            checker page
          </a>{" "}
          for details.
        </p>
        <Button
          className="h-8 w-full border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-200 hover:bg-neutral-700"
          disabled={disabled || !inputActive || isPlaying}
          onClick={() => measurement.mutate()}
        >
          {measurement.isPending ? "Measuring…" : "Measure latency"}
        </Button>
        <div className="space-y-2 text-xs leading-5">
          {measurement.isPending ? (
            <p role="status" className="text-neutral-400">
              Playing seven clicks with input monitoring muted.
            </p>
          ) : measurement.error ? (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-orange-200"
            >
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {measurement.error.message}
            </p>
          ) : measurement.isSuccess &&
            measurement.data === latencyCompensation ? (
            <p
              role="status"
              className="flex items-start gap-1.5 text-emerald-400"
            >
              <CheckIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              Compensation updated.
            </p>
          ) : undefined}
          {!measurement.isPending &&
            (!inputActive || isPlaying || isRecording) && (
              <p className="mt-1 flex items-start gap-1.5 text-neutral-400">
                <TriangleAlertIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                {!inputActive
                  ? "Enable input to measure."
                  : "Stop playback and recording to measure."}
              </p>
            )}
        </div>
      </div>
    </details>
  );
}

async function measureInputLatency({ runtime }: { runtime: RecorderRuntime }) {
  const state = runtime.store.get();
  if (state.isPlaying || state.captureStatus !== "ready") {
    throw new Error("Enable input and stop playback before measuring latency.");
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
      measurements.some(({ score }) => !Number.isFinite(score) || score < 0.25)
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
    return compensation;
  } finally {
    if (runtime.captureInput === input) {
      runtime.setInputMonitoring(state.inputMonitoring);
    }
  }
}
