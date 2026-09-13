import {
  ChevronDownIcon,
  ChevronRightIcon,
  HeadphonesIcon,
  MoreVerticalIcon,
  Settings2Icon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import type { AudioAnalyser } from "../../lib/audio-analyser";
import { formatGainDb } from "../../lib/music";
import { openFilePicker } from "../file-drop-input";
import { InputMeter } from "../input-meter";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";
import { RecorderEffectsToggle } from "./recorder-effects-toggle";
import { RecorderMixToggle } from "./recorder-mix-toggle";
import { RecorderGainSlider } from "./recorder-mixer";

export function AudioTrackActions({
  label,
  onFileChange,
  onRemove,
}: {
  label: string;
  onFileChange: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="size-7 border-neutral-600 text-neutral-300 hover:bg-neutral-700"
          title={`${label} actions`}
        >
          <MoreVerticalIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() =>
            openFilePicker({ accept: "audio/*,.wav", onFile: onFileChange })
          }
        >
          <UploadIcon />
          Replace audio
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemove} className="text-red-400">
          <Trash2Icon />
          Remove track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TrackRow({
  title,
  height,
  gain,
  muted,
  soloed,
  effectsOpen,
  onEffectsToggle,
  action,
  input,
  "data-testid": testId,
  onGainChange,
  onMutedChange,
  onSoloedChange,
  onHeightChange,
  children,
}: {
  title: string;
  height: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  effectsOpen: boolean;
  onEffectsToggle: () => void;
  action?: React.ReactNode;
  input?: TrackInputControls;
  "data-testid"?: string;
  onGainChange: (gain: number) => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  onHeightChange: (height: number) => void;
  children: React.ReactNode;
}) {
  const resizeRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      return { startClientY: event.clientY, startHeight: height };
    },
    onMove: (event, drag) => {
      onHeightChange(drag.startHeight + event.clientY - drag.startClientY);
    },
  });
  return (
    <div
      data-testid={testId}
      className="relative grid grid-cols-[15rem_1fr] border-b border-neutral-700"
      style={{ height }}
    >
      <div
        className={cn(
          "sticky left-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] content-start gap-x-2 border-r border-neutral-700 bg-neutral-800 px-3 py-2",
          input
            ? "grid-rows-[1.75rem_1.5rem_0.75rem_1.5rem] gap-y-1"
            : "grid-rows-[1.75rem_auto] gap-y-2",
        )}
      >
        <div className="min-w-0 self-center truncate text-xs font-semibold">
          {title}
        </div>
        <div className="flex self-center gap-1">
          {action}
          {input && <TrackInputToggle {...input} />}
          <RecorderMixToggle
            active={muted}
            kind="mute"
            onClick={() => onMutedChange(!muted)}
            className="size-7"
            title={muted ? `Unmute ${title}` : `Mute ${title}`}
          />
          <RecorderMixToggle
            active={soloed}
            kind="solo"
            onClick={() => onSoloedChange(!soloed)}
            className="size-7"
            title={soloed ? `Disable ${title} solo` : `Solo ${title}`}
          />
          <RecorderEffectsToggle
            label={title}
            open={effectsOpen}
            onClick={onEffectsToggle}
            className="size-7"
          />
        </div>
        {input && <TrackInputRoute {...input} />}
        <label className="col-span-2 grid grid-cols-[1fr_3.5rem] items-center gap-2 text-[10px] text-neutral-400">
          <RecorderGainSlider
            label={`${title} gain`}
            gain={gain}
            onGainChange={onGainChange}
          />
          <span className="text-right font-mono">{formatGainDb(gain)}</span>
        </label>
      </div>
      {children}
      <div
        ref={resizeRef}
        className="absolute inset-x-0 -bottom-1 z-30 h-2 cursor-ns-resize"
        title={`Resize ${title}`}
      />
    </div>
  );
}

interface TrackInputControls {
  route: string;
  routeNeedsSetup: boolean;
  inputActive: boolean;
  inputAnalyser?: AudioAnalyser;
  inputMonitoring: boolean;
  inputToggleDisabled: boolean;
  onInputSetup: () => void;
  onInputMonitoringChange: (monitoring: boolean) => void;
  onInputToggle: () => void;
}

function TrackInputToggle({
  inputActive,
  inputToggleDisabled,
  onInputToggle,
}: TrackInputControls) {
  return (
    <Button
      data-testid="recorder-input-toggle"
      disabled={inputToggleDisabled}
      onClick={onInputToggle}
      className={
        inputActive
          ? "size-7 border-neutral-600 bg-red-500/35 text-xs font-semibold text-neutral-300 hover:!bg-red-500/40 hover:!text-red-300"
          : "size-7 border-neutral-600 text-xs font-semibold text-neutral-300 hover:bg-neutral-700"
      }
      title={inputActive ? "Disarm capture" : "Arm capture"}
      aria-label={inputActive ? "Disarm capture" : "Arm capture"}
      aria-pressed={inputActive}
    >
      R
    </Button>
  );
}

function TrackInputRoute({
  route,
  routeNeedsSetup,
  inputActive,
  inputAnalyser,
  inputMonitoring,
  onInputSetup,
  onInputMonitoringChange,
}: TrackInputControls) {
  return (
    <>
      <div className="col-span-2 flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px]",
            routeNeedsSetup
              ? "font-medium text-orange-300"
              : "text-neutral-400",
          )}
        >
          {route}
        </span>
        <button
          type="button"
          aria-label="Configure audio input"
          title="Configure audio input"
          onClick={onInputSetup}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200",
            routeNeedsSetup && "text-orange-300 hover:text-orange-200",
          )}
        >
          <Settings2Icon className="size-3.5" />
        </button>
        <button
          type="button"
          data-testid="recorder-input-monitor"
          disabled={!inputActive}
          aria-label={
            inputMonitoring
              ? "Disable input monitoring"
              : "Enable input monitoring"
          }
          aria-pressed={inputMonitoring}
          title={
            inputActive
              ? inputMonitoring
                ? "Disable input monitoring"
                : "Enable input monitoring (use headphones to avoid feedback)"
              : "Enable input first to monitor"
          }
          onClick={() => onInputMonitoringChange(!inputMonitoring)}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200 disabled:pointer-events-none disabled:opacity-30",
            inputMonitoring && "bg-sky-500/25 text-sky-300 hover:bg-sky-500/35",
          )}
        >
          <HeadphonesIcon className="size-3.5" />
        </button>
      </div>
      <div className="col-span-2">
        <InputMeter active={inputActive} analyser={inputAnalyser} compact />
      </div>
    </>
  );
}

export function TakesDisclosureRow({
  expanded,
  takeCount,
  onExpandedChange,
}: {
  expanded: boolean;
  takeCount: number;
  onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <div className="grid h-9 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-900">
      <button
        type="button"
        data-testid="recorder-takes-toggle"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        className="sticky left-0 z-20 flex items-center gap-2 border-r border-neutral-700 bg-neutral-900 px-3 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
      >
        {expanded ? (
          <ChevronDownIcon className="size-3.5 text-neutral-400" />
        ) : (
          <ChevronRightIcon className="size-3.5 text-neutral-400" />
        )}
        Takes
        <span className="text-[10px] font-normal text-neutral-500">
          {takeCount}
        </span>
      </button>
      <div />
    </div>
  );
}

export function TakeTrackRow({
  label,
  muted,
  soloed,
  onMutedChange,
  onSoloedChange,
  onDelete,
  children,
}: {
  label: string;
  muted: boolean;
  soloed: boolean;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="recorder-take-row"
      className="grid h-16 grid-cols-[15rem_1fr] border-b border-neutral-700"
    >
      <div className="sticky left-0 z-20 flex items-center gap-1 border-r border-neutral-700 bg-neutral-900 px-3 py-3 text-xs font-semibold text-neutral-300">
        <span className="mr-auto px-4">{label}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`${label} actions`} className="size-7">
              <MoreVerticalIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDelete}>
              <Trash2Icon />
              Delete take
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RecorderMixToggle
          data-testid="recorder-take-mute"
          aria-label={`Mute ${label}`}
          active={muted}
          kind="mute"
          onClick={() => onMutedChange(!muted)}
          className="size-7"
          title="Mute take"
        />
        <RecorderMixToggle
          data-testid="recorder-take-solo"
          aria-label={`Solo ${label}`}
          active={soloed}
          kind="solo"
          onClick={() => onSoloedChange(!soloed)}
          className="size-7"
          title="Solo take"
        />
      </div>
      {children}
    </div>
  );
}
