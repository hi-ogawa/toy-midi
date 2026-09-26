import {
  ArrowDownIcon,
  ArrowDownWideNarrowIcon,
  ArrowUpIcon,
  ArrowUpNarrowWideIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  HeadphonesIcon,
  MoreVerticalIcon,
  PencilIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { usePointerDrag } from "../../hooks/use-pointer-drag";
import { formatGainDb } from "../../lib/music";
import { openFilePicker } from "../file-drop-input";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../ui/utils";
import { RecorderMixToggle } from "./recorder-mix-toggle";
import { RecorderGainSlider } from "./recorder-mixer";

export function AudioTrackActions({
  label,
  move,
  removeDisabled,
  showClips,
  onShowClipsChange,
  onRename,
  onEffectsOpen,
  onFileChange,
  onRemove,
}: {
  label: string;
  move: TrackMoveControls;
  removeDisabled: boolean;
  showClips: boolean;
  onShowClipsChange: (showClips: boolean) => void;
  onRename: (name: string) => void;
  onEffectsOpen: () => void;
  onFileChange: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TrackMenuButton label={label} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <RenameTrackMenuItem name={label} onRename={onRename} />
        <DropdownMenuItem onSelect={onEffectsOpen}>
          <SlidersHorizontalIcon />
          Effects…
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem
          checked={showClips}
          onCheckedChange={onShowClipsChange}
        >
          Show clips
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            openFilePicker({ accept: "audio/*,.wav", onFile: onFileChange })
          }
        >
          <UploadIcon />
          Replace audio
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <TrackMoveItems {...move} />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={removeDisabled}
          onSelect={onRemove}
          className="text-red-400"
        >
          <Trash2Icon />
          Remove track
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface TrackMoveControls {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: "up" | "down") => void;
}

/** Menu items that move a row one position within the track list. */
export function TrackMoveItems({
  canMoveUp,
  canMoveDown,
  onMove,
}: TrackMoveControls) {
  return (
    <>
      <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove("up")}>
        <ArrowUpIcon />
        Move up
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove("down")}>
        <ArrowDownIcon />
        Move down
      </DropdownMenuItem>
    </>
  );
}

/** Actions trigger that leads each track's control group. */
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
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-neutral-600 text-neutral-300 hover:bg-neutral-700",
        className,
      )}
    >
      <MoreVerticalIcon className="size-3.5" />
    </button>
  );
}

export function RenameTrackMenuItem({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={() => {
        const nextName = window.prompt("Track name", name)?.trim();
        if (nextName && nextName !== name) {
          onRename(nextName);
        }
      }}
    >
      <PencilIcon />
      Rename…
    </DropdownMenuItem>
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
  action,
  recording,
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
  action?: React.ReactNode;
  recording?: TrackRecordingControls;
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
      className="relative grid grid-cols-[15rem_1fr]"
      style={{ height }}
    >
      <div className="sticky left-0 col-start-1 row-start-1 border-r border-neutral-700 bg-neutral-800" />
      <div
        className={cn(
          "sticky left-0 z-20 col-start-1 row-start-1 self-start grid grid-cols-[minmax(0,1fr)_auto] content-start gap-x-2 border-r border-neutral-700 bg-neutral-800 px-3 py-2",
          "grid-rows-[1.75rem_auto] gap-y-2",
          controlsClassName,
        )}
      >
        <div className="min-w-0 self-center truncate text-xs font-semibold">
          {title}
        </div>
        <div className="flex self-center gap-1">
          {action}
          {recording && <TrackRecordingToggles title={title} {...recording} />}
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
        </div>
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

interface TrackRecordingControls {
  armed: boolean;
  armDisabled: boolean;
  monitoring: boolean;
  monitorDisabled: boolean;
  onArmedChange: (armed: boolean) => void;
  onMonitoringChange: (monitoring: boolean) => void;
}

/** Arm chooses where the next take goes; monitor routes input through this track. */
function TrackRecordingToggles({
  title,
  armed,
  armDisabled,
  monitoring,
  monitorDisabled,
  onArmedChange,
  onMonitoringChange,
}: TrackRecordingControls & { title: string }) {
  const armLabel = armed
    ? `Disarm ${title} for recording`
    : `Arm ${title} for recording`;
  const monitorLabel = monitoring
    ? `Disable ${title} input monitoring`
    : `Enable ${title} input monitoring`;
  return (
    <>
      <Button
        data-testid="recorder-arm-toggle"
        disabled={armDisabled}
        onClick={() => onArmedChange(!armed)}
        className={cn(
          "size-6 border-neutral-600 text-xs font-semibold text-neutral-300 hover:bg-neutral-700",
          armed &&
            "border-red-500/60 bg-red-500/35 hover:!bg-red-500/40 hover:!text-red-300",
        )}
        title={armLabel}
        aria-label={armLabel}
        aria-pressed={armed}
      >
        R
      </Button>
      <span
        className="inline-flex"
        title={
          monitorDisabled
            ? "Turn input on and arm this track to monitor"
            : monitoring
              ? monitorLabel
              : `${monitorLabel} (use headphones to avoid feedback)`
        }
      >
        <Button
          data-testid="recorder-input-monitor"
          disabled={monitorDisabled}
          onClick={() => onMonitoringChange(!monitoring)}
          className={cn(
            "size-6 border-neutral-600 text-neutral-300 hover:bg-neutral-700",
            monitoring &&
              "border-sky-500/60 bg-sky-500/25 text-sky-300 hover:bg-sky-500/35",
          )}
          aria-label={monitorLabel}
          aria-pressed={monitoring}
        >
          <HeadphonesIcon className="size-3.5" />
        </Button>
      </span>
    </>
  );
}

export function ClipsDisclosureRow({
  expanded,
  clipCount,
  onExpandedChange,
  newestFirst,
  onNewestFirstChange,
}: {
  expanded: boolean;
  clipCount: number;
  newestFirst: boolean;
  onNewestFirstChange: (newestFirst: boolean) => void;
  onExpandedChange: (expanded: boolean) => void;
}) {
  return (
    <div className="grid h-9 grid-cols-[15rem_1fr] border-b border-neutral-700 bg-neutral-900">
      <div className="relative border-r border-neutral-700">
        <button
          type="button"
          data-testid="recorder-clips-toggle"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="flex h-full w-full items-center gap-2 pl-3 pr-12 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
        >
          {expanded ? (
            <ChevronDownIcon className="size-3.5 text-neutral-400" />
          ) : (
            <ChevronRightIcon className="size-3.5 text-neutral-400" />
          )}
          Clips
          <span className="text-[10px] font-normal text-neutral-500">
            {clipCount}
          </span>
        </button>
        <Button
          data-testid="recorder-clips-order"
          aria-label={
            newestFirst
              ? "Order clips oldest first"
              : "Order clips newest first"
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

export function ClipTrackRow({
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
      data-testid="recorder-clip-row"
      className="grid h-16 grid-cols-[15rem_1fr] border-b border-neutral-700"
    >
      <div className="sticky left-0 z-20 grid grid-cols-[1fr_auto_auto_auto] items-center gap-1 border-r border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300">
        <span className="truncate">{label}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TrackMenuButton label={label} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onDelete}>
              <Trash2Icon />
              Delete clip
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RecorderMixToggle
          data-testid="recorder-clip-mute"
          aria-label={`Mute ${label}`}
          active={muted}
          kind="mute"
          onClick={() => onMutedChange(!muted)}
          className="size-6"
          title="Mute clip"
        />
        <RecorderMixToggle
          data-testid="recorder-clip-solo"
          aria-label={`Solo ${label}`}
          active={soloed}
          kind="solo"
          onClick={() => onSoloedChange(!soloed)}
          className="size-6"
          title="Solo clip"
        />
        <label className="col-span-4 grid grid-cols-[1fr_3.5rem] items-center gap-2 text-[10px] font-normal text-neutral-400">
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
