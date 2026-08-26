import { CircleHelpIcon, Mic2Icon } from "lucide-react";
import { useDraftInput } from "../../hooks/use-draft-input";
import type { AudioAnalyser } from "../../lib/audio-analyser";
import { routes } from "../../lib/routes";
import { InputMeter } from "../input-meter";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export function InputSetup({
  devices,
  error,
  hasAccess,
  inputActive,
  inputAnalyser,
  inputsInitialized,
  isProcessing,
  isRecording,
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
  devices: MediaDeviceInfo[];
  error?: Error | null;
  hasAccess: boolean;
  inputActive: boolean;
  inputAnalyser?: AudioAnalyser;
  inputsInitialized: boolean;
  isProcessing: boolean;
  isRecording: boolean;
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
  const disabled = mutationPending || isRecording || isProcessing;
  const latencyInput = useDraftInput({
    value: latencyCompensation * 1000,
    onCommit: (milliseconds) =>
      onLatencyCompensationChange(milliseconds / 1000),
    min: 0,
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
          className="h-8 w-full justify-start gap-2 border-neutral-600 bg-neutral-900 px-2 text-xs text-neutral-200 hover:bg-neutral-700"
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
                : "Grant access"}
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
              inputMode="numeric"
              {...latencyInput.props}
              className="h-8 min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 font-mono text-xs text-neutral-100"
            />
            <span>ms</span>
          </div>
        </label>
      </div>

      {error && (
        <div className="mt-4 border border-orange-700/60 bg-orange-950/40 p-3 text-xs text-orange-200">
          {error.message}
        </div>
      )}
    </div>
  );
}
