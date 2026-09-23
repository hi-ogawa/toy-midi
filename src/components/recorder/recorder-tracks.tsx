import {
  ArrowDownWideNarrowIcon,
  ArrowUpNarrowWideIcon,
  AudioWaveformIcon,
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
        <TrackMenuButton label={label} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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

/** Borderless actions trigger placed beside a track name, apart from the toggles. */
export function TrackMenuButton({
  label,
  className,
  ...props
}: { label: string } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      title={`${label} actions`}
      aria-label={`${label} actions`}
      {...props}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200",
        className,
      )}
    >
      <MoreVerticalIcon className="size-3.5" />
    </button>
  );
}

export function TrackRow({
  title,
  "data-testid": testId,
  controlsClassName,
  height,
  gain,
  muted,
  soloed,
  effectsOpen,
  onEffectsToggle,
  action,
  input,
  onGainChange,
  onMutedChange,
  onSoloedChange,
  onHeightChange,
  children,
}: {
  title: string;
  "data-testid"?: string;
  controlsClassName?: string;
  height: number;
  gain: number;
  muted: boolean;
  soloed: boolean;
  effectsOpen: boolean;
  onEffectsToggle: () => void;
  action?: React.ReactNode;
  input?: TrackInputControls;
  onGainChange: (gain: number) => void;
  onMutedChange: (muted: boolean) => void;
  onSoloedChange: (soloed: boolean) => void;
  onHeightChange: (height: number) => void;
  children: React.ReactNode;
}) {
  const resizeRef = usePointerDrag({
    onStart: (event) => {
      event.preventDefault();
      return height;
    },
    onMove: (_event, { data: startHeight, deltaY }) => {
      onHeightChange(startHeight + deltaY);
    },
  });
  return (
    <div
      data-testid={testId}
      className="relative grid grid-cols-[17rem_1fr]"
      style={{ height }}
    >
      <div className="sticky left-0 col-start-1 row-start-1 border-r border-neutral-700 bg-neutral-800" />
      <div
        className={cn(
          "sticky left-0 z-20 col-start-1 row-start-1 self-start grid grid-cols-[minmax(0,1fr)_auto] content-start gap-x-2 border-r border-neutral-700 bg-neutral-800 px-3 py-2",
          input
            ? "grid-rows-[1.75rem_1.5rem_0.75rem_1.5rem] gap-y-1"
            : "grid-rows-[1.75rem_auto] gap-y-2",
          controlsClassName,
        )}
      >
        <div className="flex min-w-0 items-center gap-1 self-center">
          <span className="min-w-0 truncate text-xs font-semibold">
            {title}
          </span>
          {action}
        </div>
        <div className="flex self-center gap-1">
          {input && <TrackInputToggle {...input} />}
          <RecorderMixToggle
            active={muted}
            kind="mute"
            onClick={() => onMutedChange(!muted)}
            className="size-6"
            title={muted ? `Unmute ${title}` : `Mute ${title}`}
          />
          <RecorderMixToggle
            active={soloed}
            kind="solo"
            onClick={() => onSoloedChange(!soloed)}
            className="size-6"
            title={soloed ? `Disable ${title} solo` : `Solo ${title}`}
          />
          <RecorderEffectsToggle
            label={title}
            open={effectsOpen}
            onClick={onEffectsToggle}
            className="size-6"
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
        className="absolute inset-x-0 bottom-0 z-30 h-px cursor-ns-resize border-b border-neutral-700 after:absolute after:inset-x-0 after:-top-1 after:h-2"
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
  tunerOpen: boolean;
  onInputSetup: () => void;
  onInputMonitoringChange: (monitoring: boolean) => void;
  onInputToggle: () => void;
  onTunerToggle: () => void;
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
          ? "size-6 border-neutral-600 bg-red-500/35 text-xs font-semibold text-neutral-300 hover:!bg-red-500/40 hover:!text-red-300"
          : "size-6 border-neutral-600 text-xs font-semibold text-neutral-300 hover:bg-neutral-700"
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
  tunerOpen,
  onTunerToggle,
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
        <button
          type="button"
          aria-label={tunerOpen ? "Close tuner" : "Open tuner"}
          aria-pressed={tunerOpen}
          title={tunerOpen ? "Close tuner" : "Open tuner"}
          onClick={onTunerToggle}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded",
            tunerOpen
              ? "bg-neutral-700 text-neutral-200 hover:bg-neutral-700"
              : "text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200",
          )}
        >
          <AudioWaveformIcon className="size-3.5" />
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
  newestFirst,
  onNewestFirstChange,
}: {
  expanded: boolean;
  takeCount: number;
  newestFirst: boolean;
  onNewestFirstChange: (newestFirst: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <div className="grid h-9 grid-cols-[17rem_1fr] border-b border-neutral-700 bg-neutral-900">
      <div className="relative border-r border-neutral-700">
        <button
          type="button"
          data-testid="recorder-takes-toggle"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="flex h-full w-full items-center gap-2 pl-3 pr-12 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
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
        <Button
          data-testid="recorder-takes-order"
          aria-label={
            newestFirst
              ? "Order takes oldest first"
              : "Order takes newest first"
          }
          title={
            newestFirst
              ? "Newest first · Click for oldest first"
              : "Oldest first · Click for newest first"
          }
          onClick={() => onNewestFirstChange(!newestFirst)}
          className="absolute right-3 top-1/2 size-6 -translate-y-1/2 border-transparent text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        >
          {newestFirst ? (
            <ArrowDownWideNarrowIcon className="size-3.5" />
          ) : (
            <ArrowUpNarrowWideIcon className="size-3.5" />
          )}
        </Button>
      </div>
      <div />
    </div>
  );
}

export function TakeTrackRow({
  label,
  gain,
  onGainChange,
  muted,
  soloed,
  onMutedChange,
  onSoloedChange,
  onDelete,
  children,
}: {
  label: string;
  gain: number;
  onGainChange: (gain: number) => void;
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
      className="grid h-16 grid-cols-[17rem_1fr] border-b border-neutral-700"
    >
      <div className="sticky left-0 z-20 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 border-r border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate">{label}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TrackMenuButton label={label} />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={onDelete}>
                <Trash2Icon />
                Delete take
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <RecorderMixToggle
          data-testid="recorder-take-mute"
          aria-label={`Mute ${label}`}
          active={muted}
          kind="mute"
          onClick={() => onMutedChange(!muted)}
          className="size-6"
          title="Mute take"
        />
        <RecorderMixToggle
          data-testid="recorder-take-solo"
          aria-label={`Solo ${label}`}
          active={soloed}
          kind="solo"
          onClick={() => onSoloedChange(!soloed)}
          className="size-6"
          title="Solo take"
        />
        <label className="col-span-3 grid grid-cols-[1fr_3.5rem] items-center gap-2 text-[10px] font-normal text-neutral-400">
          <RecorderGainSlider
            label={`${label} gain`}
            gain={gain}
            onGainChange={onGainChange}
          />
          <span className="text-right font-mono">{formatGainDb(gain)}</span>
        </label>
      </div>
      {children}
    </div>
  );
}
