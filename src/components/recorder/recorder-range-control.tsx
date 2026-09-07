import {
  ChevronDownIcon,
  PlusIcon,
  Repeat2Icon,
  ScanLineIcon,
} from "lucide-react";
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

  function setAtPlayhead() {
    const beatsPerBar = getBeatsPerBar(timeSignature);
    const startBeat =
      Math.floor(secondsToBeats(position, tempo) / beatsPerBar) * beatsPerBar;
    onChange({
      range: { startBeat, endBeat: startBeat + beatsPerBar },
      enabled: true,
    });
  }

  return (
    <div className="flex h-9 w-15 shrink-0 rounded-md border border-neutral-600">
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
          "relative min-w-0 flex-1 rounded-r-none border-0 px-2 text-xs font-medium",
          state.range && state.enabled
            ? kind === "loop"
              ? "bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"
              : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
            : "text-neutral-300 hover:bg-neutral-700",
        )}
      >
        {kind === "loop" ? (
          <Repeat2Icon className="size-5 shrink-0" />
        ) : (
          <ScanLineIcon className="size-5 shrink-0" />
        )}
        {!state.range && (
          <PlusIcon
            aria-hidden="true"
            className="absolute right-0.5 bottom-0.5 size-3 rounded-sm bg-neutral-800"
            strokeWidth={3}
          />
        )}
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
        <DropdownMenuContent
          align="end"
          alignOffset={-1}
          className="w-15 min-w-0!"
        >
          <DropdownMenuItem onSelect={setAtPlayhead}>New</DropdownMenuItem>
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
}
