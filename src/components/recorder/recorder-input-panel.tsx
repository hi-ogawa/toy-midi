import {
  AudioWaveformIcon,
  MicIcon,
  PowerIcon,
  Settings2Icon,
} from "lucide-react";
import type { AudioAnalyser } from "../../lib/audio-analyser";
import { InputMeter } from "../input-meter";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";
import { RecorderPanel } from "./recorder-panel";

/** Session input controls. Per-device configuration stays in Input Setup. */
export function RecorderInputPanel({
  route,
  routeNeedsSetup,
  accessRequired,
  inputActive,
  inputAnalyser,
  toggleDisabled,
  togglePending,
  tunerOpen,
  onInputSetup,
  onInputToggle,
  onTunerToggle,
  onClose,
}: {
  route: string;
  routeNeedsSetup: boolean;
  accessRequired: boolean;
  inputActive: boolean;
  inputAnalyser?: AudioAnalyser;
  toggleDisabled: boolean;
  togglePending: boolean;
  tunerOpen: boolean;
  onInputSetup: () => void;
  onInputToggle: () => void;
  onTunerToggle: () => void;
  onClose: () => void;
}) {
  return (
    <RecorderPanel
      title="Audio Input"
      closeLabel="Close Audio Input"
      onClose={onClose}
      data-testid="recorder-input-panel"
      className="pointer-events-auto w-64 shrink-0"
      contentClassName="space-y-2.5 px-3 py-3 text-xs"
    >
      {accessRequired ? (
        // One-time permission opens the same setup dialog the route row does,
        // so users learn where configuration lives.
        <button
          type="button"
          onClick={onInputSetup}
          className="flex w-full items-center gap-2 rounded border border-orange-300/40 bg-orange-300/10 px-2 py-1.5 text-left text-orange-200 hover:bg-orange-300/20"
        >
          <MicIcon className="size-3.5 shrink-0" />
          <span className="truncate">Allow microphone access…</span>
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Audio input setup"
            onClick={onInputSetup}
            className={cn(
              "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded border border-neutral-600 bg-neutral-900 px-2 text-left hover:bg-neutral-800",
              routeNeedsSetup ? "text-orange-300" : "text-neutral-300",
            )}
          >
            <span className="truncate">{route}</span>
            <Settings2Icon className="ml-auto size-3.5 shrink-0 text-neutral-400" />
          </button>
          <Button
            aria-label={inputActive ? "Turn input off" : "Turn input on"}
            aria-pressed={inputActive}
            title={inputActive ? "Turn input off" : "Turn input on"}
            disabled={toggleDisabled}
            onClick={onInputToggle}
            className={cn(
              "size-7 shrink-0 border-neutral-600",
              inputActive
                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                : "text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200",
              togglePending && "animate-pulse",
            )}
          >
            <PowerIcon className="size-3.5" />
          </Button>
        </div>
      )}
      <InputMeter active={inputActive} analyser={inputAnalyser} compact />
      <Button
        aria-pressed={tunerOpen}
        onClick={onTunerToggle}
        className={cn(
          "h-7 w-full gap-1.5 border-neutral-600 px-2 text-xs",
          tunerOpen
            ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-700"
            : "text-neutral-300 hover:bg-neutral-700",
        )}
      >
        <AudioWaveformIcon className="size-3.5" />
        Tuner
      </Button>
    </RecorderPanel>
  );
}
