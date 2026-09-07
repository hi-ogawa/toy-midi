import { ChevronDownIcon, Repeat2Icon } from "lucide-react";
import type { RecorderLoopState } from "../../lib/recorder/runtime";
import { getBeatsPerBar, secondsToBeats } from "../../lib/timeline";
import type { TimeSignature } from "../../types";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";

export function RecorderRangeControl({
  kind,
  state,
  position,
  tempo,
  timeSignature,
  onChange,
}: {
  kind: "loop" | "punch";
  state: RecorderLoopState;
  position: number;
  tempo: number;
  timeSignature: TimeSignature;
  onChange: (update: Partial<RecorderLoopState>) => void;
}) {
  const label = kind === "loop" ? "Loop" : "Punch";
  const status = !state.range ? "No range" : state.enabled ? "On" : "Off";
  const description = `${label}: ${status.toLowerCase()}`;

  return (
    <div
      className={cn(
        "flex h-9 shrink-0 rounded-md border border-neutral-600",
        kind === "loop" ? "w-15" : "w-22",
      )}
    >
      <Button
        data-testid={`recorder-${kind}-toggle`}
        aria-label={description}
        aria-pressed={state.range ? state.enabled : undefined}
        title={description}
        onClick={() => {
          if (state.range) {
            onChange({ enabled: !state.enabled });
          } else {
            setAtPlayhead();
          }
        }}
        className={cn(
          "min-w-0 flex-1 rounded-r-none border-0 px-2 text-xs font-medium",
          !state.range
            ? "text-neutral-400 hover:bg-neutral-700"
            : kind === "loop"
              ? state.enabled
                ? "bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"
                : "text-violet-300 hover:bg-neutral-700"
              : state.enabled
                ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                : "text-amber-300 hover:bg-neutral-700",
        )}
      >
        {kind === "loop" ? <Repeat2Icon className="size-5 shrink-0" /> : label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`${label} range actions`}
            className="w-6 shrink-0 rounded-l-none border-0 border-l border-neutral-600 text-neutral-400 hover:bg-neutral-700"
          >
            <ChevronDownIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={setAtPlayhead}>
            {state.range ? "Recreate" : "Create"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!state.range}
            onSelect={() => onChange({ range: undefined, enabled: false })}
          >
            Clear
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  function setAtPlayhead() {
    const beatsPerBar = getBeatsPerBar(timeSignature);
    const startBeat =
      Math.floor(secondsToBeats(position, tempo) / beatsPerBar) * beatsPerBar;
    onChange({
      range: { startBeat, endBeat: startBeat + beatsPerBar },
      enabled: true,
    });
  }
}
