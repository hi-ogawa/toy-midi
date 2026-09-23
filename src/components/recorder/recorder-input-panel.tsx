import { AudioWaveformIcon, Settings2Icon } from "lucide-react";
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
      title="Input"
      closeLabel="Close Input"
      onClose={onClose}
      data-testid="recorder-input-panel"
      className="pointer-events-auto w-64 shrink-0"
      contentClassName="space-y-2.5 px-3 py-3 text-xs"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Audio input setup"
          onClick={onInputSetup}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left hover:bg-neutral-700",
            routeNeedsSetup ? "text-orange-300" : "text-neutral-300",
          )}
        >
          <span className="truncate">{route}</span>
          <Settings2Icon className="size-3.5 shrink-0 text-neutral-500" />
        </button>
        {/* Before access, the route message itself leads to setup. */}
        {!accessRequired && (
          <Button
            aria-pressed={inputActive}
            disabled={toggleDisabled}
            onClick={onInputToggle}
            className={cn(
              "h-6 w-12 shrink-0 border-neutral-600 text-[11px]",
              inputActive
                ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                : "text-neutral-300 hover:bg-neutral-700",
            )}
          >
            {togglePending ? "…" : inputActive ? "On" : "Off"}
          </Button>
        )}
      </div>
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
